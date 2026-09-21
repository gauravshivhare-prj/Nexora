import { Navigate, Route, Routes } from 'react-router-dom';

import { FoundationPage } from '../pages/FoundationPage.jsx';

/**
 * Application routes.
 *
 * Phase 0 has exactly one real route. No placeholder pages exist for future
 * features — they will be added by the phase that implements them.
 *
 * The catch-all is routing infrastructure rather than a feature: without it an
 * unknown URL renders nothing at all, which would look like a broken build.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<FoundationPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
