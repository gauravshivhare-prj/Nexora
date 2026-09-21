import { BrowserRouter } from 'react-router-dom';

import { AuthProvider } from './context/AuthContext.jsx';
import { AppRoutes } from './routes/AppRoutes.jsx';

/**
 * Application root: router and session context only.
 *
 * AuthProvider sits inside the router so that navigation is available to
 * anything the session needs, and above the routes so every page shares one
 * session.
 */
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
