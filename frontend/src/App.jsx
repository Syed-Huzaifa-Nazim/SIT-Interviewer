import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import DashboardLayout from './layouts/DashboardLayout';
import Spinner from './components/ui/Spinner';

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
import ReportDetailPage from './pages/ReportDetailPage';
import CodingInterview from './pages/CodingInterview';
import ResumeJdAnalyzer from './pages/ResumeJdAnalyzer';
import InterviewHistory from './pages/InterviewHistory';
import ProfilePage from './pages/ProfilePage';
import AdminDashboard from './pages/AdminDashboard';
import InterviewSetup from './pages/InterviewSetup';
import AdminLayout from './layouts/AdminLayout';
import AdminUsersPage from './pages/AdminUsersPage';
import AdminInterviewsPage from './pages/AdminInterviewsPage';
import AdminScoringPage from './pages/AdminScoringPage';
import AdminTransactionsPage from './pages/AdminTransactionsPage';
import AdminFeedbackPage from './pages/AdminFeedbackPage';
import AdminLogsPage from './pages/AdminLogsPage';
import AdminApprovalsPage from './pages/AdminApprovalsPage';
import OfficialInterviewStart from './pages/OfficialInterviewStart';
import OfficialThankYou from './pages/OfficialThankYou';

// A one-time (completed-course) candidate: single proctored interview, no dashboard (§3.3)
const isOneTimeCandidate = (user) => !!user && user.must_use_otp && user.role !== 'admin';

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

  if (user.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }
  
  return <AdminLayout>{children}</AdminLayout>;
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
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

            {/* Catch-all Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
