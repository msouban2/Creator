// Public (no-login) landing page for shared REFERRAL links:
//   https://aaina-admin.onrender.com/r/<referralCode>
// Messaging apps make https links tappable (unlike the aaina:// scheme), so
// shared referral links point here. This page shows the code, tries to open the
// Bilkul app (forwarding the ref so signup auto-fills), and offers store
// download buttons if the app isn't installed yet.
import { useEffect, useMemo, useState } from "react";

const PLAY_URL = "https://play.google.com/store/apps/details?id=com.aaina.creator";
const APPSTORE_URL = "https://apps.apple.com/app/id6807625968";

// Deep link into the app. The app captures ?ref= on open (see useCaptureReferral)
// and pre-fills it on the sign-up screen.
function appDeepLink(ref: string | null): string {
  const base = "aaina:///";
  return ref ? `${base}?ref=${encodeURIComponent(ref)}` : base;
}

export default function ReferralJoin() {
  const ref = useMemo(() => {
    const parts = window.location.pathname.split("/").filter(Boolean); // ["r", "<code>"]
    const fromPath = parts[1] ? decodeURIComponent(parts[1]) : "";
    const fromQuery = new URLSearchParams(window.location.search).get("ref") ?? "";
    return (fromPath || fromQuery).toUpperCase() || null;
  }, []);

  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    if (!ref) return;
    void navigator.clipboard?.writeText(ref);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const openApp = () => {
    window.location.href = appDeepLink(ref);
  };

  // Try to open the app automatically once on load (no-op if not installed).
  useEffect(() => {
    const t = setTimeout(openApp, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-50 to-white px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-lg">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-3xl font-black text-white">
          b
        </div>
        <h1 className="text-xl font-black text-ink">Join me on Bilkul 🎉</h1>
        <p className="mt-2 text-sm text-slate-500">
          Start earning from brand campaigns. Install the app and sign up with the code below.
        </p>

        {ref ? (
          <div className="mt-5 rounded-xl border border-primary-100 bg-primary-50 px-4 py-3">
            <p className="text-xs font-medium text-slate-500">Your referral code</p>
            <p className="text-2xl font-black tracking-widest text-primary">{ref}</p>
            <button
              type="button"
              onClick={copyCode}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-primary-200 bg-white px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary-50"
            >
              {copied ? "✓ Copied" : "Copy code"}
            </button>
            <p className="mt-2 text-[11px] font-medium text-slate-500">
              Enter this in the <span className="font-bold">Referral Code</span> box when you sign up.
            </p>
          </div>
        ) : null}

        <button
          type="button"
          onClick={openApp}
          className="mt-5 w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white hover:bg-primary-600"
        >
          Open in Bilkul app
        </button>

        <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-left">
          <p className="text-xs font-bold text-ink">Don&apos;t have the app yet? Download it:</p>
          <div className="mt-2 flex flex-col gap-2">
            <a
              href={PLAY_URL}
              className="rounded-lg bg-ink px-3 py-2 text-center text-xs font-bold text-white hover:opacity-90"
            >
              📲 Get it on Google Play
            </a>
            <a
              href={APPSTORE_URL}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-xs font-bold text-ink hover:bg-slate-50"
            >
               Download on the App Store
            </a>
          </div>
          {ref ? (
            <p className="mt-2 text-[11px] text-slate-500">
              After installing, sign up and enter code{" "}
              <span className="font-black text-primary">{ref}</span>.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
