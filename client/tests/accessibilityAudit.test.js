import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_DIR = path.resolve(__dirname, '../src');

describe('P25 — Comprehensive Accessibility & WCAG AA Audit Suite', () => {
  const readSrc = (relPath) => fs.readFileSync(path.join(CLIENT_DIR, relPath), 'utf8');

  describe('1. Global Focus and Keyboard Navigation', () => {
    it('index.css declares global :focus-visible with outline and offset', () => {
      const css = readSrc('index.css');
      assert.ok(css.includes(':focus-visible'), 'index.css must define :focus-visible');
      assert.ok(css.includes('outline-brand'), 'focus ring must use brand outline');
      assert.ok(css.includes('outline-offset-2'), 'focus ring must have visible offset');
    });

    it('AppNav includes skip to content link as first focusable element', () => {
      const appNav = readSrc('components/AppNav.jsx');
      assert.ok(appNav.includes('href="#main-content"'), 'AppNav must have skip to content link');
      assert.ok(appNav.includes('Skip to content'), 'Skip link text must be present');
      assert.ok(appNav.includes('sr-only focus:not-sr-only'), 'Skip link must be accessible on focus');
    });

    it('prefers-reduced-motion is respected globally with 0.01ms duration', () => {
      const css = readSrc('index.css');
      assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'), 'CSS must handle reduced motion');
      assert.ok(css.includes('animation-duration: 0.01ms !important'), 'Animations must be zeroed for reduced motion');
    });
  });

  describe('2. WCAG AA Text Contrast Compliance', () => {
    it('defines dedicated AA-compliant text tokens for brand, danger, and warning', () => {
      const css = readSrc('index.css');
      assert.ok(css.includes('--color-brand-text: #c2410c'), 'brand-text must be #c2410c (>=4.5:1)');
      assert.ok(css.includes('--color-danger-text: #b91c1c'), 'danger-text must be #b91c1c (>=4.5:1)');
      assert.ok(css.includes('--color-warning-text: #92400e'), 'warning-text must be #92400e (>=4.5:1)');
      assert.ok(css.includes('--color-on-brand: #3b0a03'), 'on-brand text must be #3b0a03');
    });

    it('login and register links use text-brand-text rather than text-brand', () => {
      const login = readSrc('pages/LoginPage.jsx');
      const register = readSrc('pages/RegisterPage.jsx');
      assert.ok(login.includes('text-brand-text hover:underline'), 'LoginPage link must use text-brand-text');
      assert.ok(register.includes('text-brand-text hover:underline'), 'RegisterPage link must use text-brand-text');
    });
  });

  describe('3. Accessible Names and ARIA Associations', () => {
    it('all icon-only buttons declare descriptive aria-label attributes', () => {
      const opps = readSrc('pages/OpportunitiesPage.jsx');
      assert.ok(opps.includes('aria-label="Clear search"'), 'Clear search button must have aria-label');
      assert.ok(opps.includes('aria-label="Close details"'), 'Close details button must have aria-label');
    });

    it('form inputs and textareas link errors using aria-describedby and aria-invalid', () => {
      const fieldShell = readSrc('components/FieldShell.jsx');
      const interviewSession = readSrc('pages/InterviewSessionPage.jsx');

      assert.ok(fieldShell.includes('describedBy = error ? errorId'), 'FieldShell must link error to input');
      assert.ok(
        interviewSession.includes("aria-describedby={submitError ? 'interview-answer-error' : undefined}"),
        'Interview textarea must link error to input',
      );
    });
  });

  describe('4. Semantic Landmarks & Minimum Touch Targets (>= 44px)', () => {
    it('PageShell provides semantic <main> landmark', () => {
      const pageShell = readSrc('components/PageShell.jsx');
      assert.ok(pageShell.includes('<main'), 'PageShell must render <main>');
    });

    it('PageHeader renders single <h1> per page', () => {
      const pageShell = readSrc('components/PageShell.jsx');
      assert.ok(pageShell.includes('<h1'), 'PageHeader must render <h1>');
    });

    it('navigation and action buttons enforce min-h-[44px]', () => {
      const appNav = readSrc('components/AppNav.jsx');
      const pageShell = readSrc('components/PageShell.jsx');
      assert.ok(pageShell.includes('min-h-[44px]'), 'PageHeader back link must have min-h-[44px]');
      assert.ok(appNav.includes('min-h-[44px]'), 'AppNav items must meet touch targets');
    });
  });
});
