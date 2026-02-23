import type { PropsWithChildren } from "react";
import { ClerkProvider } from "@clerk/clerk-react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";

const publishableKey =
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? import.meta.env.VITE_CLERK_PULISHABLE_KEY;

export function AppProviders({ children }: PropsWithChildren) {
  if (!publishableKey) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <div className="max-w-xl rounded-2xl border border-red-300 bg-red-50 p-6 text-red-800 shadow-sm">
          Missing Clerk key. Configure `VITE_CLERK_PUBLISHABLE_KEY` in Vercel env vars (Preview).
        </div>
      </div>
    );
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ClerkProvider>
  );
}
