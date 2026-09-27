// Public (no-login) landing page for shared campaign links:
//   https://aaina-admin.onrender.com/c/<campaignId>?ref=<referralCode>
// Messaging apps make https links tappable (unlike the aaina:// scheme), so
// shared links point here. This page then tries to open the Bilkul app via its
// deep link (forwarding the ref code) and offers a fallback if it isn't
// installed.
import { useEffect, useMemo, useState } from "react";

// Deep link into the app. Triple slash matches what expo-router expects
// (empty authority + /campaign/<id> path), and the app captures ?ref= on open.
function appDeepLink(id: string, ref: string | null): string {
  const base = `aaina:///campaign/${id}`;
  return ref ? `${base}?ref=${encodeURIComponent(ref)}` : base;
}

export default function CampaignRedirect() {
  const { id, ref } = useMemo(() => {
    const parts = window.location.pathname.split("/").filter(Boolean); // ["c", "<id>"]
    const campaignId = parts[1] ?? "";
    const params = new URLSearchParams(window.location.search);
    return { id: campaignId, ref: params.get("ref") };
  }, []);

  const [triedOpen, setTriedOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    if (!ref) return;
    void navigator.clipboard?.writeText(ref);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const openApp = () => {
    if (!id) return;
    setTriedOpen(true);
    window.location.href = appDeepLink(id, ref);
  };

  // Attempt to open the app automatically once on load.
  useEffect(() => {
    const t = setTimeout(openApp, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-50 to-white px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-lg">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-3xl font-black text-white">
          B
        </div>
        <h1 className="text-xl font-black text-ink">Open this campaign in Bilkul</h1>
        <p className="mt-2 text-sm text-slate-500">
          Tap the button below to view the campaign and start earning from brand collaborations.
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
              Enter this code in the <span className="font-bold">Referral Code</span> box when you sign up so
              your friend gets credited.
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

        {triedOpen ? (
          <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-left">
            <p className="text-xs font-bold text-ink">Don&apos;t have the app yet?</p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-[11px] text-slate-500">
              <li>Install Bilkul.</li>
              {ref ? (
                <li>
                  On the sign-up screen, enter referral code{" "}
                  <span className="font-black text-primary">{ref}</span>.
                </li>
              ) : (
                <li>Sign up for a free creator account.</li>
              )}
              <li>You&apos;ll find this campaign inside the app.</li>
            </ol>
          </div>
        ) : null}
      </div>
    </div>
  );
}
