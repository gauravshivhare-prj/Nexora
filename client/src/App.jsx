import { BrowserRouter } from 'react-router-dom';

import { AuthProvider } from './context/AuthContext.jsx';
import { AppRoutes } from './routes/AppRoutes.jsx';
import { ThemeProvider } from './theme/ThemeProvider.jsx';

/**
 * Application root: router, theme and session context only.
 *
 * AuthProvider sits inside the router so that navigation is available to
 * anything the session needs, and above the routes so every page shares one
 * session.
 *
 * ThemeProvider sits outside both: the theme belongs to the browser rather
 * than to the session, applies to the public pages as much as the signed-in
 * ones, and must not be torn down and re-read when a session ends.
 */
export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
