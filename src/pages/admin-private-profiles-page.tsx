import { useEffect, useState } from "react";
import { SignOutButton, useAuth } from "@clerk/clerk-react";
import { Redirect, Link } from "wouter";
import { Button } from "@/components/ui/button";

type PrivateProfileRow = {
  clerkUserId: string;
  fullName?: string;
  email?: string;
  countryCode?: string;
  phoneNumber?: string;
  fullPhoneNumber?: string;
  churchName?: string;
  address?: string;
  phoneVerifiedAt?: number;
  updatedAt?: number;
};

type AdminListResponse = {
  ok: boolean;
  rows?: PrivateProfileRow[];
  error?: string;
};

const ADMIN_LIST_API_URL = "/api/private-profiles/admin-list";

export function AdminPrivateProfilesPage() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<PrivateProfileRow[]>([]);
  const allowedAdminIds = String(import.meta.env.VITE_BACKEND_TEAM_CLERK_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const isAllowedAdmin = Boolean(userId && allowedAdminIds.includes(userId));

  useEffect(() => {
    async function loadRows() {
      if (!userId || !isAllowedAdmin) return;
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(ADMIN_LIST_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requesterUserId: userId, limit: 200 }),
        });
        const data = (await response.json()) as AdminListResponse;
        if (!response.ok || !data.ok) {
          setError(data.error ?? `Failed to load private profiles [HTTP ${response.status}]`);
          return;
        }
        setRows(data.rows ?? []);
      } catch {
        setError("Failed to load private profiles.");
      } finally {
        setLoading(false);
      }
    }
    void loadRows();
  }, [isAllowedAdmin, userId]);

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect to="/auth" />;
  if (!isAllowedAdmin) return <Redirect to="/welcome" />;

  return (
    <div className="m4l-hero-image min-h-screen">
      <header className="bg-transparent">
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
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6 md:py-12">
        <div className="rounded-3xl border border-[#ffc5be]/80 bg-[linear-gradient(170deg,rgba(255,250,249,0.96),rgba(255,236,232,0.92))] p-6 shadow-2xl backdrop-blur-md md:p-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-display text-3xl font-semibold text-[#2d2b31]">
              Private Profile Review
            </h1>
            <Link href="/welcome">
              <Button variant="outline" className="border-[#ffc5be] text-[#5b5561]">
                Back
              </Button>
            </Link>
          </div>

          {loading ? <p className="text-[#6c6770]">Loading private profiles...</p> : null}
          {error ? <p className="text-red-600">{error}</p> : null}

          {!loading && !error ? (
            <div className="overflow-x-auto rounded-xl border border-[#ffd6d2] bg-white/80">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#ffe6e2] text-[#3a3740]">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Phone</th>
                    <th className="px-3 py-2">Church</th>
                    <th className="px-3 py-2">Address</th>
                    <th className="px-3 py-2">Verified</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${row.clerkUserId}-${row.fullPhoneNumber ?? row.phoneNumber}`} className="border-t">
                      <td className="px-3 py-2">{row.fullName || "-"}</td>
                      <td className="px-3 py-2">{row.email || "-"}</td>
                      <td className="px-3 py-2">{row.fullPhoneNumber || "-"}</td>
                      <td className="px-3 py-2">{row.churchName || "-"}</td>
                      <td className="px-3 py-2">{row.address || "-"}</td>
                      <td className="px-3 py-2">
                        {row.phoneVerifiedAt ? new Date(row.phoneVerifiedAt).toLocaleString() : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
