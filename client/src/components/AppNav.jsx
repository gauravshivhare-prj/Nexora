import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';

import { ThemeToggle } from './ThemeToggle.jsx';
import { useAuth } from '../hooks/useAuth.js';

/**
 * Navigation for the signed-in application.
 *
 * Only the destinations that exist are listed. The UI spec names ten
 * sections, but four of them — assessments, AI interview, opportunities,
 * onboarding — have no routes and no endpoints behind them, and a nav item
 * that leads nowhere is a promise the product cannot keep.
 *
 * Horizontal from `sm` up, a disclosure below it. A row of five links on a
 * phone either wraps into something unreadable or scrolls sideways
 * invisibly; a button that says "Menu" does neither.
 */
const DESTINATIONS = [
  { to: '/app', label: 'Dashboard', end: true },
  { to: '/profile', label: 'Profile' },
  { to: '/resume', label: 'Resume' },
  { to: '/career-twin', label: 'CareerTwin' },
  { to: '/assessments', label: 'Assessments' },
  { to: '/careers', label: 'Careers' },
];

export function AppNav() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Closing on navigation is not cosmetic: on a phone the panel covers the
  // page, so leaving it open after a tap would hide the thing just opened.
  useEffect(() => setIsOpen(false), [location.pathname]);

  async function handleLogout() {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    // logout() clears the session even if the request fails and the route
    // guard then redirects, so there is no failure branch to handle.
    await logout();
  }

  return (
    <header className="sticky top-0 z-10 border-b border-orange-100 bg-canvas/90 backdrop-blur">
      {/*
        First focusable thing on every page, visible only once focused.
        Without it a keyboard user tabs through the whole nav on every
        navigation before reaching the content.
      */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-20 focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-on-brand"
      >
        Skip to content
      </a>

      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-3 sm:px-6">
        <Link
          to="/app"
          className="text-sm font-bold tracking-[0.2em] text-brand-text uppercase"
        >
          Nexora
        </Link>

        {/* Desktop */}
        <nav aria-label="Main" className="hidden sm:block">
          <ul className="flex items-center gap-1">
            {DESTINATIONS.map((destination) => (
              <li key={destination.to}>
                <NavItem destination={destination} />
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <p className="hidden text-sm text-ink-muted lg:block">{user.name}</p>

          {/* Same control as the public pages: the theme belongs to the
              browser, so it must be reachable from inside the product too
              rather than only from the landing page. */}
          <ThemeToggle className="hidden sm:inline-flex" />

          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            aria-busy={isLoggingOut}
            className="rounded-lg border border-orange-200 px-3 py-1.5 text-sm font-semibold text-ink transition-colors duration-200 hover:border-brand hover:text-brand-text disabled:cursor-not-allowed disabled:text-ink-muted"
          >
            {isLoggingOut ? 'Signing out…' : 'Log out'}
          </button>

          <button
            type="button"
            onClick={() => setIsOpen((open) => !open)}
            aria-expanded={isOpen}
            aria-controls="app-nav-panel"
            className="rounded-lg border border-orange-200 px-3 py-1.5 text-sm font-semibold text-ink transition-colors duration-200 hover:border-brand hover:text-brand-text sm:hidden"
          >
            Menu
          </button>
        </div>
      </div>

      {/* Mobile. `hidden` rather than unmounted, so the aria-controls target
          the button points at is always in the document. */}
      <nav
        id="app-nav-panel"
        aria-label="Main"
        hidden={!isOpen}
        className="border-t border-orange-100 sm:hidden"
      >
        <ul className="mx-auto flex w-full max-w-5xl flex-col gap-1 px-5 py-3">
          {DESTINATIONS.map((destination) => (
            <li key={destination.to}>
              <NavItem destination={destination} block />
            </li>
          ))}
        </ul>

        {/* The switcher is hidden beside the logout button at this width, so
            it lives here instead — otherwise the theme would be unreachable
            from inside the product on a phone. */}
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 border-t border-orange-100 px-5 py-3">
          <span className="text-xs font-semibold tracking-[0.18em] text-ink-muted uppercase">
            Theme
          </span>
          <ThemeToggle showLabels />
        </div>
      </nav>
    </header>
  );
}

/**
 * One destination.
 *
 * `aria-current="page"` comes from NavLink, so the current section is
 * announced rather than only tinted — the colour alone would leave a screen
 * reader with five identical links.
 */
function NavItem({ destination, block = false }) {
  return (
    <NavLink
      to={destination.to}
      end={destination.end}
      className={({ isActive }) =>
        [
          block ? 'block' : 'inline-block',
          'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-200',
          isActive
            ? 'bg-orange-100 font-semibold text-brand-text'
            : 'text-ink-muted hover:bg-orange-50 hover:text-ink',
        ].join(' ')
      }
    >
      {destination.label}
    </NavLink>
  );
}
