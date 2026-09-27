import { useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/store/auth";
import { Layout } from "@/components/Layout";
import Login from "@/pages/Login";
import Landing from "@/pages/Landing";
import Privacy from "@/pages/Privacy";
import DataDeletion from "@/pages/DataDeletion";
import Terms from "@/pages/Terms";
import CampaignRedirect from "@/pages/CampaignRedirect";
import ReferralJoin from "@/pages/ReferralJoin";
import Dashboard from "@/pages/Dashboard";
import Campaigns from "@/pages/Campaigns";
import CampaignDetail from "@/pages/CampaignDetail";
import Applications from "@/pages/Applications";
import Submissions from "@/pages/Submissions";
import Payments from "@/pages/Payments";
import Sellers from "@/pages/Sellers";
import Referrals from "@/pages/Referrals";
import Notifications from "@/pages/Notifications";
import Employees from "@/pages/Employees";
import EmployeeStats from "@/pages/EmployeeStats";
import Users from "@/pages/Users";
import SellerOverview, { SellerOrdersPage, SellerProductsPage } from "@/pages/SellerPerformance";
import ApplicationReview from "@/pages/ApplicationReview";
import ReviewQueue from "@/pages/ReviewQueue";
import Support from "@/pages/Support";
import CampaignRequests from "@/pages/CampaignRequests";
import InstagramRequests from "@/pages/InstagramRequests";
import { EmployeeHome } from "@/pages/EmployeeHome";
import { canAccess, type SectionKey } from "@/lib/permissions";

export default function App() {
  const { session, profile, loading, init, signOut } = useAuth();
  const location = useLocation();

  useEffect(() => {
    init();
  }, [init]);

  // Google login is only allowed for sellers. Any non-seller who signs in with
  // Google is signed out immediately (admins/employees must use email + password).
  useEffect(() => {
    const provider = session?.user?.app_metadata?.provider;
    if (session && provider === "google" && profile && profile.role !== "seller") {
      sessionStorage.setItem("googleDenied", "1");
      signOut();
    }
  }, [session, profile, signOut]);

  // Public legal pages — must be reachable without authentication (required by
  // Meta App Review for the Privacy Policy and Data Deletion URLs).
  if (location.pathname === "/privacy") return <Privacy />;
  if (location.pathname === "/data-deletion") return <DataDeletion />;
  if (location.pathname === "/terms") return <Terms />;
  if (location.pathname.startsWith("/c/")) return <CampaignRedirect />;
  if (location.pathname.startsWith("/r/")) return <ReferralJoin />;

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-100 border-t-primary" />
      </div>
    );
  }

  const isAdmin = profile?.role === "admin";
  const isStaff = session && (isAdmin || profile?.role === "employee");
  const isSeller = session && profile?.role === "seller";

  // Sellers get a restricted, read-only performance view only.
  if (isSeller) {
    return (
      <Layout>
        <Routes>
          <Route path="/performance" element={<SellerOverview />} />
          <Route path="/seller-orders" element={<SellerOrdersPage />} />
          <Route path="/seller-products" element={<SellerProductsPage />} />
          <Route path="/seller-campaigns" element={<CampaignRequests />} />
          <Route path="*" element={<Navigate to="/performance" replace />} />
        </Routes>
      </Layout>
    );
  }

  if (!isStaff) {
    return (
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  // Employees only see the sections an admin granted them. Admins see everything.
  const can = (key: SectionKey) => canAccess(profile, key);
  // Admins land on the global dashboard; every employee lands on their personal
  // "My Work" home (no special permission needed).
  const homePath = isAdmin ? "/" : "/home";

  return (
    <Layout>
      <Routes>
        <Route path="/" element={isAdmin ? <Dashboard /> : <Navigate to="/home" replace />} />
        <Route path="/home" element={isAdmin ? <Navigate to="/" replace /> : <EmployeeHome />} />
        <Route path="/campaigns" element={can("campaigns") ? <Campaigns /> : <Navigate to={homePath} replace />} />
        <Route path="/campaigns/:id" element={can("campaigns") ? <CampaignDetail /> : <Navigate to={homePath} replace />} />
        <Route path="/applications" element={can("applications") ? <Applications /> : <Navigate to={homePath} replace />} />
        <Route
          path="/applications/:id/review"
          element={can("applications") ? <ApplicationReview /> : <Navigate to={homePath} replace />}
        />
        <Route path="/users" element={can("users") ? <Users /> : <Navigate to={homePath} replace />} />
        <Route path="/submissions" element={can("submissions") ? <Submissions /> : <Navigate to={homePath} replace />} />
        <Route path="/review-queue" element={can("review_queue") ? <ReviewQueue /> : <Navigate to={homePath} replace />} />
        <Route
          path="/instagram-requests"
          element={can("instagram_requests") ? <InstagramRequests /> : <Navigate to={homePath} replace />}
        />
        <Route path="/support" element={can("support") ? <Support /> : <Navigate to={homePath} replace />} />
        {/* Admin-only routes */}
        <Route path="/payments" element={isAdmin ? <Payments /> : <Navigate to={homePath} replace />} />
        <Route path="/sellers" element={can("sellers") ? <Sellers /> : <Navigate to={homePath} replace />} />
        <Route path="/campaign-requests" element={can("sellers") ? <CampaignRequests /> : <Navigate to={homePath} replace />} />
        <Route path="/referrals" element={isAdmin ? <Referrals /> : <Navigate to={homePath} replace />} />
        <Route path="/notifications" element={isAdmin ? <Notifications /> : <Navigate to={homePath} replace />} />
        <Route path="/employees" element={isAdmin ? <Employees /> : <Navigate to={homePath} replace />} />
        <Route path="/employee-stats" element={isAdmin ? <EmployeeStats /> : <Navigate to={homePath} replace />} />
        <Route path="/no-access" element={<NoAccess />} />
        <Route path="/login" element={<Navigate to={homePath} replace />} />
        <Route path="*" element={<Navigate to={homePath} replace />} />
      </Routes>
    </Layout>
  );
}

function NoAccess() {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-slate-100 bg-white p-8 text-center">
      <h2 className="text-lg font-bold text-ink">No sections assigned yet</h2>
      <p className="mt-2 text-sm text-slate-400">
        Your account doesn&apos;t have access to any pages. Please ask an admin to grant you access.
      </p>
    </div>
  );
}
