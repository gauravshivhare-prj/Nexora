import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { ThemeToggle } from '../ThemeToggle.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { useActiveSection } from './animation/useActiveSection.js';

/**
 * The public navigation.
 *
 * Four in-page destinations, because the page is a single narrative and the
 * nav's job is to let someone re-enter it at the part they care about. It
 * does not list product areas that only exist behind a login.
 *
 * The scroll treatment — the bar gaining a surface, a border and a blur once
 * the hero has moved — is driven by one passive scroll listener that does
 * nothing but compare a number and, at most twice per scroll, set a boolean.
 * It reads `window.scrollY`, which is free; nothing here measures an element.
 */
const SECTIONS = [
  { id: 'how-it-works', label: 'How It Works' },
  { id: 'career-twin', label: 'CareerTwin' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'roadmap', label: 'Roadmap' },
];

/*
 * The same four ids in the order they appear in the document, which is not
 * the order they are listed in above: "How It Works" is the loop, and the
 * loop is the payoff that sits after the individual stages. The active-state
 * hook resolves ties by taking the last qualifying section, so it needs
 * document order to be right, and the navigation needs its own order to stay
 * as designed.
 */
const SECTION_IDS = ['career-twin', 'evidence', 'roadmap', 'how-it-works'];

export function LandingNavbar() {
  const { isAuthenticated, isRestoring } = useAuth();
  const activeSection = useActiveSection(SECTION_IDS);

  const [isCondensed, setIsCondensed] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const menuButton = useRef(null);

  useEffect(() => {
    let frame = 0;

    const read = () => {
      frame = 0;
      // Hysteresis: two thresholds rather than one, so a scroll position
      // sitting exactly on the boundary cannot flip the bar back and forth.
      setIsCondensed((condensed) => {
        const y = window.scrollY;
        return condensed ? y > 24 : y > 64;
      });
    };

    const onScroll = () => {
      // Coalesce to one read per frame. Without this, a fast wheel or a
      // trackpad fling calls the handler dozens of times per frame.
      if (frame) return;
      frame = requestAnimationFrame(read);
    };

    read();
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // Escape closes the panel and returns focus to the control that opened it,
  // which is the one thing a disclosure must not get wrong for a keyboard
  // user: without it, focus is left inside a panel that is no longer there.
  useEffect(() => {
    if (!isMenuOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      setIsMenuOpen(false);
      menuButton.current?.focus();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMenuOpen]);

  const sessionLink = !isRestoring && isAuthenticated ? '/app' : '/login';
  const sessionLabel = !isRestoring && isAuthenticated ? 'Your dashboard' : 'Sign in';

  return (
    <header
      data-condensed={isCondensed ? 'true' : 'false'}
      className={`sticky top-0 z-50 border-b transition-colors duration-300 ${
        isCondensed
          ? // Nearly opaque rather than translucent: the page ends on a dark
            // surface, and 85% canvas over it reads as washed-out grey.
            'border-orange-100 bg-canvas/95 shadow-sm shadow-orange-900/5 backdrop-blur-md'
          : 'border-transparent bg-transparent'
      }`}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-on-brand"
      >
        Skip to content
      </a>

      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3.5 sm:px-6">
        <Link
          to="/"
          className="flex items-center gap-2.5 rounded-lg"
          aria-label="Nexora — home"
        >
          <Wordmark />
        </Link>

        <nav aria-label="Page sections" className="hidden lg:block">
          <ul className="flex items-center gap-0.5">
            {SECTIONS.map((section) => {
              const isActive = activeSection === section.id;

              return (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    // Announced, not only tinted. Four links that look
                    // different and read identically is the same failure the
                    // signed-in nav avoids with NavLink's aria-current.
                    aria-current={isActive ? 'true' : undefined}
                    className={`relative inline-block rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 ${
                      isActive
                        ? 'text-ink'
                        : 'text-ink-muted hover:bg-orange-100/70 hover:text-ink'
                    }`}
                  >
                    {section.label}

                    {/* The indicator: a short rule under the active label,
                        scaled in rather than appearing, and transform-only. */}
                    <span
                      aria-hidden="true"
                      className={`absolute inset-x-3 -bottom-0.5 h-0.5 origin-center rounded-full bg-brand transition-transform duration-300 ${
                        isActive ? 'scale-x-100' : 'scale-x-0'
                      }`}
                    />
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex items-center gap-2 sm:gap-2.5">
          <ThemeToggle className="hidden sm:inline-flex" />

          <Link
            to={sessionLink}
            className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-ink transition-colors duration-200 hover:text-brand-text sm:inline-block"
          >
            {sessionLabel}
          </Link>

          <Link
            to="/register"
            className="nx-cta hidden rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-on-brand shadow-sm shadow-orange-900/20 hover:bg-brand-soft sm:inline-block"
          >
            Build Your CareerTwin
          </Link>

          <button
            ref={menuButton}
            type="button"
            onClick={() => setIsMenuOpen((open) => !open)}
            aria-expanded={isMenuOpen}
            aria-controls="landing-nav-panel"
            className="inline-flex items-center gap-2 rounded-xl border border-orange-200 bg-surface/80 px-3 py-2 text-sm font-semibold text-ink transition-colors duration-200 hover:border-brand hover:text-brand-text lg:hidden"
          >
            <MenuGlyph isOpen={isMenuOpen} />
            Menu
          </button>
        </div>
      </div>

      {/*
        `hidden` rather than unmounted, so the element `aria-controls` names is
        always in the document, and so opening the panel adds no layout cost
        beyond becoming visible.
      */}
      <div
        id="landing-nav-panel"
        hidden={!isMenuOpen}
        className="border-t border-orange-100 bg-canvas/95 backdrop-blur-md lg:hidden"
      >
        <nav aria-label="Page sections" className="mx-auto w-full max-w-6xl px-5 py-4 sm:px-6">
          <ul className="flex flex-col gap-1">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  onClick={() => setIsMenuOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm font-medium text-ink transition-colors duration-200 hover:bg-orange-100/70"
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-orange-100 pt-4">
            <span className="text-xs font-semibold tracking-[0.18em] text-ink-muted uppercase">
              Theme
            </span>
            {/* Labels shown here: the panel has the width for them, and a
                row of three unlabelled glyphs on a phone is a guess. */}
            <ThemeToggle showLabels />
          </div>

          <div className="mt-4 flex flex-col gap-2 border-t border-orange-100 pt-4">
            <Link
              to="/register"
              onClick={() => setIsMenuOpen(false)}
              className="rounded-xl bg-brand px-4 py-2.5 text-center text-sm font-semibold text-on-brand transition-colors duration-200 hover:bg-brand-soft"
            >
              Build Your CareerTwin
            </Link>
            <Link
              to={sessionLink}
              onClick={() => setIsMenuOpen(false)}
              className="rounded-xl border border-orange-200 px-4 py-2.5 text-center text-sm font-semibold text-ink transition-colors duration-200 hover:border-brand hover:text-brand-text"
            >
              {sessionLabel}
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}

/**
 * The wordmark.
 *
 * Inline SVG: one mark, no network request, and it inherits the type scale.
 * The glyph is the product's own idea — a node with evidence gathering around
 * it — rather than a generic spark or brain.
 */
function Wordmark() {
  return (
    <>
      <svg viewBox="0 0 32 32" aria-hidden="true" className="size-7 shrink-0">
        <circle cx="16" cy="16" r="14" fill="#EA580C" />
        <circle cx="16" cy="16" r="4.4" fill="#FFF7ED" />
        <g stroke="#FFF7ED" strokeWidth="1.6" strokeLinecap="round" opacity="0.9">
          <path d="M16 11.6V6.4" />
          <path d="M19.8 18.2l4.5 2.6" />
          <path d="M12.2 18.2l-4.5 2.6" />
        </g>
        <circle cx="16" cy="6.4" r="2.4" fill="#FFF7ED" />
        <circle cx="24.3" cy="20.8" r="2.4" fill="#FFF7ED" opacity="0.75" />
        <circle cx="7.7" cy="20.8" r="2.4" fill="#FFF7ED" opacity="0.55" />
      </svg>

      <span className="text-base font-bold tracking-[0.16em] text-ink uppercase">Nexora</span>
    </>
  );
}

/** Two bars that become a cross. Transform only. */
function MenuGlyph({ isOpen }) {
  return (
    <span aria-hidden="true" className="relative block size-3.5">
      <span
        className={`absolute left-0 block h-[2px] w-full rounded bg-current transition-transform duration-300 ${
          isOpen ? 'top-1.5 rotate-45' : 'top-0.5'
        }`}
      />
      <span
        className={`absolute left-0 block h-[2px] w-full rounded bg-current transition-transform duration-300 ${
          isOpen ? 'top-1.5 -rotate-45' : 'top-2.5'
        }`}
      />
    </span>
  );
}
