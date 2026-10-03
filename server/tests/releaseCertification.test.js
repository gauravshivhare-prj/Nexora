import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import { SKILL_TAXONOMY_VERSION } from '../src/domain/skills/skillKey.js';
import { CATALOGUE_VERSION } from '../src/domain/careers/roleCatalogue.js';
import { READINESS_CONTRACT_VERSION } from '../src/domain/readiness/readinessContract.js';
import { ASSESSMENT_CONTRACT_VERSION } from '../src/domain/assessment/assessmentContract.js';
import { INTERVIEW_CONTRACT_VERSION } from '../src/domain/interview/interviewContract.js';

describe('TASK 50 — Final Product Certification & Risk Closure Audit', () => {
  const docsPath = resolve(process.cwd(), '..', 'docs');

  describe('1. Release Certification Documentation Audit', () => {
    it('verifies docs/release-certification.md exists, is readable, and covers all 50 tasks', () => {
      const certFile = resolve(docsPath, 'release-certification.md');
      assert.ok(existsSync(certFile), 'docs/release-certification.md must exist');

      const content = readFileSync(certFile, 'utf8');
      assert.ok(content.includes('CERTIFIED & SIGNED OFF'));
      assert.ok(content.includes('Tasks 01–50'));

      // Verify every task number 01 through 50 is listed
      for (let i = 1; i <= 50; i++) {
        const padded = String(i).padStart(2, '0');
        assert.ok(
          content.includes(`**${padded}**`) || content.includes(`Task ${i}`) || content.includes(`Tasks ${i}`),
          `Task ${padded} must be explicitly documented in release certification matrix`,
        );
      }
    });

    it('verifies docs/known-limitations.md exists, is user-facing, and details operational bounds', () => {
      const limitsFile = resolve(docsPath, 'known-limitations.md');
      assert.ok(existsSync(limitsFile), 'docs/known-limitations.md must exist');

      const content = readFileSync(limitsFile, 'utf8');
      assert.ok(content.includes('Deterministic Matcher (Not Generative Speculation)'));
      assert.ok(content.includes('Per-User AI Quota'));
      assert.ok(content.includes('50 AI evaluations per 24-hour rolling window'));
      assert.ok(content.includes('Canonical Skill Taxonomy Scope'));
      assert.ok(content.includes('132 software engineering skills'));
      assert.ok(content.includes('10 software engineering roles'));
      assert.ok(content.includes('Continuous Improvement System'));
      assert.ok(content.includes('RFC Taxonomy Addition'));
    });
  });

  describe('2. Canonical Contract & Version Freeze Integrity', () => {
    it('confirms all platform contracts are frozen and version-stamped for release', () => {
      assert.equal(SKILL_TAXONOMY_VERSION, 2, 'Canonical skill taxonomy must be v2');
      assert.equal(CATALOGUE_VERSION, 1, 'Career role catalogue must be v1');
      assert.ok(READINESS_CONTRACT_VERSION >= 1, 'Readiness contract version must be valid');
      assert.ok(ASSESSMENT_CONTRACT_VERSION >= 1, 'Assessment contract version must be valid');
      assert.ok(INTERVIEW_CONTRACT_VERSION >= 1, 'Interview contract version must be valid');
    });
  });
});
