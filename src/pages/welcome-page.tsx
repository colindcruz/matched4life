import { useEffect, useState } from "react";
import { SignOutButton, useAuth, useUser } from "@clerk/clerk-react";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const GET_LAUNCH_NOTIFY_API_URL = "/api/private-profiles/launch-notify/get";
const SET_LAUNCH_NOTIFY_API_URL = "/api/private-profiles/launch-notify/set";
const HERO_IMAGE_URL = "/login.png";

type LoadPreferenceResponse = {
  ok: boolean;
  launchNotifyOptIn?: boolean;
  error?: string;
};

type SavePreferenceResponse = {
  ok: boolean;
  launchNotifyOptIn?: boolean;
  error?: string;
};

export function WelcomePage() {
  const { userId } = useAuth();
  const { user } = useUser();
  const firstName = user?.firstName?.trim() || "there";
  const [launchNotifyOptIn, setLaunchNotifyOptIn] = useState(false);
  const [loadingPreference, setLoadingPreference] = useState(true);
  const [savingPreference, setSavingPreference] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveInfo, setSaveInfo] = useState<string | null>(null);

  const adminIds = String(import.meta.env.VITE_BACKEND_TEAM_CLERK_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const canAccessAdmin = Boolean(userId && adminIds.includes(userId));

  useEffect(() => {
    async function loadPreference() {
      if (!userId) return;
      setLoadingPreference(true);
      setSaveError(null);
      try {
        const response = await fetch(GET_LAUNCH_NOTIFY_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        });
        const data = (await response.json()) as LoadPreferenceResponse;
        if (!response.ok || !data.ok) {
          setSaveError(data.error ?? "Could not load notification preference.");
          return;
        }
        setLaunchNotifyOptIn(Boolean(data.launchNotifyOptIn));
      } catch {
        setSaveError("Could not load notification preference.");
      } finally {
        setLoadingPreference(false);
      }
    }

    void loadPreference();
  }, [userId]);

  async function handleLaunchNotifyChange(nextValue: boolean) {
    if (!userId || savingPreference) return;

    setLaunchNotifyOptIn(nextValue);
    setSavingPreference(true);
    setSaveError(null);
    setSaveInfo(null);

    try {
      const response = await fetch(SET_LAUNCH_NOTIFY_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          launchNotifyOptIn: nextValue,
        }),
      });
      const data = (await response.json()) as SavePreferenceResponse;
      if (!response.ok || !data.ok) {
        setLaunchNotifyOptIn((prev) => !prev);
        setSaveError(data.error ?? "Could not save notification preference.");
        return;
      }

      setSaveInfo("Preference saved.");
    } catch {
      setLaunchNotifyOptIn((prev) => !prev);
      setSaveError("Could not save notification preference.");
    } finally {
      setSavingPreference(false);
    }
  }

  return (
    <section className="relative min-h-screen w-full overflow-hidden">
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2 md:right-8 md:top-6">
        {canAccessAdmin ? (
          <Link href="/admin/private-profiles">
            <Button className="bg-white/35 text-white hover:bg-white/50">Review Private Profiles</Button>
          </Link>
        ) : null}
        <SignOutButton>
          <Button className="bg-white/35 text-white hover:bg-white/50">Sign Out</Button>
        </SignOutButton>
      </div>

      <div className="absolute inset-0 hidden md:block">
        <div
          className="
            h-full w-full bg-cover bg-no-repeat
            bg-[18%_35%]
            md:bg-[22%_35%]
            lg:bg-[24%_33%]
            xl:bg-[22%_31%]
            2xl:bg-[20%_30%]
          "
          style={{ backgroundImage: `url('${HERO_IMAGE_URL}')` }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-black/25 to-transparent" />
      </div>

      <div className="md:hidden">
        <img
          src={HERO_IMAGE_URL}
          alt="Matched4Life couple"
          className="h-[45vh] w-full object-cover object-[18%_25%]"
        />
      </div>

      <div
        className="
          relative
          z-10
          flex
          min-h-screen
          items-start
          justify-center
          px-4
          pt-6
          pb-12
          md:items-center
          md:justify-start
          md:pl-[6%]
          lg:pl-[5%]
          xl:pl-[12%]
        "
      >
        <Card
          className="
            w-full
            max-w-sm
            sm:max-w-md
            md:max-w-lg
            lg:max-w-xl
            rounded-2xl
            bg-[#F4E9E5]
            border border-white/40
            px-5
            py-5
            shadow-2xl
            backdrop-blur-md
            sm:px-6
            sm:py-6
            md:px-6
            md:py-6
          "
        >
          <p className="mb-3 text-lg font-medium text-muted-foreground md:text-xl">Hello, {firstName}.</p>

          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl md:text-4xl">
            Exciting Changes Ahead
          </h1>

          <p className="mt-4 text-base leading-relaxed text-gray-600 sm:text-lg">
            Matched4Life is being thoughtfully redesigned to create an even better experience for
            you. While we build the new platform, the app will be temporarily unavailable.
          </p>

          <label className="mt-6 flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 flex-shrink-0 rounded border-[#7acb95] accent-emerald-600"
              checked={launchNotifyOptIn}
              onChange={(event) => handleLaunchNotifyChange(event.target.checked)}
              disabled={loadingPreference || savingPreference}
            />
            <span className="text-base text-gray-700 sm:text-lg">
              I&apos;d like to be notified when the new version launches.
            </span>
          </label>

          {saveError ? <p className="mt-4 text-sm text-red-600">{saveError}</p> : null}
          {launchNotifyOptIn && !saveError ? (
            <p className="mt-4 text-base font-medium text-emerald-600 sm:text-lg">
              You&apos;ll be among the first to know when we go live. Thank you for your patience
              and support!
            </p>
          ) : null}
          {saveInfo && !launchNotifyOptIn ? <p className="mt-4 text-base text-emerald-700">{saveInfo}</p> : null}
        </Card>
      </div>
    </section>
  );
}
