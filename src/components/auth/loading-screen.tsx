import { Loader2 } from "lucide-react";

export function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#fff7ed_0%,_#f8fafc_55%,_#f1f5f9_100%)]">
      <div className="flex items-center gap-3 rounded-full border bg-white/80 px-5 py-3 text-sm text-muted-foreground shadow-sm backdrop-blur">
        <Loader2 className="h-4 w-4 animate-spin" />
        Preparing your experience...
      </div>
    </div>
  );
}
