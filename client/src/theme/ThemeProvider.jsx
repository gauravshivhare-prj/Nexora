import { createContext, useCallback, useEffect, useMemo, useState } from 'react';

import { DARK_QUERY, THEMES, applyTheme, readTheme, resolveTheme, writeTheme } from './themeStorage.js';

/**
 * One owner of the theme preference.
 *
 * Mirrors AuthProvider: a single source of truth above the routes, so no page
 * keeps its own copy that can drift, and the switcher can appear in the
 * landing navbar, the signed-in navigation and the auth screens while all
 * three read and write the same value.
 *
 * The provider does not render anything theme-dependent itself. It writes
 * `data-theme` onto <html> and everything else follows from the tokens in
 * index.css — which is why a theme change costs one attribute write rather
 * than a re-render of the page.
 *
 * The initial value is read from storage rather than defaulted, and the
 * inline script in index.html has already applied it before first paint, so
 * mounting this provider confirms the current theme instead of changing it.
 */
export const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() =>
    typeof window === 'undefined' ? THEMES.SYSTEM : readTheme(),
  );

  const [resolved, setResolved] = useState(() =>
    typeof window === 'undefined' ? THEMES.LIGHT : resolveTheme(readTheme()),
  );

  /**
   * Follow the operating system while the preference is `system`.
   *
   * Subscribed rather than read once: someone switching their machine to
   * dark at sunset expects the open tab to follow, and a listener that only
   * runs at mount would leave them on the wrong theme until they reload.
   */
  useEffect(() => {
    if (theme !== THEMES.SYSTEM) return undefined;

    const media = window.matchMedia(DARK_QUERY);
    const onChange = () => setResolved(applyTheme(THEMES.SYSTEM));

    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  // Keep the document in step with the preference, including the first
  // render — the inline script and this must not be able to disagree.
  useEffect(() => {
    setResolved(applyTheme(theme));
  }, [theme]);

  const setTheme = useCallback((next) => {
    /*
     * Colours cross-fade, but only for the length of the switch.
     *
     * The attribute enables a global colour transition in index.css. Leaving
     * it on permanently would put a transition on every hover and every
     * scroll-linked state change on the landing page; turning it on for a
     * moment makes the switch feel deliberate and costs nothing afterwards.
     *
     * No cleanup timer is tracked: a second switch inside the window simply
     * extends it, and the attribute is idempotent.
     */
    const root = document.documentElement;
    root.setAttribute('data-theme-changing', '');
    window.setTimeout(() => root.removeAttribute('data-theme-changing'), 260);

    writeTheme(next);
    setThemeState(next);
  }, []);

  const value = useMemo(
    () => ({ theme, resolvedTheme: resolved, isDark: resolved === THEMES.DARK, setTheme }),
    [theme, resolved, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
