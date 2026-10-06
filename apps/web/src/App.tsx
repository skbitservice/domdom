import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './providers/ThemeProvider';
import { AuthProvider } from './providers/AuthProvider';
import { supabase } from './lib/supabase';
import { SetupNotice } from './components/SetupNotice';
import { ProtectedRoute } from './components/ProtectedRoute';
import { BackHistoryTracker } from './components/BackHistoryTracker';
import { AppShell } from './components/AppShell';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Landing } from './pages/Landing';
import { Login } from './pages/auth/Login';
import { Register } from './pages/auth/Register';
import { ForgotPassword } from './pages/auth/ForgotPassword';
import { AdminLogin } from './pages/auth/AdminLogin';
import { Home } from './pages/app/Home';
import { Placeholder } from './pages/app/Placeholder';
import { Explore } from './pages/app/Explore';
import { Reels } from './pages/app/Reels';
import { Profile } from './pages/app/Profile';
import { ProfileEdit } from './pages/app/ProfileEdit';
import { Notifications } from './pages/app/Notifications';
import { Messages } from './pages/app/Messages';
import { MyReports } from './pages/app/MyReports';
import { Moderation } from './pages/app/Moderation';
import { AdminDashboard } from './pages/app/admin/AdminDashboard';
import { SavedPosts } from './pages/app/SavedPosts';
import { ProfileView } from './pages/ProfileView';
import { PostDetail } from './pages/PostDetail';
import { NotFound } from './pages/NotFound';

export default function App() {
  if (!supabase) {
    return <SetupNotice />;
  }

  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <BackHistoryTracker />
          <ErrorBoundary>
            <Routes>
              {/* Public */}
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/admin-login" element={<AdminLogin />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              {/* Public profile: anyone can view /profile/:username */}
              <Route path="/profile/:username" element={<ProfileView />} />
              {/* Public post: anyone can view /post/:id (RLS decides visibility) */}
              <Route path="/post/:id" element={<PostDetail />} />

              {/* Logged-in app */}
              <Route
                path="/app"
                element={
                  <ProtectedRoute>
                    <AppShell />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="/app/home" replace />} />
                <Route path="home" element={<Home />} />
                <Route
                  path="explore"
                  element={<Explore />}
                />
                <Route path="reels" element={<Reels />} />
                <Route path="messages" element={<Messages />} />
                <Route path="messages/:conversationId" element={<Messages />} />
                <Route path="notifications" element={<Notifications />} />
                <Route path="profile" element={<Profile />} />
                <Route path="profile/edit" element={<ProfileEdit />} />
                <Route path="saved" element={<SavedPosts />} />
                <Route path="reports" element={<MyReports />} />
                <Route path="moderation" element={<Moderation />} />
                <Route path="admin" element={<AdminDashboard />} />
                <Route
                  path="settings"
                  element={<Placeholder title="Settings" step="A later phase" />}
                />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </ErrorBoundary>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
