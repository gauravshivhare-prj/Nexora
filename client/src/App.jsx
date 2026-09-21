import { BrowserRouter } from 'react-router-dom';

import { AppRoutes } from './routes/AppRoutes.jsx';

/** Application root: router context only. Page composition lives in routes. */
export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
