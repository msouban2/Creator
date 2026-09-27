import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LifeBuoy, CheckCircle2, RotateCcw, Search, Inbox, Hand, Phone, Mail } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/store/auth";
import { Badge, Modal } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";

const MAX_ACTIVE = 4;

type Ticket = {
  id: string;
  subject: string;
  status: "open" | "resolved";
  category: string | null;
  query: string | null;
  contact_email: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  image_url: string | null;
  last_message_at: string;
  created_at: string;
  claimed_by: string | null;
  owner: { full_name: string | null; email: string | null } | null;
  claimer: { full_name: string | null } | null;
};

type Tab = "mine" | "unassigned" | "progress" | "resolved";

async function fetchTickets() {
  const { data, error } = await supabase
    .from("support_tickets")
    .select(
      "id, subject, status, category, query, contact_email, contact_name, contact_phone, image_url, last_message_at, created_at, claimed_by, owner:profiles!user_id(full_name, email), claimer:profiles!claimed_by(full_name)"
    )
    .order("last_message_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as unknown as Ticket[];
}

function TicketThread({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
  const qc = useQueryClient();

  const setStatus = useMutation({
    mutationFn: async (status: "open" | "resolved") => {
      const { error } = await supabase.from("support_tickets").update({ status }).eq("id", ticket.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["support-tickets"] }),
  });

  const email = ticket.contact_email ?? ticket.owner?.email ?? "";
  const phone = (ticket.contact_phone ?? "").replace(/[^0-9+]/g, "");
  const name = ticket.contact_name ?? ticket.owner?.full_name ?? "Creator";
  const waNumber = phone.replace(/^\+/, "");

  return (
    <div className="flex max-h-[75vh] flex-col gap-3 overflow-y-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {ticket.category ? <Badge variant="info">{ticket.category}</Badge> : null}
          <Badge variant={ticket.status === "open" ? "warning" : "success"}>{ticket.status}</Badge>
        </div>
        {ticket.status === "open" ? (
          <Button variant="outline" onClick={() => setStatus.mutate("resolved")} disabled={setStatus.isPending}>
            <CheckCircle2 size={15} /> Mark resolved
          </Button>
        ) : (
          <Button variant="outline" onClick={() => setStatus.mutate("open")} disabled={setStatus.isPending}>
            <RotateCcw size={15} /> Reopen
          </Button>
        )}
      </div>

      {/* The query */}
      <div className="rounded-xl bg-slate-50 p-3">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Query</p>
        <p className="whitespace-pre-wrap text-sm text-slate-700">{ticket.query ?? "—"}</p>
        <p className="mt-2 text-[11px] text-slate-400">Submitted {formatDate(ticket.created_at)}</p>
      </div>

      {/* Screenshot */}
      {ticket.image_url ? (
        <a href={ticket.image_url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-slate-100">
          <img src={ticket.image_url} alt="Issue screenshot" className="max-h-64 w-full object-contain" />
        </a>
      ) : null}

      {/* Contact details */}
      <div className="rounded-xl border border-slate-100 p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Contact</p>
        <div className="space-y-1 text-sm text-slate-700">
          <p><span className="text-slate-400">Name:</span> {name}</p>
          <p><span className="text-slate-400">Email:</span> {email || "—"}</p>
          <p><span className="text-slate-400">Phone:</span> {ticket.contact_phone || "—"}</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {waNumber ? (
            <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noreferrer">
              <Button variant="outline" className="border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                <Phone size={14} /> WhatsApp
              </Button>
            </a>
          ) : null}
          {phone ? (
            <a href={`tel:${phone}`}>
              <Button variant="outline"><Phone size={14} /> Call</Button>
            </a>
          ) : null}
          {email ? (
            <a href={`mailto:${email}?subject=${encodeURIComponent("Re: " + (ticket.category ?? "your query"))}`}>
              <Button variant="outline"><Mail size={14} /> Email</Button>
            </a>
          ) : null}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">Reply to the creator on WhatsApp or email, then mark the query resolved.</p>
      </div>

      <button onClick={onClose} className="text-xs font-semibold text-slate-400 hover:text-ink">
        Close
      </button>
    </div>
  );
}

export default function Support() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const myId = profile?.id;
  const [tab, setTab] = useState<Tab>("mine");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<Ticket | null>(null);

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["support-tickets"],
    queryFn: fetchTickets,
    refetchInterval: 20000,
  });

  // Deep-link: open a specific ticket when navigated to with ?id=
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const id = searchParams.get("id");
    if (!id || !tickets.length) return;
    const found = tickets.find((t) => t.id === id);
    if (found) {
      setActive(found);
      const next = new URLSearchParams(searchParams);
      next.delete("id");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, tickets]);

  const groups = useMemo(() => {
    const open = tickets.filter((t) => t.status === "open");
    return {
      mine: open.filter((t) => t.claimed_by === myId),
      unassigned: open.filter((t) => !t.claimed_by),
      progress: open.filter((t) => t.claimed_by && t.claimed_by !== myId),
      resolved: tickets.filter((t) => t.status === "resolved"),
    };
  }, [tickets, myId]);

  const myCount = groups.mine.length;
  const atLimit = myCount >= MAX_ACTIVE;

  const claim = useMutation({
    mutationFn: async (ticketId: string | null) => {
      const { data, error } = await supabase.rpc("claim_support_ticket", { p_ticket: ticketId });
      if (error) throw error;
      return data as string | null;
    },
    onSuccess: (claimedId) => {
      qc.invalidateQueries({ queryKey: ["support-tickets"] });
      if (claimedId) {
        const t = tickets.find((x) => x.id === claimedId);
        if (t) setActive({ ...t, claimed_by: myId ?? null });
        setTab("mine");
      } else {
        window.alert("No unassigned tickets are waiting right now.");
      }
    },
    onError: (e: unknown) => {
      window.alert(e instanceof Error ? e.message : "Couldn't claim the ticket.");
    },
  });

  const release = useMutation({
    mutationFn: async (ticketId: string) => {
      const { error } = await supabase.rpc("release_support_ticket", { p_ticket: ticketId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["support-tickets"] }),
  });

  const list = groups[tab];
  const filtered = list.filter((t) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      t.subject.toLowerCase().includes(q) ||
      (t.owner?.full_name ?? "").toLowerCase().includes(q) ||
      (t.owner?.email ?? "").toLowerCase().includes(q)
    );
  });

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: "mine", label: `My queue (${myCount}/${MAX_ACTIVE})`, count: myCount },
    { key: "unassigned", label: "Unassigned", count: groups.unassigned.length },
    { key: "progress", label: "In progress", count: groups.progress.length },
    { key: "resolved", label: "Resolved", count: groups.resolved.length },
  ];

  return (
    <div className="space-y-4">
      {/* Queue header */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-100 text-primary-600">
            <Inbox size={17} />
          </span>
          <div>
            <p className="text-sm font-bold text-ink">
              You're handling {myCount}/{MAX_ACTIVE}
            </p>
            <p className="text-xs text-slate-400">{groups.unassigned.length} waiting to be picked up</p>
          </div>
        </div>
        <Button
          className="ml-auto"
          onClick={() => claim.mutate(null)}
          disabled={atLimit || groups.unassigned.length === 0 || claim.isPending}
        >
          <Hand size={15} /> {claim.isPending ? "Claiming…" : "Claim next"}
        </Button>
      </div>
      {atLimit ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          You've reached the {MAX_ACTIVE}-ticket limit. Resolve one to pick up another.
        </p>
      ) : null}

      {/* Tabs + search */}
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              "flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors " +
              (tab === t.key ? "bg-ink text-white" : "bg-white text-slate-600 hover:bg-slate-100")
            }
          >
            {t.label}
            {t.key !== "mine" && t.count > 0 ? (
              <span
                className={
                  "rounded-full px-1.5 py-0.5 text-xs font-bold " +
                  (tab === t.key ? "bg-white text-ink" : "bg-slate-100 text-slate-600")
                }
              >
                {t.count}
              </span>
            ) : null}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            className="w-64 pl-9"
            placeholder="Search subject or creator…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <p className="text-slate-400">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center">
          <LifeBuoy size={30} className="mx-auto text-slate-300" />
          <p className="mt-3 font-semibold text-ink">
            {tab === "mine"
              ? "You haven't claimed any tickets"
              : tab === "unassigned"
                ? "No tickets waiting"
                : tab === "progress"
                  ? "No tickets being handled"
                  : "No resolved tickets"}
          </p>
          {tab === "mine" && groups.unassigned.length > 0 ? (
            <p className="mt-1 text-sm text-slate-500">Tap “Claim next” to pick up a waiting ticket.</p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 transition hover:border-slate-200"
            >
              <button onClick={() => setActive(t)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-600">
                  {(t.owner?.full_name ?? "?").charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{t.subject}</p>
                  <p className="truncate text-xs text-slate-400">
                    {t.owner?.full_name ?? "Creator"} · updated {formatDate(t.last_message_at)}
                    {t.claimed_by && t.claimed_by !== myId ? ` · handled by ${t.claimer?.full_name ?? "staff"}` : ""}
                  </p>
                </div>
              </button>

              <Badge variant={t.status === "open" ? "warning" : "success"}>{t.status}</Badge>

              {tab === "unassigned" ? (
                <Button
                  variant="outline"
                  onClick={() => claim.mutate(t.id)}
                  disabled={atLimit || claim.isPending}
                  title={atLimit ? `Limit of ${MAX_ACTIVE} reached` : "Claim this ticket"}
                >
                  <Hand size={14} /> Claim
                </Button>
              ) : null}

              {(tab === "mine" || (tab === "progress" && isAdmin)) && t.status === "open" ? (
                <button
                  onClick={() => release.mutate(t.id)}
                  disabled={release.isPending}
                  className="text-xs font-semibold text-slate-400 hover:text-rose-600"
                  title="Return to the unassigned pool"
                >
                  Release
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <Modal open={!!active} onClose={() => setActive(null)} title={active?.subject ?? "Support"}>
        {active ? <TicketThread ticket={active} onClose={() => setActive(null)} /> : null}
      </Modal>
    </div>
  );
}
