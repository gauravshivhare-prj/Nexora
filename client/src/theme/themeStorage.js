/**
 * Where the theme preference lives, and how it reaches the document.
 *
 * Deliberately plain functions with no React in them, because the same logic
 * has to run twice in different worlds: once in the inline script in
 * index.html, before React exists, to avoid a flash of the wrong theme; and
 * once inside the provider afterwards. Keeping the key, the valid values and
 * the resolution rule in one module is what stops those two from drifting.
 */

const THEME_KEY = 'nexora.theme';

/** The three things a visitor can choose. `system` is the default. */
export const THEMES = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
};

export const THEME_VALUES = [THEMES.LIGHT, THEMES.DARK, THEMES.SYSTEM];

export const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * Storage can throw — Safari's private mode and hardened browser settings
 * both reject writes — so the theme degrades to "not remembered" rather than
 * taking the page down with it. Same guard as tokenStorage.js.
 */
function safely(operation, fallback = null) {
  try {
    return operation();
  } catch {
    return fallback;
  }
}

/**
 * @returns {'light' | 'dark' | 'system'} The stored preference, or `system`.
 *   An unrecognised stored value is treated as absent rather than trusted:
 *   it is user-writable, and a typo should not leave the app themeless.
 */
export function readTheme() {
  const stored = safely(() => window.localStorage.getItem(THEME_KEY));
  return THEME_VALUES.includes(stored) ? stored : THEMES.SYSTEM;
}

export function writeTheme(theme) {
  safely(() => window.localStorage.setItem(THEME_KEY, theme));
}

/** What `system` currently means. */
function systemTheme() {
  return window.matchMedia(DARK_QUERY).matches ? THEMES.DARK : THEMES.LIGHT;
}

/** The preference resolved to an actual theme. */
export function resolveTheme(theme) {
  return theme === THEMES.SYSTEM ? systemTheme() : theme;
}

/**
 * Writes the resolved theme onto <html>, which is what every token in
 * index.css keys off.
 *
 * `data-theme` is always present and always `light` or `dark` — never
 * `system` — so CSS never has to ask what the preference meant. The
 * preference itself is mirrored in `data-theme-preference` so the switcher
 * can show which of the three is selected after a reload without reading
 * storage a second time.
 */
export function applyTheme(theme) {
  const resolved = resolveTheme(theme);
  const root = document.documentElement;

  root.dataset.theme = resolved;
  root.dataset.themePreference = theme;

  return resolved;
}
