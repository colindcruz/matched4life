import dotenv from "dotenv";
import { createServer } from "node:http";
import { randomInt, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { fileURLToPath } from "node:url";
import path from "node:path";

const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".env");
dotenv.config({ path: envPath, override: true });

const PORT = Number(process.env.OTP_SERVER_PORT ?? 8787);
const OTP_LENGTH = 4;
const OTP_TTL_MS = Number(process.env.OTP_TTL_MS ?? 5 * 60 * 1000);
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS ?? 5);
const RESEND_COOLDOWN_MS = Number(process.env.OTP_RESEND_COOLDOWN_MS ?? 30 * 1000);
const OTP_DISPATCH_WEBHOOK_URL =
  process.env.OTP_DISPATCH_WEBHOOK_URL ??
  "https://connect.pabbly.com/workflow/sendwebhookdata/IjU3NjcwNTZjMDYzZjA0MzQ1MjY5NTUzNTUxMzUi_pc";
const OTP_WEBHOOK_TIMEOUT_MS = Number(process.env.OTP_WEBHOOK_TIMEOUT_MS ?? 10000);
const CONVEX_URL = process.env.CONVEX_URL ?? "";
const CONVEX_ADMIN_KEY = process.env.CONVEX_ADMIN_KEY ?? "";
const CONVEX_BACKEND_WRITE_KEY = process.env.CONVEX_BACKEND_WRITE_KEY ?? "";
const BACKEND_TEAM_CLERK_USER_IDS = new Set(
  String(process.env.BACKEND_TEAM_CLERK_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);
const MOBILE_ALREADY_LINKED_ERROR =
  "This mobile number is already linked to another account. Each number can only be used with one profile. Please use a different mobile number.";

const otpStore = new Map();
const latestRequestByUserPhone = new Map();
const resendGuardByUserPhone = new Map();
let convexClient = null;

function jsonResponse(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS,GET",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(JSON.stringify(payload));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Body too large"));
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function generateOtp() {
  return randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, "0");
}

function hashOtp(otp, salt) {
  return scryptSync(otp, salt, 64).toString("hex");
}

function isOtpEqual(otp, salt, otpHash) {
  const incomingHash = hashOtp(otp, salt);
  const incomingBuffer = Buffer.from(incomingHash, "hex");
  const storedBuffer = Buffer.from(otpHash, "hex");
  if (incomingBuffer.length !== storedBuffer.length) return false;
  return timingSafeEqual(incomingBuffer, storedBuffer);
}

function normalizeCountryCode(countryCode) {
  return String(countryCode ?? "").trim();
}

function normalizePhone(phoneNumber) {
  return String(phoneNumber ?? "").replace(/[^\d]/g, "");
}

function keyFor(userId, countryCode, phoneNumber) {
  return `${userId}::${countryCode}${phoneNumber}`;
}

async function dispatchOtpWebhook(payload) {
  if (!OTP_DISPATCH_WEBHOOK_URL) {
    return { ok: true };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OTP_WEBHOOK_TIMEOUT_MS);
    const response = await fetch(OTP_DISPATCH_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        ok: false,
        error: `Webhook returned HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
      };
    }

    return { ok: true };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return {
        ok: false,
        error: `Webhook timeout after ${OTP_WEBHOOK_TIMEOUT_MS}ms`,
      };
    }
    return {
      ok: false,
      error: `Webhook request failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

function cleanupExpiredOtps() {
  const now = Date.now();
  for (const [requestId, record] of otpStore.entries()) {
    if (record.expiresAt <= now) {
      otpStore.delete(requestId);
      latestRequestByUserPhone.delete(record.key);
    }
  }
}

function getConvexClient() {
  if (!CONVEX_URL || !CONVEX_ADMIN_KEY) {
    return null;
  }
  if (convexClient) {
    return convexClient;
  }

  const client = new ConvexHttpClient(CONVEX_URL);
  client.setAdminAuth(CONVEX_ADMIN_KEY);
  convexClient = client;
  return client;
}

async function persistPrivateProfileToConvex({
  clerkUserId,
  countryCode,
  phoneNumber,
  fullPhoneNumber,
  email,
  fullName,
  address,
  churchName,
}) {
  const client = getConvexClient();
  if (!client) {
    return { persisted: false, reason: "Convex is not configured." };
  }

  if (!CONVEX_BACKEND_WRITE_KEY) {
    throw new Error("Missing CONVEX_BACKEND_WRITE_KEY for secure backend writes.");
  }

  await client.mutation("privateProfiles:upsertFromBackendVerifiedPhone", {
    clerkUserId,
    countryCode,
    phoneNumber,
    fullPhoneNumber,
    email,
    fullName,
    address,
    churchName,
    serviceToken: CONVEX_BACKEND_WRITE_KEY,
  });

  return { persisted: true };
}

async function setLaunchNotifyToConvex({ clerkUserId, launchNotifyOptIn }) {
  const client = getConvexClient();
  if (!client) {
    throw new Error("Convex is not configured.");
  }
  if (!CONVEX_BACKEND_WRITE_KEY) {
    throw new Error("Missing CONVEX_BACKEND_WRITE_KEY for secure backend writes.");
  }

  await client.mutation("privateProfiles:setLaunchNotifyFromBackend", {
    clerkUserId,
    launchNotifyOptIn,
    serviceToken: CONVEX_BACKEND_WRITE_KEY,
  });
}

async function getLaunchNotifyFromConvex({ clerkUserId }) {
  const client = getConvexClient();
  if (!client) {
    throw new Error("Convex is not configured.");
  }
  if (!CONVEX_BACKEND_WRITE_KEY) {
    throw new Error("Missing CONVEX_BACKEND_WRITE_KEY for secure backend reads.");
  }

  const result = await client.query("privateProfiles:getLaunchNotifyForBackend", {
    clerkUserId,
    serviceToken: CONVEX_BACKEND_WRITE_KEY,
  });

  return {
    launchNotifyOptIn: Boolean(result?.launchNotifyOptIn),
    launchNotifyUpdatedAt: result?.launchNotifyUpdatedAt,
  };
}

async function isPhoneLinkedToDifferentUser({ clerkUserId, fullPhoneNumber }) {
  const client = getConvexClient();
  if (!client || !CONVEX_BACKEND_WRITE_KEY) {
    return false;
  }

  try {
    const result = await client.query("privateProfiles:getPhoneOwnerForBackend", {
      fullPhoneNumber,
      serviceToken: CONVEX_BACKEND_WRITE_KEY,
    });
    const owners = Array.isArray(result?.clerkUserIds) ? result.clerkUserIds : [];
    return owners.some((ownerId) => ownerId && ownerId !== clerkUserId);
  } catch (error) {
    console.error("Failed to check phone ownership in Convex", error);
    return false;
  }
}

async function handleSendOtp(req, res) {
  const body = await parseJsonBody(req);
  const userId = String(body.userId ?? "").trim();
  const countryCode = normalizeCountryCode(body.countryCode);
  const phoneNumber = normalizePhone(body.phoneNumber);

  if (!userId || !countryCode || phoneNumber.length < 7) {
    jsonResponse(res, 400, { ok: false, error: "Invalid payload." });
    return;
  }

  const now = Date.now();
  const key = keyFor(userId, countryCode, phoneNumber);
  const fullPhoneNumber = `${countryCode}${phoneNumber}`;

  const isLinkedElsewhere = await isPhoneLinkedToDifferentUser({
    clerkUserId: userId,
    fullPhoneNumber,
  });
  if (isLinkedElsewhere) {
    jsonResponse(res, 409, { ok: false, error: MOBILE_ALREADY_LINKED_ERROR });
    return;
  }

  const lastSentAt = resendGuardByUserPhone.get(key) ?? 0;
  if (now - lastSentAt < RESEND_COOLDOWN_MS) {
    jsonResponse(res, 429, {
      ok: false,
      error: "Please wait before requesting another OTP.",
      retryAfterMs: RESEND_COOLDOWN_MS - (now - lastSentAt),
    });
    return;
  }

  const otp = generateOtp();
  const salt = randomUUID();
  const otpHash = hashOtp(otp, salt);
  const requestId = randomUUID();

  otpStore.set(requestId, {
    requestId,
    key,
    userId,
    countryCode,
    phoneNumber,
    fullPhoneNumber,
    otpHash,
    salt,
    attempts: 0,
    createdAt: now,
    expiresAt: now + OTP_TTL_MS,
  });
  latestRequestByUserPhone.set(key, requestId);
  resendGuardByUserPhone.set(key, now);

  const webhookResult = await dispatchOtpWebhook({
    requestId,
    userId,
    countryCode,
    phoneNumber,
    fullPhoneNumber,
    otp,
    createdAt: now,
    expiresAt: now + OTP_TTL_MS,
  });

  if (!webhookResult.ok) {
    otpStore.delete(requestId);
    latestRequestByUserPhone.delete(key);
    const errorMessage = webhookResult.error ?? "Failed to dispatch OTP.";
    const statusCode = errorMessage.includes("HTTP 429") ? 429 : 502;
    jsonResponse(res, statusCode, { ok: false, error: errorMessage });
    return;
  }

  jsonResponse(res, 200, {
    ok: true,
    requestId,
    expiresAt: now + OTP_TTL_MS,
  });
}

async function handleVerifyOtp(req, res) {
  const body = await parseJsonBody(req);
  const userId = String(body.userId ?? "").trim();
  const countryCode = normalizeCountryCode(body.countryCode);
  const phoneNumber = normalizePhone(body.phoneNumber);
  const email = typeof body.email === "string" ? body.email.trim() : undefined;
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : undefined;
  const address = typeof body.address === "string" ? body.address.trim() : undefined;
  const churchName = typeof body.churchName === "string" ? body.churchName.trim() : undefined;
  const otp = normalizePhone(body.otp);
  const requestId = String(body.requestId ?? "").trim();

  if (!userId || !countryCode || phoneNumber.length < 7 || otp.length < 4) {
    jsonResponse(res, 400, { ok: false, error: "Invalid payload." });
    return;
  }

  const key = keyFor(userId, countryCode, phoneNumber);
  const latestRequestId = latestRequestByUserPhone.get(key);
  const candidateRequestIds = [];
  if (latestRequestId) {
    candidateRequestIds.push(latestRequestId);
  }
  if (requestId) {
    candidateRequestIds.push(requestId);
  }
  const uniqueCandidateRequestIds = [...new Set(candidateRequestIds)];

  if (uniqueCandidateRequestIds.length === 0) {
    jsonResponse(res, 404, { ok: false, error: "OTP request not found." });
    return;
  }

  const candidateRecords = uniqueCandidateRequestIds
    .map((candidateRequestId) => otpStore.get(candidateRequestId))
    .filter((candidateRecord) => candidateRecord && candidateRecord.key === key);

  if (candidateRecords.length === 0) {
    jsonResponse(res, 404, { ok: false, error: "OTP request not found." });
    return;
  }

  let record = candidateRecords.find((candidateRecord) => candidateRecord.expiresAt > Date.now());
  if (!record) {
    for (const expiredRecord of candidateRecords) {
      otpStore.delete(expiredRecord.requestId);
    }
    latestRequestByUserPhone.delete(key);
    jsonResponse(res, 410, { ok: false, error: "OTP expired." });
    return;
  }

  record.attempts += 1;
  if (record.attempts > OTP_MAX_ATTEMPTS) {
    otpStore.delete(record.requestId);
    latestRequestByUserPhone.delete(key);
    jsonResponse(res, 429, { ok: false, error: "Maximum OTP attempts exceeded." });
    return;
  }

  const isValid = isOtpEqual(otp, record.salt, record.otpHash);
  if (!isValid) {
    jsonResponse(res, 401, { ok: false, error: "Invalid OTP." });
    return;
  }

  otpStore.delete(record.requestId);
  latestRequestByUserPhone.delete(key);

  let persistence = { persisted: false, reason: "Not attempted." };
  try {
    persistence = await persistPrivateProfileToConvex({
      clerkUserId: userId,
      countryCode,
      phoneNumber,
      fullPhoneNumber: record.fullPhoneNumber,
      email,
      fullName,
      address,
      churchName,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown persistence error";
    console.error("Failed to persist private profile to Convex", error);
    persistence = { persisted: false, reason: message };
  }

  jsonResponse(res, 200, {
    ok: true,
    verified: true,
    userId,
    fullPhoneNumber: record.fullPhoneNumber,
    persistence,
  });
}

async function handleAdminListPrivateProfiles(req, res) {
  const body = await parseJsonBody(req);
  const requesterUserId = String(body.requesterUserId ?? "").trim();
  const requestedLimit = Number(body.limit ?? 200);
  const limit = Number.isFinite(requestedLimit) ? requestedLimit : 200;

  if (!requesterUserId) {
    jsonResponse(res, 400, { ok: false, error: "Missing requesterUserId." });
    return;
  }

  if (!BACKEND_TEAM_CLERK_USER_IDS.has(requesterUserId)) {
    jsonResponse(res, 403, { ok: false, error: "Forbidden." });
    return;
  }

  const client = getConvexClient();
  if (!client) {
    jsonResponse(res, 503, { ok: false, error: "Convex is not configured." });
    return;
  }

  if (!CONVEX_BACKEND_WRITE_KEY) {
    jsonResponse(res, 503, { ok: false, error: "CONVEX_BACKEND_WRITE_KEY is not configured." });
    return;
  }

  try {
    const rows = await client.query("privateProfiles:listPrivateProfilesForBackendTeam", {
      serviceToken: CONVEX_BACKEND_WRITE_KEY,
      limit,
    });
    jsonResponse(res, 200, { ok: true, rows });
  } catch (error) {
    console.error("Failed to load private profiles from Convex", error);
    jsonResponse(res, 502, { ok: false, error: "Failed to load private profiles." });
  }
}

async function handleGetLaunchNotify(req, res) {
  const body = await parseJsonBody(req);
  const userId = String(body.userId ?? "").trim();
  if (!userId) {
    jsonResponse(res, 400, { ok: false, error: "Missing userId." });
    return;
  }

  try {
    const data = await getLaunchNotifyFromConvex({ clerkUserId: userId });
    jsonResponse(res, 200, { ok: true, ...data });
  } catch (error) {
    console.error("Failed to get launch notify preference", error);
    jsonResponse(res, 502, { ok: false, error: "Failed to load notification preference." });
  }
}

async function handleSetLaunchNotify(req, res) {
  const body = await parseJsonBody(req);
  const userId = String(body.userId ?? "").trim();
  const launchNotifyOptIn = Boolean(body.launchNotifyOptIn);
  if (!userId) {
    jsonResponse(res, 400, { ok: false, error: "Missing userId." });
    return;
  }

  try {
    await setLaunchNotifyToConvex({
      clerkUserId: userId,
      launchNotifyOptIn,
    });
    jsonResponse(res, 200, { ok: true, launchNotifyOptIn });
  } catch (error) {
    console.error("Failed to set launch notify preference", error);
    jsonResponse(res, 502, { ok: false, error: "Failed to save notification preference." });
  }
}

const server = createServer(async (req, res) => {
  cleanupExpiredOtps();

  if (req.method === "OPTIONS") {
    jsonResponse(res, 204, {});
    return;
  }

  if (req.method === "GET" && req.url === "/api/otp/health") {
    jsonResponse(res, 200, { ok: true });
    return;
  }

  try {
    if (req.method === "POST" && req.url === "/api/otp/send") {
      await handleSendOtp(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/api/otp/verify") {
      await handleVerifyOtp(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/api/private-profiles/admin-list") {
      await handleAdminListPrivateProfiles(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/api/private-profiles/launch-notify/get") {
      await handleGetLaunchNotify(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/api/private-profiles/launch-notify/set") {
      await handleSetLaunchNotify(req, res);
      return;
    }

    jsonResponse(res, 404, { ok: false, error: "Not found" });
  } catch (error) {
    console.error("OTP server error", error);
    jsonResponse(res, 500, { ok: false, error: "Server error" });
  }
});

server.listen(PORT, () => {
  console.log(`OTP server listening on http://localhost:${PORT}`);
  console.log(`OTP webhook target: ${OTP_DISPATCH_WEBHOOK_URL}`);
  console.log(`OTP webhook timeout: ${OTP_WEBHOOK_TIMEOUT_MS}ms`);
  console.log(`Convex private persistence: ${CONVEX_URL && CONVEX_ADMIN_KEY ? "enabled" : "disabled"}`);
  console.log(
    `Backend team access list: ${BACKEND_TEAM_CLERK_USER_IDS.size > 0 ? "configured" : "not configured"}`
  );
  if (CONVEX_BACKEND_WRITE_KEY && CONVEX_BACKEND_WRITE_KEY.length < 8) {
    console.warn(
      "Warning: CONVEX_BACKEND_WRITE_KEY looks too short. If it includes '#', wrap it in quotes in server/.env."
    );
  }
});
