import { useContext } from 'react';

import { ThemeContext } from '../theme/ThemeProvider.jsx';

/**
 * Reads the theme preference and the setter.
 *
 * Throws outside the provider, for the same reason useAuth does: that is a
 * wiring mistake rather than a state a component should handle.
 */
export function useTheme() {
  const context = useContext(ThemeContext);

  if (context === null) {
    throw new Error('useTheme must be used inside a <ThemeProvider>.');
  }
  return context;
}
