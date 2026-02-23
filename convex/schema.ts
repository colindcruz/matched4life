import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    clerkUserId: v.string(),
    email: v.optional(v.string()),
    fullName: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("by_clerkUserId", ["clerkUserId"]),

  privateProfiles: defineTable({
    userId: v.id("users"),
    email: v.optional(v.string()),
    fullName: v.optional(v.string()),
    phoneCountryCode: v.optional(v.string()),
    phoneNumber: v.optional(v.string()),
    fullPhoneNumber: v.optional(v.string()),
    phoneVerifiedAt: v.optional(v.number()),
    address: v.optional(v.string()),
    churchName: v.optional(v.string()),
    launchNotifyOptIn: v.optional(v.boolean()),
    launchNotifyUpdatedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_fullPhoneNumber", ["fullPhoneNumber"]),
});
