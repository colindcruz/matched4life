import { useMemo, useState } from "react";
import { SignOutButton, useAuth, useUser } from "@clerk/clerk-react";
import { Redirect, useLocation } from "wouter";
import { motion } from "framer-motion";
import { getCountries, getCountryCallingCode } from "libphonenumber-js";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/app-store";

type VerifyStep = "phone" | "otp";
type CountryCodeOption = {
  value: string;
  country: string;
  dialCode: string;
  label: string;
};

type SendOtpResult = {
  ok: boolean;
  requestId?: string;
  error?: string;
};

const REGION_NAMES = new Intl.DisplayNames(["en"], { type: "region" });

const COUNTRY_CODE_OPTIONS: CountryCodeOption[] = getCountries()
  .map((country) => {
    const countryName = REGION_NAMES.of(country) ?? country;
    const dialCode = `+${getCountryCallingCode(country)}`;
    return {
      value: country,
      country,
      dialCode,
      label: `${countryName} (${country}) ${dialCode}`,
    };
  })
  .sort((a, b) => {
    if (a.label.includes("(IN)")) return -1;
    if (b.label.includes("(IN)")) return 1;
    return a.label.localeCompare(b.label);
  });

const SEND_OTP_API_URL = import.meta.env.VITE_SEND_OTP_API_URL ?? "/api/otp/send";
const VERIFY_OTP_API_URL = import.meta.env.VITE_VERIFY_OTP_API_URL ?? "/api/otp/verify";
const REQUEST_TIMEOUT_MS = 15000;

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function requestOtp(params: {
  countryCode: string;
  phoneNumber: string;
  userId: string;
}): Promise<SendOtpResult> {
  const response = await fetchWithTimeout(SEND_OTP_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      countryCode: params.countryCode,
      phoneNumber: params.phoneNumber,
      userId: params.userId,
      fullPhoneNumber: `${params.countryCode}${params.phoneNumber}`,
    }),
  }).catch(async (error: unknown) => {
    if (error instanceof DOMException && error.name === "AbortError") {
      return new Response(
        JSON.stringify({ ok: false, error: "Request timed out while sending OTP." }),
        { status: 408, headers: { "Content-Type": "application/json" } }
      );
    }
    throw error;
  });

  if (!response.ok) {
    let error = "Could not send OTP.";
    try {
      const data = (await response.json()) as { error?: string; retryAfterMs?: number };
      if (data.error) {
        error = data.error;
      }
      if (typeof data.retryAfterMs === "number" && data.retryAfterMs > 0) {
        error = `${error} Try again in ${Math.ceil(data.retryAfterMs / 1000)}s.`;
      }
    } catch {
      const responseText = await response.text().catch(() => "");
      if (responseText) {
        error = `${error} [HTTP ${response.status}] ${responseText.slice(0, 140)}`;
      } else {
        error = `${error} [HTTP ${response.status}]`;
      }
    }
    return { ok: false, error };
  }

  const data = (await response.json()) as { requestId?: string };
  if (!data.requestId) {
    return { ok: false, error: "OTP service response was incomplete." };
  }

  return { ok: true, requestId: data.requestId };
}

async function verifyOtp(params: {
  countryCode: string;
  phoneNumber: string;
  userId: string;
  requestId: string;
  otp: string;
  fullName?: string;
  email?: string;
}) {
  const response = await fetchWithTimeout(VERIFY_OTP_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      countryCode: params.countryCode,
      phoneNumber: params.phoneNumber,
      userId: params.userId,
      requestId: params.requestId,
      otp: params.otp,
      fullName: params.fullName,
      email: params.email,
      fullPhoneNumber: `${params.countryCode}${params.phoneNumber}`,
    }),
  }).catch(async (error: unknown) => {
    if (error instanceof DOMException && error.name === "AbortError") {
      return new Response(
        JSON.stringify({ ok: false, error: "Request timed out while verifying OTP." }),
        { status: 408, headers: { "Content-Type": "application/json" } }
      );
    }
    throw error;
  });

  if (!response.ok) {
    let error = "OTP verification failed.";
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) {
        error = data.error;
      }
    } catch {
      const responseText = await response.text().catch(() => "");
      if (responseText) {
        error = `${error} [HTTP ${response.status}] ${responseText.slice(0, 140)}`;
      } else {
        error = `${error} [HTTP ${response.status}]`;
      }
    }
    return { ok: false as const, error };
  }

  const data = (await response.json()) as {
    persistence?: { persisted?: boolean; reason?: string };
  };

  return {
    ok: true as const,
    persistence: {
      persisted: Boolean(data.persistence?.persisted),
      reason: data.persistence?.reason,
    },
  };
}

export function PhoneVerificationPage() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { user } = useUser();
  const [, navigate] = useLocation();
  const phoneVerificationByUserId = useAppStore((state) => state.phoneVerificationByUserId);
  const setPhoneVerifiedForUser = useAppStore((state) => state.setPhoneVerifiedForUser);
  const setOtpPersistenceForUser = useAppStore((state) => state.setOtpPersistenceForUser);

  const [step, setStep] = useState<VerifyStep>("phone");
  const [selectedCountry, setSelectedCountry] = useState("IN");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [otpRequestId, setOtpRequestId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const firstName = user?.firstName?.trim() || "there";
  const isAlreadyVerified = Boolean(userId && phoneVerificationByUserId[userId]);
  const phoneValue = useMemo(() => phoneNumber.replace(/[^\d]/g, ""), [phoneNumber]);
  const selectedCountryOption = useMemo(
    () =>
      COUNTRY_CODE_OPTIONS.find((option) => option.country === selectedCountry) ??
      COUNTRY_CODE_OPTIONS[0],
    [selectedCountry]
  );
  const countryCode = selectedCountryOption?.dialCode ?? "+1";

  if (!isLoaded) {
    return null;
  }

  if (!isSignedIn) {
    return <Redirect to="/auth" />;
  }

  if (isAlreadyVerified) {
    return <Redirect to="/welcome" />;
  }

  async function handleSendOtp() {
    setError(null);
    setInfo(null);

    if (phoneValue.length < 7) {
      setError("Please enter a valid mobile number.");
      return;
    }

    if (!userId) {
      setError("Could not verify user session. Please sign in again.");
      return;
    }

    setLoading(true);
    try {
      const result = await requestOtp({
        countryCode,
        phoneNumber: phoneValue,
        userId,
      });

      if (!result.ok || !result.requestId) {
        setError(result.error ?? "Could not send OTP. Please try again.");
        return;
      }

      setOtpRequestId(result.requestId);
      setStep("otp");
      setInfo(`OTP sent to ${countryCode} ${phoneValue}.`);
    } catch {
      setError("Failed to send OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    if (!userId) {
      setError("Could not verify user session. Please sign in again.");
      return;
    }

    setError(null);
    setInfo(null);

    if (otp.trim().length < 4) {
      setError("Please enter a valid OTP.");
      return;
    }

    if (!otpRequestId) {
      setError("Please request a new OTP.");
      return;
    }

    setLoading(true);
    try {
      const result = await verifyOtp({
        countryCode,
        phoneNumber: phoneValue,
        userId,
        requestId: otpRequestId,
        otp: otp.trim(),
        fullName: user?.fullName ?? undefined,
        email: user?.primaryEmailAddress?.emailAddress ?? undefined,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setOtpPersistenceForUser(userId, {
        persisted: result.persistence.persisted,
        reason: result.persistence.reason,
      });
      setPhoneVerifiedForUser(userId, true);
      navigate("/welcome", { replace: true });
    } catch {
      setError("OTP verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="m4l-hero-image min-h-screen">
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-transparent"
      >
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 text-white md:px-6">
          <div className="flex items-center gap-2">
            <img
              src="https://www.matched4life.com/wp-content/uploads/2022/10/Untitled-design-16.png"
              alt="Matched4Life logo"
              className="h-[4.5rem] w-[4.5rem] object-contain"
            />
            <p className="font-display text-4xl font-semibold">matched4life</p>
          </div>
          <SignOutButton>
            <Button className="bg-white/35 text-white hover:bg-white/50">Sign Out</Button>
          </SignOutButton>
        </div>
      </motion.header>

      <main className="flex w-full items-center justify-center px-4 py-8 md:justify-start md:px-3 md:py-16 lg:px-4 xl:justify-start xl:px-6 2xl:px-8">
        <div className="w-full max-w-xl rounded-3xl border border-[#ffc5be]/80 bg-[linear-gradient(170deg,rgba(255,250,249,0.96),rgba(255,236,232,0.92))] p-6 shadow-2xl backdrop-blur-md md:p-8">
          <h1 className="font-display text-3xl font-semibold text-[#2d2b31]">Verify Mobile Number</h1>
          <p className="mt-2 text-[#6c6770]">
            Hi {firstName}, verify your number to continue to the next page.
          </p>

          {step === "phone" ? (
            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-[#3a3740]">Country Code</label>
                <select
                  className="w-full rounded-xl bg-white px-4 py-3 text-[#2d2b31] shadow-sm outline-none ring-0"
                  value={selectedCountry}
                  onChange={(event) => setSelectedCountry(event.target.value)}
                >
                  {COUNTRY_CODE_OPTIONS.map((code) => (
                    <option key={code.label} value={code.value}>
                      {code.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-[#3a3740]">Mobile Number</label>
                <input
                  type="tel"
                  className="w-full rounded-xl bg-white px-4 py-3 text-[#2d2b31] shadow-sm outline-none ring-0"
                  placeholder="Enter mobile number"
                  value={phoneNumber}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                />
              </div>

              <Button
                className="w-full bg-[#ff6f61] text-white hover:bg-[#f45f50]"
                onClick={handleSendOtp}
                disabled={loading}
              >
                {loading ? "Sending OTP..." : "Send OTP"}
              </Button>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-[#3a3740]">Enter OTP</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  className="w-full rounded-xl bg-white px-4 py-3 text-[#2d2b31] shadow-sm outline-none ring-0"
                  placeholder="Enter OTP"
                  value={otp}
                  onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))}
                />
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 border-[#ffc5be] text-[#5b5561]"
                  onClick={() => {
                    setStep("phone");
                    setOtp("");
                    setOtpRequestId(null);
                    setError(null);
                  }}
                  disabled={loading}
                >
                  Change Number
                </Button>
                <Button
                  className="flex-1 bg-[#ff6f61] text-white hover:bg-[#f45f50]"
                  onClick={handleVerifyOtp}
                  disabled={loading}
                >
                  {loading ? "Verifying..." : "Verify OTP"}
                </Button>
              </div>
            </div>
          )}

          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
          {info ? <p className="mt-4 text-sm text-[#6c6770]">{info}</p> : null}
        </div>
      </main>
    </div>
  );
}
