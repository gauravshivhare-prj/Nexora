import { Outlet } from 'react-router-dom';

import { AppNav } from '../components/AppNav.jsx';
import { ProtectedRoute } from '../components/ProtectedRoute.jsx';

/**
 * The frame every signed-in page sits in.
 *
 * A layout route rather than a component each page renders, for two
 * reasons. The nav is mounted once and survives navigation, so its open or
 * closed state and its scroll position do not reset on every click. And
 * `ProtectedRoute` wraps the layout rather than each page, which means a
 * route added inside it is protected by construction — the previous
 * arrangement, where every route repeated its own guard, protected pages
 * only as long as nobody forgot one.
 */
export function AppLayout() {
  return (
    <ProtectedRoute>
      <div className="flex min-h-dvh flex-col">
        <AppNav />
        {/*
          A skip target, because the nav sits before the content on every
          page and a keyboard user should not tab through five links to
          reach it each time.
        */}
        <div id="main-content" tabIndex={-1} className="flex-1 outline-none">
          <Outlet />
        </div>
      </div>
    </ProtectedRoute>
  );
}
