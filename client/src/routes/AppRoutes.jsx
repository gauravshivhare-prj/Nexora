import { Navigate, Route, Routes } from 'react-router-dom';

import { AppLayout } from '../layouts/AppLayout.jsx';
import { AssessmentRunnerPage } from '../pages/AssessmentRunnerPage.jsx';
import { AssessmentsPage } from '../pages/AssessmentsPage.jsx';
import { CareerTwinPage } from '../pages/CareerTwinPage.jsx';
import { CareersPage } from '../pages/CareersPage.jsx';
import { DashboardPage } from '../pages/DashboardPage.jsx';
import { LandingPage } from '../pages/LandingPage.jsx';
import { LoginPage } from '../pages/LoginPage.jsx';
import { ProfilePage } from '../pages/ProfilePage.jsx';
import { RegisterPage } from '../pages/RegisterPage.jsx';
import { ResumeDetailPage } from '../pages/ResumeDetailPage.jsx';
import { ResumePage } from '../pages/ResumePage.jsx';
import { RoadmapPage } from '../pages/RoadmapPage.jsx';
import { SkillGapPage } from '../pages/SkillGapPage.jsx';

/**
 * Application routes.
 *
 * Public routes sit at the top level; everything a signed-in student uses
 * sits inside AppLayout, which carries both the navigation and the auth
 * guard. Nesting the guard means a route added below it is protected
 * because of where it is, not because someone remembered to wrap it — the
 * previous arrangement repeated ProtectedRoute per route, which is one
 * omission away from a leak.
 *
 * Only routes for currently delivered UI views exist. While assessment backend
 * endpoints are delivered and ready for client service integration, their UI views
 * (along with AI interviews and opportunities) are scheduled for subsequent UI phases.
 *
 * The catch-all is routing infrastructure rather than a feature: without it
 * an unknown URL renders nothing, which would look like a broken build.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route element={<AppLayout />}>
        <Route path="/app" element={<DashboardPage />} />
        <Route path="/profile" element={<ProfilePage />} />

        <Route path="/resume" element={<ResumePage />} />
        <Route path="/resume/:resumeId" element={<ResumeDetailPage />} />

        <Route path="/career-twin" element={<CareerTwinPage />} />
        <Route path="/assessments" element={<AssessmentsPage />} />
        <Route path="/assessments/:assessmentId" element={<AssessmentRunnerPage />} />
        <Route path="/assessments/:assessmentId/run" element={<AssessmentRunnerPage />} />

        <Route path="/careers" element={<CareersPage />} />
        <Route path="/careers/:roleId/skill-gap" element={<SkillGapPage />} />
        <Route path="/careers/:roleId/roadmap" element={<RoadmapPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
