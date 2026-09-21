import { Navigate, Route, Routes } from 'react-router-dom';

import { ProtectedRoute } from '../components/ProtectedRoute.jsx';
import { AuthenticatedPage } from '../pages/AuthenticatedPage.jsx';
import { CareerTwinPage } from '../pages/CareerTwinPage.jsx';
import { CareersPage } from '../pages/CareersPage.jsx';
import { FoundationPage } from '../pages/FoundationPage.jsx';
import { LoginPage } from '../pages/LoginPage.jsx';
import { ProfilePage } from '../pages/ProfilePage.jsx';
import { RegisterPage } from '../pages/RegisterPage.jsx';
import { SkillGapPage } from '../pages/SkillGapPage.jsx';
import { ResumeDetailPage } from '../pages/ResumeDetailPage.jsx';
import { ResumePage } from '../pages/ResumePage.jsx';

/**
 * Application routes.
 *
 * Current surface: the public foundation page, the two auth screens, and the
 * protected pages. No routes exist for future features — they will be added
 * by the phase that implements them.
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

      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/resume"
        element={
          <ProtectedRoute>
            <ResumePage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/resume/:resumeId"
        element={
          <ProtectedRoute>
            <ResumeDetailPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/career-twin"
        element={
          <ProtectedRoute>
            <CareerTwinPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/careers"
        element={
          <ProtectedRoute>
            <CareersPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/careers/:roleId/skill-gap"
        element={
          <ProtectedRoute>
            <SkillGapPage />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
