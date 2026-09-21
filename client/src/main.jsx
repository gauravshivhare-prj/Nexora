import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.jsx';
import './index.css';

const container = document.getElementById('root');

if (!container) {
  // index.html and this file must agree; fail loudly rather than silently
  // rendering nothing.
  throw new Error('Root element #root was not found in index.html.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
