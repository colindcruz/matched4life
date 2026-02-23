import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getMyPrivateProfile = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const now = Date.now();
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .first();

    const userId =
      existingUser?._id ??
      (await ctx.db.insert("users", {
        tokenIdentifier: identity.tokenIdentifier,
        clerkUserId: identity.subject,
        email: identity.email,
        fullName: identity.name,
        createdAt: now,
        updatedAt: now,
      }));

    if (existingUser) {
      await ctx.db.patch(existingUser._id, {
        clerkUserId: identity.subject,
        email: identity.email,
        fullName: identity.name,
        updatedAt: now,
      });
    }

    return await ctx.db
      .query("privateProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
  },
});

export const upsertMyPrivateProfile = mutation({
  args: {
    fullName: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    churchName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const now = Date.now();
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .first();

    const userId =
      existingUser?._id ??
      (await ctx.db.insert("users", {
        tokenIdentifier: identity.tokenIdentifier,
        clerkUserId: identity.subject,
        email: identity.email,
        fullName: identity.name,
        createdAt: now,
        updatedAt: now,
      }));

    if (existingUser) {
      await ctx.db.patch(existingUser._id, {
        clerkUserId: identity.subject,
        email: identity.email,
        fullName: identity.name,
        updatedAt: now,
      });
    }

    const existingProfile = await ctx.db
      .query("privateProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (existingProfile) {
      await ctx.db.patch(existingProfile._id, {
        ...args,
        updatedAt: now,
      });
      return existingProfile._id;
    }

    return await ctx.db.insert("privateProfiles", {
      userId,
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const upsertFromBackendVerifiedPhone = mutation({
  args: {
    clerkUserId: v.string(),
    countryCode: v.string(),
    phoneNumber: v.string(),
    fullPhoneNumber: v.string(),
    email: v.optional(v.string()),
    fullName: v.optional(v.string()),
    address: v.optional(v.string()),
    churchName: v.optional(v.string()),
    serviceToken: v.string(),
  },
  handler: async (ctx, args) => {
    const configuredToken = process.env.CONVEX_BACKEND_WRITE_KEY;
    if (!configuredToken || args.serviceToken !== configuredToken) {
      throw new Error("Unauthorized backend write");
    }

    const now = Date.now();
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();

    const userId =
      user?._id ??
      (await ctx.db.insert("users", {
        tokenIdentifier: `backend:${args.clerkUserId}`,
        clerkUserId: args.clerkUserId,
        email: args.email,
        fullName: args.fullName,
        createdAt: now,
        updatedAt: now,
      }));

    if (user) {
      await ctx.db.patch(user._id, {
        email: args.email ?? user.email,
        fullName: args.fullName ?? user.fullName,
        updatedAt: now,
      });
    }

    const existingProfile = await ctx.db
      .query("privateProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    const profilePatch = {
      email: args.email,
      fullName: args.fullName,
      address: args.address,
      churchName: args.churchName,
      phoneCountryCode: args.countryCode,
      phoneNumber: args.phoneNumber,
      fullPhoneNumber: args.fullPhoneNumber,
      phoneVerifiedAt: now,
      updatedAt: now,
    };

    if (existingProfile) {
      await ctx.db.patch(existingProfile._id, profilePatch);
      return existingProfile._id;
    }

    return await ctx.db.insert("privateProfiles", {
      userId,
      ...profilePatch,
      createdAt: now,
    });
  },
});

export const listPrivateProfilesForBackendTeam = query({
  args: {
    serviceToken: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const configuredToken = process.env.CONVEX_BACKEND_WRITE_KEY;
    if (!configuredToken || args.serviceToken !== configuredToken) {
      throw new Error("Unauthorized backend read");
    }

    const rowLimit = Math.min(Math.max(args.limit ?? 100, 1), 500);
    const profiles = await ctx.db.query("privateProfiles").order("desc").take(rowLimit);

    const userIds = [...new Set(profiles.map((profile) => profile.userId))];
    const users = await Promise.all(userIds.map((userId) => ctx.db.get(userId)));
    const usersById = new Map(users.filter(Boolean).map((user) => [user!._id, user!]));

    return profiles.map((profile) => {
      const user = usersById.get(profile.userId);
      return {
        clerkUserId: user?.clerkUserId ?? "",
        fullName: profile.fullName ?? user?.fullName,
        email: profile.email ?? user?.email,
        countryCode: profile.phoneCountryCode,
        phoneNumber: profile.phoneNumber,
        fullPhoneNumber: profile.fullPhoneNumber,
        churchName: profile.churchName,
        address: profile.address,
        launchNotifyOptIn: profile.launchNotifyOptIn,
        launchNotifyUpdatedAt: profile.launchNotifyUpdatedAt,
        phoneVerifiedAt: profile.phoneVerifiedAt,
        updatedAt: profile.updatedAt,
      };
    });
  },
});

export const setLaunchNotifyFromBackend = mutation({
  args: {
    clerkUserId: v.string(),
    launchNotifyOptIn: v.boolean(),
    serviceToken: v.string(),
  },
  handler: async (ctx, args) => {
    const configuredToken = process.env.CONVEX_BACKEND_WRITE_KEY;
    if (!configuredToken || args.serviceToken !== configuredToken) {
      throw new Error("Unauthorized backend write");
    }

    const now = Date.now();
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();

    const userId =
      user?._id ??
      (await ctx.db.insert("users", {
        tokenIdentifier: `backend:${args.clerkUserId}`,
        clerkUserId: args.clerkUserId,
        createdAt: now,
        updatedAt: now,
      }));

    if (user) {
      await ctx.db.patch(user._id, {
        updatedAt: now,
      });
    }

    const existingProfile = await ctx.db
      .query("privateProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (existingProfile) {
      await ctx.db.patch(existingProfile._id, {
        launchNotifyOptIn: args.launchNotifyOptIn,
        launchNotifyUpdatedAt: now,
        updatedAt: now,
      });
      return existingProfile._id;
    }

    return await ctx.db.insert("privateProfiles", {
      userId,
      launchNotifyOptIn: args.launchNotifyOptIn,
      launchNotifyUpdatedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const getLaunchNotifyForBackend = query({
  args: {
    clerkUserId: v.string(),
    serviceToken: v.string(),
  },
  handler: async (ctx, args) => {
    const configuredToken = process.env.CONVEX_BACKEND_WRITE_KEY;
    if (!configuredToken || args.serviceToken !== configuredToken) {
      throw new Error("Unauthorized backend read");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();
    if (!user) {
      return { launchNotifyOptIn: false };
    }

    const profile = await ctx.db
      .query("privateProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .first();
    return {
      launchNotifyOptIn: Boolean(profile?.launchNotifyOptIn),
      launchNotifyUpdatedAt: profile?.launchNotifyUpdatedAt,
    };
  },
});

export const getPhoneOwnerForBackend = query({
  args: {
    fullPhoneNumber: v.string(),
    serviceToken: v.string(),
  },
  handler: async (ctx, args) => {
    const configuredToken = process.env.CONVEX_BACKEND_WRITE_KEY;
    if (!configuredToken || args.serviceToken !== configuredToken) {
      throw new Error("Unauthorized backend read");
    }

    const profiles = await ctx.db
      .query("privateProfiles")
      .withIndex("by_fullPhoneNumber", (q) => q.eq("fullPhoneNumber", args.fullPhoneNumber))
      .take(10);

    if (profiles.length === 0) {
      return { clerkUserIds: [] as string[] };
    }

    const userIds = [...new Set(profiles.map((profile) => profile.userId))];
    const users = await Promise.all(userIds.map((userId) => ctx.db.get(userId)));
    const clerkUserIds = users
      .filter((user): user is NonNullable<typeof user> => Boolean(user))
      .map((user) => user.clerkUserId);

    return { clerkUserIds };
  },
});
