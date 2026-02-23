import type { ComponentType } from "react";
import { Redirect } from "wouter";
import { useAuth } from "@clerk/clerk-react";
import { LoadingScreen } from "@/components/auth/loading-screen";
import { useAppStore } from "@/store/app-store";

type ProtectedRouteProps = {
  component: ComponentType;
  requirePhoneVerification?: boolean;
};

export function ProtectedRoute({
  component: Component,
  requirePhoneVerification = false,
}: ProtectedRouteProps) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const phoneVerificationByUserId = useAppStore((state) => state.phoneVerificationByUserId);

  if (!isLoaded) {
    return <LoadingScreen />;
  }

  if (!isSignedIn) {
    return <Redirect to="/auth" />;
  }

  if (requirePhoneVerification && (!userId || !phoneVerificationByUserId[userId])) {
    return <Redirect to="/verify-phone" />;
  }

  return <Component />;
}
