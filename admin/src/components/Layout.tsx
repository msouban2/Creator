import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Megaphone,
  Users,
  Wallet,
  Gift,
  Bell,
  LogOut,
  UserCog,
  Contact,
  LineChart,
  BarChart3,
  ListChecks,
  Instagram,
  Store,
  LifeBuoy,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/store/auth";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { canAccess, type SectionKey } from "@/lib/permissions";
import { NotificationBell } from "@/components/NotificationBell";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
  sellerOnly?: boolean;
  employeeOnly?: boolean;
  perm?: SectionKey;
};

const nav: NavItem[] = [
  { to: "/performance", label: "Overview", icon: LineChart, sellerOnly: true },
  { to: "/seller-orders", label: "Orders", icon: ListChecks, sellerOnly: true },
  { to: "/seller-products", label: "Products", icon: Store, sellerOnly: true },
  { to: "/seller-campaigns", label: "Campaign Requests", icon: Megaphone, sellerOnly: true },
  { to: "/home", label: "My Work", icon: LayoutDashboard, employeeOnly: true },
  { to: "/", label: "Dashboard", icon: LayoutDashboard, adminOnly: true },
  { to: "/campaigns", label: "Campaigns", icon: Megaphone, perm: "campaigns" },
  { to: "/applications", label: "Applications", icon: Users, perm: "applications" },
  { to: "/users", label: "Creators", icon: Contact, perm: "users" },
  { to: "/review-queue", label: "Review Queue", icon: ListChecks, perm: "review_queue" },
  { to: "/instagram-requests", label: "Instagram Requests", icon: Instagram, perm: "instagram_requests" },
  { to: "/support", label: "Support", icon: LifeBuoy, perm: "support" },
  { to: "/payments", label: "Payments", icon: Wallet, adminOnly: true },
  { to: "/sellers", label: "Brand Management", icon: Store, perm: "sellers" },
  { to: "/campaign-requests", label: "Campaign Requests", icon: Megaphone, perm: "sellers" },
  { to: "/referrals", label: "Referrals", icon: Gift, adminOnly: true },
  { to: "/notifications", label: "Notifications", icon: Bell, adminOnly: true },
  { to: "/employees", label: "Employees", icon: UserCog, adminOnly: true },
  { to: "/employee-stats", label: "Employee Stats", icon: BarChart3, adminOnly: true },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sidebar-collapsed") === "1";
  });
  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sidebar-collapsed", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };
  const isAdmin = profile?.role === "admin";
  const isSeller = profile?.role === "seller";
  const isEmployee = profile?.role === "employee";
  const items = nav.filter((n) => {
    if (isSeller) return !!n.sellerOnly;
    if (n.sellerOnly) return false;
    if (n.employeeOnly) return isEmployee;
    if (n.adminOnly) return !!isAdmin;
    if (n.perm) return canAccess(profile, n.perm);
    return true;
  });
  const active = items.find((n) => n.to === location.pathname)?.label ?? items[0]?.label ?? "Dashboard";

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-20 flex flex-col border-r border-slate-100 bg-white transition-all duration-200",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {/* Collapse / expand toggle */}
        <button
          onClick={toggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3 top-6 z-30 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-ink"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <div className={cn("flex items-center gap-2 py-5", collapsed ? "justify-center px-0" : "px-6")}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-lg font-black text-white">
            B
          </div>
          {!collapsed ? (
            <div>
              <p className="text-base font-black leading-none text-ink">Bilkul</p>
              <p className="text-xs text-slate-400">
                {isAdmin ? "Admin Console" : isSeller ? "Brand Console" : "Staff Console"}
              </p>
            </div>
          ) : null}
        </div>

        <nav className="flex-1 space-y-1 px-3 py-2">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              title={item.label}
              className={({ isActive }) =>
                cn(
                  "flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  collapsed ? "justify-center" : "gap-3",
                  isActive ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-100"
                )
              }
            >
              <item.icon size={18} className="shrink-0" />
              {!collapsed ? item.label : null}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-100 p-3">
          {!collapsed ? (
            <div className="mb-2 px-3 py-2">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold text-ink">{profile?.full_name ?? "Staff"}</p>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                    isAdmin
                      ? "bg-primary-100 text-primary"
                      : isSeller
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-indigo-100 text-indigo-700"
                  )}
                >
                  {profile?.role === "seller" ? "brand" : profile?.role ?? "employee"}
                </span>
              </div>
              <p className="truncate text-xs text-slate-400">{profile?.email}</p>
            </div>
          ) : null}
          <button
            onClick={signOut}
            title="Sign out"
            className={cn(
              "flex w-full items-center rounded-xl px-3 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50",
              collapsed ? "justify-center" : "gap-3"
            )}
          >
            <LogOut size={18} className="shrink-0" />
            {!collapsed ? "Sign out" : null}
          </button>
        </div>
      </aside>

      <div className={cn("min-w-0 flex-1 transition-all duration-200", collapsed ? "ml-16" : "ml-64")}>
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-100 bg-white px-8">
          <h1 className="text-lg font-bold text-ink">{active}</h1>
          <NotificationBell />
        </header>
        <main className="min-w-0 p-8">{children}</main>
      </div>
    </div>
  );
}
