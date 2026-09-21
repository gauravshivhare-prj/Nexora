import { Navigate, Route, Routes } from 'react-router-dom';

import { ProtectedRoute } from '../components/ProtectedRoute.jsx';
import { AuthenticatedPage } from '../pages/AuthenticatedPage.jsx';
import { FoundationPage } from '../pages/FoundationPage.jsx';
import { LoginPage } from '../pages/LoginPage.jsx';
import { RegisterPage } from '../pages/RegisterPage.jsx';

/**
 * Application routes.
 *
 * Phase 1 surface: the public foundation page, the two auth screens, and one
 * protected placeholder. No routes exist for future features — they will be
 * added by the phase that implements them.
 *
 * The catch-all is routing infrastructure rather than a feature: without it
 * an unknown URL renders nothing, which would look like a broken build.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<FoundationPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <AuthenticatedPage />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
