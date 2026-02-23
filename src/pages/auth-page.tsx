import { SignIn, SignUp, useAuth } from "@clerk/clerk-react";
import { motion } from "framer-motion";
import { Redirect } from "wouter";

export function AuthPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const mode = new URLSearchParams(window.location.search).get("mode");
  const isSignUpMode = mode === "sign-up";
  const clerkAppearance = {
    variables: {
      colorPrimary: "#ff6f61",
      colorText: "#2d2b31",
      colorTextSecondary: "#6c6770",
      colorBackground: "rgba(255, 244, 242, 0.92)",
      colorInputBackground: "rgba(255, 255, 255, 0.86)",
      colorInputText: "#2d2b31",
      colorNeutral: "#ffd7d1",
    },
    elements: {
      rootBox: "mx-auto flex w-full justify-center",
      cardBox: "mx-auto flex w-full justify-center shadow-none",
      card: "border border-[#ffc5be]/80 bg-[linear-gradient(170deg,rgba(255,250,249,0.95),rgba(255,236,232,0.9))] shadow-2xl backdrop-blur-md",
      headerTitle: "text-[#2d2b31]",
      headerSubtitle: "text-[#6c6770]",
      socialButtonsBlockButton:
        "border border-[#ffc5be] bg-white/90 text-[#2d2b31] hover:bg-[#fff1ef]",
      socialButtonsBlockButtonText: "text-[#2d2b31]",
      socialButtonsProviderIcon: "opacity-100",
      dividerLine: "bg-[#ffd2cb]",
      dividerText: "text-[#8c858f]",
      formFieldLabel: "text-[#3a3740]",
      formFieldInput:
        "border-0 bg-white text-[#2d2b31] shadow-none focus:ring-0 focus:border-0",
      otpCodeFieldInputBox: "border-0 bg-transparent p-0 shadow-none ring-0 outline-none",
      otpCodeFieldInputs: "border-0 bg-transparent p-0 shadow-none ring-0 outline-none",
      otpCodeField: "border-0 bg-transparent p-0 shadow-none ring-0 outline-none",
      otpCodeFieldInput:
        "border-0 bg-white text-[#2d2b31] shadow-none focus:ring-0 focus:border-0",
      formButtonPrimary:
        "bg-[#ff6f61] text-white hover:bg-[#f45f50] shadow-lg shadow-[#ff6f61]/35",
      footerActionText: "text-[#6c6770]",
      footerActionLink: "text-[#ff6f61] hover:text-[#f45f50]",
    },
  };

  if (isLoaded && isSignedIn) {
    return <Redirect to="/verify-phone" replace />;
  }

  return (
    <div className="m4l-hero-image min-h-screen">
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-transparent"
      >
        <div className="mx-auto w-full max-w-6xl px-4 py-4 text-white md:px-6">
          <div className="flex items-center gap-2">
            <img
              src="https://www.matched4life.com/wp-content/uploads/2022/10/Untitled-design-16.png"
              alt="Matched4Life logo"
              className="h-[4.5rem] w-[4.5rem] object-contain"
            />
            <p className="font-display text-4xl font-semibold">matched4life</p>
          </div>
        </div>
      </motion.header>

      <main className="flex w-full items-center justify-center px-4 py-8 md:justify-start md:px-3 md:py-16 lg:px-4 xl:justify-start xl:px-6 2xl:px-8">
        <div className="w-full max-w-lg">
          {isSignUpMode ? (
            <SignUp
              routing="virtual"
              signInUrl="/auth?mode=sign-in"
              afterSignUpUrl="/verify-phone"
              fallbackRedirectUrl="/verify-phone"
              appearance={clerkAppearance}
            />
          ) : (
            <SignIn
              routing="virtual"
              signUpUrl="/auth?mode=sign-up"
              afterSignInUrl="/verify-phone"
              fallbackRedirectUrl="/verify-phone"
              appearance={clerkAppearance}
            />
          )}
        </div>
      </main>
    </div>
  );
}
