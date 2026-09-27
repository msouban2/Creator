// Shared layout for public (no-login) legal pages: Privacy Policy, Data Deletion.

export function LegalShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-white px-4 py-10">
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-100 bg-white p-8 shadow-lg">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-xl font-black text-white">
            B
          </div>
          <div>
            <h1 className="text-2xl font-black text-ink">{title}</h1>
            <p className="text-xs text-slate-400">Last updated: {updated}</p>
          </div>
        </div>
        <div className="space-y-6 text-sm leading-relaxed text-slate-600 [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:text-[0.8em] [&_li]:ml-1 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
          {children}
        </div>
        <div className="mt-8 border-t border-slate-100 pt-4 text-xs text-slate-400">
          <a href="/privacy" className="mr-4 hover:text-primary">
            Privacy Policy
          </a>
          <a href="/data-deletion" className="mr-4 hover:text-primary">
            Data Deletion
          </a>
          <a href="/terms" className="hover:text-primary">
            Terms of Service
          </a>
        </div>
      </div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-bold text-ink">{title}</h2>
      {children}
    </section>
  );
}
