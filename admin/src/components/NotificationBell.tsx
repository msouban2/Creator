import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/store/auth";
import { formatDate } from "@/lib/utils";

type Notif = {
  id: string;
  title: string;
  message: string | null;
  type: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

/**
 * In-app notification inbox for the logged-in staff member or seller. Polls the
 * notifications table (each user reads only their own) and lets them mark items
 * read. Used e.g. when a seller and an employee message each other on an order.
 */
export function NotificationBell() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const isSeller = profile?.role === "seller";

  const { data: items } = useQuery({
    queryKey: ["my-notifications", profile?.id, isSeller],
    enabled: !!profile?.id,
    refetchInterval: 30000,
    queryFn: async () => {
      let q = supabase
        .from("notifications")
        .select("id, title, message, type, link, is_read, created_at")
        .eq("user_id", profile!.id)
        .order("created_at", { ascending: false })
        .limit(30);
      // Sellers must never see internal staff notifications (e.g. review notes).
      if (isSeller) q = q.not("type", "in", "(review)");
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Notif[];
    },
  });

  const unread = (items ?? []).filter((n) => !n.is_read).length;

  const markRead = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      const { error } = await supabase.from("notifications").update({ is_read: true }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-notifications"] }),
  });

  const openNotif = (n: Notif) => {
    if (!n.is_read) markRead.mutate([n.id]);
    if (n.link) {
      setOpen(false);
      navigate(n.link);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
        title="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <p className="text-sm font-bold text-ink">Notifications</p>
            {unread > 0 && (
              <button
                onClick={() => markRead.mutate((items ?? []).filter((n) => !n.is_read).map((n) => n.id))}
                className="text-xs font-semibold text-primary hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {(items ?? []).length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">No notifications yet.</p>
            ) : (
              (items ?? []).map((n) => (
                <button
                  key={n.id}
                  onClick={() => openNotif(n)}
                  className={
                    "flex w-full items-start gap-2 border-b border-slate-50 px-4 py-2.5 text-left hover:bg-slate-50 " +
                    (n.is_read ? "" : "bg-primary-50/40")
                  }
                >
                  <span
                    className={
                      "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full " + (n.is_read ? "bg-transparent" : "bg-primary")
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 text-sm font-semibold text-ink">{n.title}</span>
                      <span className="shrink-0 text-[10px] text-slate-400">{formatDate(n.created_at)}</span>
                    </div>
                    {n.message && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{n.message}</p>}
                    {n.link && <span className="mt-0.5 block text-[10px] font-semibold text-primary">Open →</span>}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
