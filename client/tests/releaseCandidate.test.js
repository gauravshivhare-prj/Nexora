import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const CLIENT_ROOT = resolve(import.meta.dirname, '..');

describe('P30 — Frontend Release Candidate Verification Suite', () => {
  describe('1. Production Build & Static Asset Verification', () => {
    it('index.html exists and defines proper meta tags and viewport', () => {
      const htmlPath = resolve(CLIENT_ROOT, 'index.html');
      assert.ok(existsSync(htmlPath), 'index.html must exist at client root');

      const htmlContent = readFileSync(htmlPath, 'utf8');
      assert.ok(htmlContent.includes('<meta name="viewport"'), 'Viewport meta tag must be present');
      assert.ok(htmlContent.includes('width=device-width'), 'Viewport must define width=device-width');
      assert.ok(htmlContent.includes('<title>'), 'Title tag must be present');
      assert.ok(htmlContent.includes('id="root"'), 'Root container must be present');
    });

    it('vite.config.js configures vendor chunk splitting', () => {
      const configContent = readFileSync(resolve(CLIENT_ROOT, 'vite.config.js'), 'utf8');
      assert.ok(configContent.includes('manualChunks'), 'vite.config.js must define manualChunks');
      assert.ok(configContent.includes('vendor-react'), 'vendor-react chunk must be configured');
      assert.ok(configContent.includes('vendor-router'), 'vendor-router chunk must be configured');
    });
  });

  describe('2. Exhaustive Route & Navigation Audit', () => {
    it('AppRoutes defines complete core loop routes without dead ends', () => {
      const routesContent = readFileSync(resolve(CLIENT_ROOT, 'src/routes/AppRoutes.jsx'), 'utf8');

      const requiredPaths = [
        '/',
        '/login',
        '/register',
        '/app',
        '/profile',
        '/resume',
        '/resume/:resumeId',
        '/career-twin',
        '/assessments',
        '/assessments/:assessmentId',
        '/assessments/:assessmentId/run',
        '/interviews',
        '/interviews/:sessionId',
        '/careers',
        '/careers/:roleId/skill-gap',
        '/careers/:roleId/roadmap',
        '/opportunities',
      ];

      for (const p of requiredPaths) {
        assert.ok(
          routesContent.includes(`path="${p}"`),
          `Route ${p} must be declared in AppRoutes`,
        );
      }

      assert.ok(
        routesContent.includes('path="*"') && routesContent.includes('Navigate to="/"'),
        'Wildcard fallback route must redirect cleanly to /',
      );
    });

    it('AppNav defines all 8 core destinations with accessible min-h-[44px] touch targets', () => {
      const navContent = readFileSync(resolve(CLIENT_ROOT, 'src/components/AppNav.jsx'), 'utf8');

      const requiredDestinations = [
        '/app',
        '/profile',
        '/resume',
        '/career-twin',
        '/assessments',
        '/interviews',
        '/careers',
        '/opportunities',
      ];

      for (const d of requiredDestinations) {
        assert.ok(navContent.includes(`'${d}'`), `AppNav must include destination ${d}`);
      }

      assert.ok(
        navContent.includes('min-h-[44px]'),
        'AppNav links and buttons must meet touch target minimum of 44px',
      );
    });
  });

  describe('3. Accessibility & WCAG AA Contrast Compliance', () => {
    it('Design tokens in index.css declare verified WCAG AA high-contrast values', () => {
      const cssContent = readFileSync(resolve(CLIENT_ROOT, 'src/index.css'), 'utf8');

      assert.ok(cssContent.includes('--color-brand:'), 'Brand color token must exist');
      assert.ok(cssContent.includes('--color-brand-text:'), 'High-contrast brand text token must exist');
      assert.ok(cssContent.includes('--color-on-brand:'), 'On-brand text token must exist');
      assert.ok(cssContent.includes('[data-theme=\'dark\']'), 'Dark theme token block must exist');
    });

    it('PageHeader and PageShell provide semantic landmarks and return breadcrumbs', () => {
      const shellContent = readFileSync(resolve(CLIENT_ROOT, 'src/components/PageShell.jsx'), 'utf8');

      assert.ok(shellContent.includes('<main'), 'PageShell must render semantic <main> landmark');
      assert.ok(shellContent.includes('<header'), 'PageHeader must render semantic <header> landmark');
      assert.ok(shellContent.includes('backTo = \'/app\''), 'PageHeader must default back navigation to /app');
    });
  });

  describe('4. Truthful Evidence & Zero Fabricated Numbers', () => {
    it('ReadinessVisualization does not compute or display synthetic percentages', () => {
      const readinessContent = readFileSync(
        resolve(CLIENT_ROOT, 'src/components/ReadinessVisualization.jsx'),
        'utf8',
      );

      assert.ok(
        readinessContent.includes('Readiness is based on evidence states, not a percentage or overall score.'),
        'Readiness must explicitly disclose that evidence states are the measure, not an invented percentage',
      );
    });

    it('SkillGapPage displays evidence states without synthetic coverage score', () => {
      const gapSource = readFileSync(
        resolve(CLIENT_ROOT, 'src/pages/SkillGapPage.jsx'),
        'utf8',
      );
      const gapStatusSource = readFileSync(
        resolve(CLIENT_ROOT, 'src/components/careers/GapStatus.jsx'),
        'utf8',
      );

      assert.ok(
        gapSource.includes('GapStatusBadge') && gapSource.includes('GapStatusLegend'),
        'SkillGapPage must use standardized GapStatus components',
      );
      assert.ok(
        gapStatusSource.includes('MISSING') &&
        gapStatusSource.includes('CLAIMED') &&
        gapStatusSource.includes('SUPPORTED') &&
        gapStatusSource.includes('VERIFIED'),
        'GapStatus must distinguish all 4 evidence states',
      );
    });
  });

  describe('5. Mobile Responsiveness & Overflow Protection', () => {
    it('index.css declares global overflow protection', () => {
      const cssContent = readFileSync(resolve(CLIENT_ROOT, 'src/index.css'), 'utf8');
      assert.ok(
        cssContent.includes('overflow-wrap: anywhere'),
        'index.css must enforce global word breaking for mobile viewport bounds',
      );
    });
  });
});
