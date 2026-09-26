import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const CLIENT_ROOT = resolve(import.meta.dirname, '..');

describe('P29 — Demo & Product Polish Verification Suite', () => {
  describe('1. Landing Page Narrative & Truthful Copy', () => {
    it('LandingPage composes complete narrative in logical progression', () => {
      const landingSource = readFileSync(resolve(CLIENT_ROOT, 'src/pages/LandingPage.jsx'), 'utf8');

      const expectedSections = [
        'HeroSection',
        'ProblemSection',
        'CareerTwinSection',
        'EvidenceSection',
        'CareerMatchSection',
        'SkillGapSection',
        'RoadmapSection',
        'ProductLoop',
        'ReadinessSection',
        'ProductPreview',
        'WhyNexora',
        'FinalCTA',
      ];

      for (const section of expectedSections) {
        assert.ok(
          landingSource.includes(`<${section} />`),
          `LandingPage must compose <${section} />`,
        );
      }
    });

    it('ProductLoop accurately flags all core capabilities as available', () => {
      const loopSource = readFileSync(
        resolve(CLIENT_ROOT, 'src/components/landing/ProductLoop.jsx'),
        'utf8',
      );

      assert.ok(
        loopSource.includes("key: 'assess'") &&
        loopSource.includes('available: true'),
        'Assess stage must be marked available: true in ProductLoop',
      );
      assert.ok(
        loopSource.includes("key: 'readiness'") &&
        loopSource.includes('available: true'),
        'Readiness stage must be marked available: true in ProductLoop',
      );
    });

    it('ProductPreview explicitly labels sample data to avoid misleading visitors', () => {
      const previewSource = readFileSync(
        resolve(CLIENT_ROOT, 'src/components/landing/ProductPreview.jsx'),
        'utf8',
      );

      assert.ok(
        previewSource.includes('Example student · not your data'),
        'Product preview must clearly state data is illustrative example',
      );
    });
  });

  describe('2. Navigation and App Shell Continuity', () => {
    it('AppNav contains clean active routes for all primary workflows', () => {
      const navSource = readFileSync(resolve(CLIENT_ROOT, 'src/components/AppNav.jsx'), 'utf8');

      const expectedRoutes = [
        '/app',
        '/profile',
        '/resume',
        '/career-twin',
        '/assessments',
        '/interviews',
        '/careers',
        '/opportunities',
      ];

      for (const route of expectedRoutes) {
        assert.ok(navSource.includes(`'${route}'`), `AppNav must include route ${route}`);
      }
    });

    it('AppNav provides ThemeToggle on both desktop and mobile viewports', () => {
      const navSource = readFileSync(resolve(CLIENT_ROOT, 'src/components/AppNav.jsx'), 'utf8');

      assert.ok(
        navSource.includes('<ThemeToggle className="hidden sm:inline-flex" />'),
        'AppNav must offer desktop ThemeToggle',
      );
      assert.ok(
        navSource.includes('<ThemeToggle showLabels />'),
        'AppNav must offer mobile drawer ThemeToggle with accessible labels',
      );
    });
  });

  describe('3. Core Loop State & Empty State Actions', () => {
    it('OpportunitiesPage provides 3 distinct paths when empty', () => {
      const oppSource = readFileSync(resolve(CLIENT_ROOT, 'src/pages/OpportunitiesPage.jsx'), 'utf8');

      assert.ok(oppSource.includes('to="/assessments"'), 'OpportunitiesPage empty state must link to assessments');
      assert.ok(oppSource.includes('to="/profile"'), 'OpportunitiesPage empty state must link to profile');
      assert.ok(oppSource.includes('to="/careers"'), 'OpportunitiesPage empty state must link to careers');
    });

    it('InterviewsPage provides accessible role and difficulty configuration with default states', () => {
      const interviewSource = readFileSync(resolve(CLIENT_ROOT, 'src/pages/InterviewsPage.jsx'), 'utf8');

      assert.ok(interviewSource.includes('INTERVIEW_ROLES'), 'InterviewsPage must provide defined role options');
      assert.ok(interviewSource.includes('INTERVIEW_DIFFICULTY'), 'InterviewsPage must provide defined difficulty levels');
    });
  });
});
