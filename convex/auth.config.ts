import type { AuthConfig } from "convex/server";

export default {
  providers: [
    {
      domain: "https://your-clerk-domain.clerk.accounts.dev",
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
