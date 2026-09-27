import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SKILL_TAXONOMY_VERSION } from '../src/domain/skills/skillKey.js';
import { CATALOGUE_VERSION } from '../src/domain/careers/roleCatalogue.js';
import { READINESS_CONTRACT_VERSION } from '../src/domain/readiness/readinessContract.js';
import {
  OPPORTUNITY_CATALOGUE_VERSION,
  OPPORTUNITY_CONTRACT_VERSION,
  OPPORTUNITY_SOURCE_TYPES,
} from '../src/domain/opportunities/opportunityContract.js';
import { OPPORTUNITY_CATALOGUE } from '../src/domain/opportunities/opportunityCatalogue.js';
import { ASSESSMENT_CONTRACT_VERSION } from '../src/domain/assessment/assessmentContract.js';
import { INTERVIEW_CONTRACT_VERSION } from '../src/domain/interview/interviewContract.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DOCS_DIR = path.resolve(__dirname, '../../docs');

describe('TASK A27 — Intelligence Documentation & Contract Synchronization Audit', () => {
  const architectureMd = fs.readFileSync(path.join(DOCS_DIR, 'architecture.md'), 'utf8');
  const phasesMd = fs.readFileSync(path.join(DOCS_DIR, 'phases.md'), 'utf8');
  const readinessMd = fs.readFileSync(path.join(DOCS_DIR, 'readiness.md'), 'utf8');
  const opportunitiesMd = fs.readFileSync(path.join(DOCS_DIR, 'opportunities.md'), 'utf8');

  // =========================================================================
  // 1. Skill Taxonomy Version Consistency
  // =========================================================================
  describe('1. Taxonomy & Versioning Synchronization', () => {
    it('verifies that docs cite SKILL_TAXONOMY_VERSION = 2 and no stale version 1', () => {
      assert.equal(SKILL_TAXONOMY_VERSION, 2);

      // Ensure no obsolete SKILL_TAXONOMY_VERSION = 1 remains in architecture or phases docs
      assert.ok(
        !architectureMd.includes('SKILL_TAXONOMY_VERSION = 1'),
        'architecture.md must not reference stale SKILL_TAXONOMY_VERSION = 1',
      );
      assert.ok(
        !phasesMd.includes('SKILL_TAXONOMY_VERSION = 1'),
        'phases.md must not reference stale SKILL_TAXONOMY_VERSION = 1',
      );

      // Verify canonical version 2 is cited
      assert.ok(architectureMd.includes('SKILL_TAXONOMY_VERSION = 2'));
      assert.ok(phasesMd.includes('SKILL_TAXONOMY_VERSION = 2'));
    });

    it('verifies that domain contract versions match between code and documentation', () => {
      assert.equal(CATALOGUE_VERSION, 1);
      assert.equal(READINESS_CONTRACT_VERSION, 1);
      assert.equal(OPPORTUNITY_CONTRACT_VERSION, 1);
      assert.equal(OPPORTUNITY_CATALOGUE_VERSION, 1);
      assert.equal(ASSESSMENT_CONTRACT_VERSION, 1);
      assert.equal(INTERVIEW_CONTRACT_VERSION, 1);

      assert.ok(readinessMd.includes('contractVersion: 1'));
      assert.ok(opportunitiesMd.includes('version: 1'));
    });
  });

  // =========================================================================
  // 2. Evidence Model & Verification Pathways
  // =========================================================================
  describe('2. Evidence Model & Active Verification Audit', () => {
    it('verifies that architecture.md documents active pathways to verified status', () => {
      // The evidence table must not claim that verified is produced by nothing
      assert.ok(
        !architectureMd.includes('| `verified` | An independent check passed | **Nothing yet** — Phase 8 |'),
        'architecture.md evidence table must not say verified is produced by "Nothing yet"',
      );
      assert.ok(
        architectureMd.includes('Passing skill assessments or human-evaluated technical interviews'),
        'architecture.md must document assessments and human interviews as verified evidence producers',
      );
    });

    it('verifies that skill-gap status table accurately reflects verified checks', () => {
      assert.ok(
        !architectureMd.includes('| `verified` | Independently checked. **Nothing produces this yet** |'),
        'architecture.md skill-gap table must not claim nothing produces verified yet',
      );
      assert.ok(
        architectureMd.includes('| `verified` | Independently checked via passed assessment or human interview |'),
      );
    });
  });

  // =========================================================================
  // 3. Readiness Documentation Synchronization
  // =========================================================================
  describe('3. Career Readiness Documentation Audit', () => {
    it('verifies readiness contract in readiness.md and architecture.md matches code structure', () => {
      // Endpoint listed in architecture.md endpoints table
      assert.ok(
        architectureMd.includes('/api/careers/roles/:roleId/readiness'),
        'architecture.md endpoints table must include /api/careers/roles/:roleId/readiness',
      );

      // Section header exists in architecture.md
      assert.ok(
        architectureMd.includes('### Career Readiness'),
        'architecture.md must have a dedicated ### Career Readiness section',
      );

      // readiness.md documents 4 evidence statuses and 3 data statuses
      assert.ok(readinessMd.includes("'insufficient_data' | 'partial' | 'supported' | 'verified'"));
      assert.ok(readinessMd.includes("'fresh' | 'stale' | 'incomplete'"));
      assert.ok(readinessMd.includes('blockingSkills'));
      assert.ok(readinessMd.includes('basedOn'));
    });
  });

  // =========================================================================
  // 4. Opportunity Matching Documentation Synchronization
  // =========================================================================
  describe('4. Opportunity Matching Documentation Audit', () => {
    it('verifies opportunity catalogue identifiers match between code and documentation', () => {
      const backendOpp = OPPORTUNITY_CATALOGUE.find((o) => o.id === 'curated_internal:backend-apprenticeship');
      assert.ok(backendOpp, 'Backend apprenticeship record must exist in catalogue');

      assert.ok(
        opportunitiesMd.includes('id: \'curated_internal:backend-apprenticeship\''),
        'opportunities.md must use exact code id curated_internal:backend-apprenticeship',
      );
      assert.ok(
        !opportunitiesMd.includes('id: \'curated-internal:backend-apprenticeship\''),
        'opportunities.md must not use obsolete dashed prefix curated-internal',
      );

      assert.equal(OPPORTUNITY_SOURCE_TYPES.CURATED_INTERNAL, 'curated_internal');
    });

    it('verifies architecture.md includes /api/opportunities and dedicated section', () => {
      assert.ok(
        architectureMd.includes('/api/opportunities'),
        'architecture.md endpoints table must list /api/opportunities',
      );
      assert.ok(
        architectureMd.includes('### Opportunity matching'),
        'architecture.md must include ### Opportunity matching section',
      );
    });

    it('verifies phases.md reflects delivered opportunity matching backend', () => {
      assert.ok(
        phasesMd.includes('| 9 — Opportunity Matching | Complete'),
        'phases.md status table must show Phase 9 as Complete',
      );
    });
  });
});
