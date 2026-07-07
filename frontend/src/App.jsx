import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import DashboardLayout from './layouts/DashboardLayout';
import Spinner from './components/ui/Spinner';

// Import Pages
import LandingPage from './pages/LandingPage';
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
import AdminTransactionsPage from './pages/AdminTransactionsPage';
import AdminFeedbackPage from './pages/AdminFeedbackPage';
import AdminLogsPage from './pages/AdminLogsPage';

// Protected Route Guard
const ProtectedRoute = ({ children }) => {
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

  return <DashboardLayout>{children}</DashboardLayout>;
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
            <Route 
              path="/interview/session/:id" 
              element={
                <ProtectedRoute>
                  <InterviewSession />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/interview/report/:id" 
              element={
                <ProtectedRoute>
                  <ReportDetailPage />
                </ProtectedRoute>
              } 
            />
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

            {/* Catch-all Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
