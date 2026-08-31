import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import DashboardLayout from './layouts/DashboardLayout';
import Spinner from './components/ui/Spinner';
import LaunchSplash from './components/pwa/LaunchSplash';
import PwaUpdatePrompt from './components/pwa/PwaUpdatePrompt';
import ColdStartNotice from './components/ui/ColdStartNotice';

// Import Pages
import LandingPage from './pages/LandingPage';
import FeaturesPage from './pages/public/FeaturesPage';
import TechnologyPage from './pages/public/TechnologyPage';
import PricingPage from './pages/public/PricingPage';
import ContactPage from './pages/public/ContactPage';
import DemoPage from './pages/public/DemoPage';
import AboutPage from './pages/public/AboutPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import Dashboard from './pages/Dashboard';
import InterviewConfig from './pages/InterviewConfig';
import InterviewSession from './pages/InterviewSession';
// Split out too: the scorecard carries the chart layer and is only ever reached AFTER an
// interview ends, so it has no business sitting in the bundle a candidate downloads
// before one starts.
const ReportDetailPage = lazy(() => import('./pages/ReportDetailPage'));
import CodingInterview from './pages/CodingInterview';
import ResumeJdAnalyzer from './pages/ResumeJdAnalyzer';
import InterviewHistory from './pages/InterviewHistory';
import ProfilePage from './pages/ProfilePage';
import InterviewSetup from './pages/InterviewSetup';
import OfficialInterviewStart from './pages/OfficialInterviewStart';
import OfficialThankYou from './pages/OfficialThankYou';
import { isAdminRole } from './utils/constants';

// The Admin Portal is code-split, and deliberately so: it pulls in the whole admin design
// system (Radix primitives, motion, the chart layer) which a candidate never renders.
// Bundled eagerly it added ~84KB gzipped to the download that stands between a candidate
// and the start of their interview — paid on mobile data, on the one page load that must
// not be slow. Admins take a one-off chunk fetch on entering the portal instead.
// Everything candidate- and interview-facing above stays eagerly imported.
const AdminLayout = lazy(() => import('./layouts/AdminLayout'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage'));
const AdminUserProfilePage = lazy(() => import('./pages/AdminUserProfilePage'));
const AdminInterviewsPage = lazy(() => import('./pages/AdminInterviewsPage'));
const AdminScoringPage = lazy(() => import('./pages/AdminScoringPage'));
const AdminTransactionsPage = lazy(() => import('./pages/AdminTransactionsPage'));
const AdminFeedbackPage = lazy(() => import('./pages/AdminFeedbackPage'));
const AdminLogsPage = lazy(() => import('./pages/AdminLogsPage'));
const AdminApprovalsPage = lazy(() => import('./pages/AdminApprovalsPage'));

// The management portal is code-split too, and for a stronger reason than the Admin Hub:
// almost nobody ever opens it, and it is reachable without an ordinary session at all.
const SuperAdminLoginPage = lazy(() => import('./pages/superadmin/SuperAdminLoginPage'));
const SuperAdminPortal = lazy(() => import('./pages/superadmin/SuperAdminPortal'));

// Not lazy: it renders in place of whatever admin page was asked for, so a chunk fetch
// here would put a spinner in front of the only thing the account is allowed to do.
import ChangePasswordPage from './pages/ChangePasswordPage';

// A one-time (completed-course) candidate: single proctored interview, no dashboard (§3.3)
const isOneTimeCandidate = (user) => !!user && user.must_use_otp && !isAdminRole(user.role);

const FullPageSpinner = () => (
  <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center">
    <Spinner size="md" label="Loading..." />
  </div>
);

// Protected Route Guard
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <FullPageSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // One-time candidates never see the dashboard shell — they are locked to the
  // official interview flow.
  if (isOneTimeCandidate(user)) {
    return <Navigate to="/interview/official" replace />;
  }

  return <DashboardLayout>{children}</DashboardLayout>;
};

// The official interview gate: only for one-time candidates.
const OfficialGateRoute = () => {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isOneTimeCandidate(user)) return <Navigate to="/dashboard" replace />;
  return <OfficialInterviewStart />;
};

// Interview session: one-time candidates get a bare full-screen shell (no sidebar to
// navigate away with); everyone else keeps the existing DashboardLayout unchanged.
const InterviewSessionRoute = () => {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (isOneTimeCandidate(user)) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 p-5 md:p-8 overflow-y-auto">
        <InterviewSession />
      </div>
    );
  }
  return (
    <ProtectedRoute>
      <InterviewSession />
    </ProtectedRoute>
  );
};

// Interview report: for one-time candidates the interview's end means thank-you +
// forced logout (§3.3 steps 7–8) instead of the report page.
const InterviewReportRoute = () => {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (isOneTimeCandidate(user)) {
    return <OfficialThankYou />;
  }
  if (!user) return <Navigate to="/login" replace />;
  // An admin reviewing a candidate's report from the Admin Hub stays inside the Admin
  // Portal shell (same sidebar/header) instead of switching to the candidate's
  // DashboardLayout — that swap felt like leaving the app entirely rather than a smooth
  // in-portal navigation. Candidates viewing their own report are unaffected.
  if (isAdminRole(user.role)) {
    return (
      <AdminLayout>
        <ReportDetailPage />
      </AdminLayout>
    );
  }
  return (
    <ProtectedRoute>
      <ReportDetailPage />
    </ProtectedRoute>
  );
};

// Admin Route Guard
const AdminRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center">
        <Spinner size="md" label="Loading..." />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdminRole(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  // An account still on its generated password reaches nothing else. Caught here rather
  // than left to the backend's 403 so the person sees the form instead of an error: the
  // API refuses the whole admin surface until this is done, so every page they could land
  // on would otherwise fail at once with no way forward.
  if (user.must_change_password) {
    return <ChangePasswordPage />;
  }

  return <AdminLayout>{children}</AdminLayout>;
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        {/* PWA-only, progressive enhancements — both no-op in a normal browser tab / when
            service workers are unavailable, so core app behavior is never affected. */}
        <LaunchSplash />
        <PwaUpdatePrompt />
        <ColdStartNotice />
        <Router>
          {/* Required by the code-split Admin Portal above. Eagerly-imported routes never
              suspend, so this fallback is only ever seen while an admin chunk downloads. */}
          <Suspense fallback={<FullPageSpinner />}>
          <Routes>
            {/* Public Pages */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/features" element={<FeaturesPage />} />
            <Route path="/technology" element={<TechnologyPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/demo" element={<DemoPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />

            {/* Candidate Protected Pages */}
            <Route 
              path="/dashboard" 
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/interview/start" 
              element={
                <ProtectedRoute>
                  <InterviewConfig />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/interview/setup/:id" 
              element={
                <ProtectedRoute>
                  <InterviewSetup />
                </ProtectedRoute>
              } 
            />
            <Route path="/interview/official" element={<OfficialGateRoute />} />
            <Route path="/interview/session/:id" element={<InterviewSessionRoute />} />
            <Route path="/interview/report/:id" element={<InterviewReportRoute />} />
            <Route 
              path="/coding" 
              element={
                <ProtectedRoute>
                  <CodingInterview />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/resume-match" 
              element={
                <ProtectedRoute>
                  <ResumeJdAnalyzer />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/history" 
              element={
                <ProtectedRoute>
                  <InterviewHistory />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/profile" 
              element={
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              } 
            />

            {/* Super Admin management portal.
                Deliberately NOT wrapped in AdminRoute/AdminLayout. It runs on its own
                session (see services/superAdminApi.js) and the backend refuses these
                endpoints to an ordinary admin token, so gating it on the Admin Hub's
                session would only produce a page that looks reachable and then 403s.
                The portal itself redirects to its own sign-in when it has no session. */}
            <Route path="/superadmin/login" element={<SuperAdminLoginPage />} />
            <Route path="/superadmin" element={<SuperAdminPortal />} />

            {/* Admin Restricted Pages */}
            <Route 
              path="/admin" 
              element={
                <AdminRoute>
                  <AdminDashboard />
                </AdminRoute>
              } 
            />
            <Route
              path="/admin/users"
              element={
                <AdminRoute>
                  <AdminUsersPage />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/users/:userId"
              element={
                <AdminRoute>
                  <AdminUserProfilePage />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/interviews"
              element={
                <AdminRoute>
                  <AdminInterviewsPage />
                </AdminRoute>
              } 
            />
            <Route
              path="/admin/scoring"
              element={
                <AdminRoute>
                  <AdminScoringPage />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/transactions"
              element={
                <AdminRoute>
                  <AdminTransactionsPage />
                </AdminRoute>
              }
            />
            <Route 
              path="/admin/feedback" 
              element={
                <AdminRoute>
                  <AdminFeedbackPage />
                </AdminRoute>
              } 
            />
            <Route
              path="/admin/logs"
              element={
                <AdminRoute>
                  <AdminLogsPage />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/approvals"
              element={
                <AdminRoute>
                  <AdminApprovalsPage />
                </AdminRoute>
              }
            />

            {/* A stale/typo'd /admin/... URL should stay inside the admin portal (and still
                redirect a non-admin to /dashboard via AdminRoute) rather than falling through
                to the global catch-all below and ejecting the admin to the public landing page. */}
            <Route path="/admin/*" element={<AdminRoute><Navigate to="/admin" replace /></AdminRoute>} />

            {/* Catch-all Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
