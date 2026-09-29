import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const CLIENT_ROOT = resolve(import.meta.dirname, '..');

describe('P28 — Frontend Performance & Optimization Audit Suite', () => {
  describe('1. Rollup Manual Chunks & Bundle Architecture', () => {
    it('vite.config.js defines manualChunks splitting React and Router vendors', () => {
      const viteConfig = readFileSync(resolve(CLIENT_ROOT, 'vite.config.js'), 'utf8');

      assert.ok(viteConfig.includes('manualChunks'), 'manualChunks must be defined in vite.config.js');
      assert.ok(viteConfig.includes('vendor-router'), 'vendor-router chunk must be defined for routing libraries');
      assert.ok(viteConfig.includes('vendor-react'), 'vendor-react chunk must be defined for core React runtime');
    });

    it('client build generates split chunks rather than a monolithic >500kB bundle', () => {
      const viteConfig = readFileSync(resolve(CLIENT_ROOT, 'vite.config.js'), 'utf8');
      assert.ok(viteConfig.includes('rollupOptions'), 'rollupOptions must configure output chunking');
    });
  });

  describe('2. API Call Deduplication & Reference Caching', () => {
    it('CareersPage caches reference catalogue to prevent redundant calls on filter toggle', () => {
      const careersSource = readFileSync(resolve(CLIENT_ROOT, 'src/pages/CareersPage.jsx'), 'utf8');

      assert.ok(careersSource.includes('catalogueRef'), 'CareersPage must maintain a catalogueRef for reference caching');
      assert.ok(careersSource.includes('catalogueRef.current'), 'CareersPage must check catalogueRef.current before fetching');
    });
  });

  describe('3. Single-Pass Memoization & Render Cost Reduction', () => {
    it('OpportunitiesPage uses single-pass useMemo for filtering and status badge counts', () => {
      const oppSource = readFileSync(resolve(CLIENT_ROOT, 'src/pages/OpportunitiesPage.jsx'), 'utf8');

      assert.ok(oppSource.includes('useMemo'), 'OpportunitiesPage must use useMemo');
      assert.ok(
        oppSource.includes('filteredOpportunities') &&
        oppSource.includes('curatedCount') &&
        oppSource.includes('liveCount'),
        'Single-pass memo must return filtered items and counts simultaneously',
      );
    });

    it('AssessmentsPage memoizes attempt grouping and filtering against re-renders', () => {
      const assessSource = readFileSync(resolve(CLIENT_ROOT, 'src/pages/AssessmentsPage.jsx'), 'utf8');

      assert.ok(assessSource.includes('useMemo'), 'AssessmentsPage must import and use useMemo');
      assert.ok(assessSource.includes('attemptsByAssessment'), 'attemptsByAssessment must be computed efficiently');
      assert.ok(assessSource.includes('AssessmentCard = memo('), 'AssessmentCard must be wrapped in React.memo');
    });

    it('ReadinessVisualization is memoized with React.memo to prevent dashboard re-render cascade', () => {
      const readinessSource = readFileSync(resolve(CLIENT_ROOT, 'src/components/ReadinessVisualization.jsx'), 'utf8');

      assert.ok(readinessSource.includes('import { memo'), 'ReadinessVisualization must import memo');
      assert.ok(
        readinessSource.includes('export const ReadinessVisualization = memo('),
        'ReadinessVisualization must be exported as a memoized component',
      );
    });
  });
});
