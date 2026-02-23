import { useEffect } from "react";
import { Redirect, Route, Switch, useLocation } from "wouter";
import { useAuth } from "@clerk/clerk-react";
import { AuthPage } from "@/pages/auth-page";
import { PhoneVerificationPage } from "@/pages/phone-verification-page";
import { WelcomePage } from "@/pages/welcome-page";
import { AdminPrivateProfilesPage } from "@/pages/admin-private-profiles-page";
import { LoadingScreen } from "@/components/auth/loading-screen";
import { ProtectedRoute } from "@/router/protected-route";
import { useAppStore } from "@/store/app-store";

function HomeRedirect() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const [, navigate] = useLocation();
  const phoneVerificationByUserId = useAppStore((state) => state.phoneVerificationByUserId);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      navigate("/auth", { replace: true });
      return;
    }

    const isPhoneVerified = Boolean(userId && phoneVerificationByUserId[userId]);
    navigate(isPhoneVerified ? "/welcome" : "/verify-phone", { replace: true });
  }, [isLoaded, isSignedIn, navigate, phoneVerificationByUserId, userId]);

  return <LoadingScreen />;
}

function NotFoundRedirect() {
  return <Redirect to="/" replace />;
}

export function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/verify-phone">
        <ProtectedRoute component={PhoneVerificationPage} />
      </Route>
      <Route path="/welcome">
        <ProtectedRoute component={WelcomePage} requirePhoneVerification />
      </Route>
      <Route path="/admin/private-profiles">
        <ProtectedRoute component={AdminPrivateProfilesPage} requirePhoneVerification />
      </Route>
      <Route component={NotFoundRedirect} />
    </Switch>
  );
}
