import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SKILL_TAXONOMY_VERSION, canonicalSkill, knownSkillNames } from '../src/domain/skills/skillKey.js';
import { CATALOGUE_VERSION, CAREER_ROLES } from '../src/domain/careers/roleCatalogue.js';
import { READINESS_CONTRACT_VERSION } from '../src/domain/readiness/readinessContract.js';
import {
  OPPORTUNITY_CATALOGUE_VERSION,
  OPPORTUNITY_CONTRACT_VERSION,
  OPPORTUNITY_SOURCE_TYPES,
} from '../src/domain/opportunities/opportunityContract.js';
import { ASSESSMENT_CONTRACT_VERSION } from '../src/domain/assessment/assessmentContract.js';
import { INTERVIEW_CONTRACT_VERSION } from '../src/domain/interview/interviewContract.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DOCS_DIR = path.resolve(__dirname, '../../docs');

describe('TASK A29 — Quality and Limitations Report Audit', () => {
  const qualityMdPath = path.join(DOCS_DIR, 'quality-and-limitations.md');
  const architectureMdPath = path.join(DOCS_DIR, 'architecture.md');

  it('verifies that docs/quality-and-limitations.md exists and is readable', () => {
    assert.ok(fs.existsSync(qualityMdPath), 'docs/quality-and-limitations.md must exist');
    const content = fs.readFileSync(qualityMdPath, 'utf8');
    assert.ok(content.length > 1000, 'Report must be comprehensive');
  });

  const qualityMd = fs.readFileSync(qualityMdPath, 'utf8');
  const architectureMd = fs.readFileSync(architectureMdPath, 'utf8');

  // =========================================================================
  // 1. Machine Learning Transparency (Zero Exaggeration)
  // =========================================================================
  describe('1. Machine Learning Capability Transparency', () => {
    it('documents career recommendation as an explainable 5D heuristic, not black-box ML', () => {
      // Must state it is deterministic 5D heuristic
      assert.ok(
        qualityMd.includes('deterministic, explainable 5-dimensional rule-based heuristic') ||
          qualityMd.includes('explainable, deterministic 5-dimensional rule-based heuristic'),
        'Must document recommendation engine as deterministic 5D heuristic',
      );
      assert.ok(
        qualityMd.includes('0.45') && qualityMd.includes('0.20') && qualityMd.includes('0.10') && qualityMd.includes('0.05'),
        'Must document the exact 5D weights',
      );

      // Must explicitly reject black-box neural networks or deep learning claims
      assert.ok(
        qualityMd.includes('deep neural network') || qualityMd.includes('deep learning'),
        'Must explicitly address deep learning vs heuristic distinction',
      );
      assert.ok(
        qualityMd.includes('Zero Exaggeration') || qualityMd.includes('zero exaggeration'),
        'Must declare zero exaggeration of ML capability',
      );
    });

    it('documents categorical set theory for skill gaps and roadmaps', () => {
      assert.ok(qualityMd.includes('computeSkillGap'));
      assert.ok(qualityMd.includes('buildRoadmap'));
      assert.ok(qualityMd.includes('computeReadiness'));
      assert.ok(qualityMd.includes('missing') && qualityMd.includes('claimed') && qualityMd.includes('supported') && qualityMd.includes('verified'));
    });
  });

  // =========================================================================
  // 2. Curated Taxonomy & Catalogue Scope Boundaries
  // =========================================================================
  describe('2. Curated Taxonomy & Catalogue Scope Boundaries', () => {
    it('accurately specifies canonical taxonomy version 2 and role catalogue version 1', () => {
      assert.equal(SKILL_TAXONOMY_VERSION, 2);
      assert.equal(CATALOGUE_VERSION, 1);
      assert.equal(ASSESSMENT_CONTRACT_VERSION, 1);
      assert.equal(INTERVIEW_CONTRACT_VERSION, 1);
      assert.equal(OPPORTUNITY_CONTRACT_VERSION, 1);
      assert.equal(READINESS_CONTRACT_VERSION, 1);

      assert.ok(qualityMd.includes('SKILL_TAXONOMY_VERSION = 2'));
      assert.ok(qualityMd.includes('CATALOGUE_VERSION = 1'));
      assert.ok(qualityMd.includes('132 canonical technical skills'));
      assert.ok(qualityMd.includes('10 software engineering roles'));
    });

    it('documents the boundary of uncurated/emerging skills and assessment question bank coverage', () => {
      assert.ok(qualityMd.includes('31 validated questions'));
      assert.ok(qualityMd.includes('10 core canonical skills'));
      assert.ok(qualityMd.includes('15 curated multi-tier technical interview questions'));
    });
  });

  // =========================================================================
  // 3. External AI Dependency & Verification Barriers
  // =========================================================================
  describe('3. External AI Dependency & Institutional Verification Barriers', () => {
    it('documents external LLM provider dependency and operational failure modes', () => {
      assert.ok(qualityMd.includes('Google Gemini') || qualityMd.includes('Gemini'));
      assert.ok(qualityMd.includes('rate limits') || qualityMd.includes('Rate Limits'));
      assert.ok(qualityMd.includes('latency') || qualityMd.includes('Latency'));
      assert.ok(qualityMd.includes('503'));
      assert.ok(qualityMd.includes('429'));
    });

    it('enforces that AI evaluation is advisory-only and cannot grant verified status', () => {
      assert.ok(
        qualityMd.includes('raw AI evaluations can NEVER grant verified status') ||
          qualityMd.includes('AI evaluations are strictly advisory'),
      );
      assert.ok(qualityMd.includes('eligibleForVerified: false'));
      assert.ok(qualityMd.includes('outcome: \'uncertain\'') || qualityMd.includes('CHECK_OUTCOMES.UNCERTAIN'));
    });

    it('documents prompt injection defenses and boundary sanitization', () => {
      assert.ok(qualityMd.includes('escapeCandidateAnswerForPrompt'));
      assert.ok(qualityMd.includes('<candidate_untrusted_answer>'));
      assert.ok(qualityMd.includes('<untrusted_resume_text>'));
      assert.ok(qualityMd.includes('sandwich defense') || qualityMd.includes('Sandwich Defense'));
    });
  });

  // =========================================================================
  // 4. Opportunity Matching & Operational Constraints
  // =========================================================================
  describe('4. Opportunity Matching & Operational Constraints', () => {
    it('documents opportunity matching as curated internal and disclaims live job scraping', () => {
      assert.ok(qualityMd.includes('curated_internal'));
      assert.ok(
        qualityMd.includes('does **NOT** scrape live government job portals') ||
          qualityMd.includes('no live external job-board scraping') ||
          qualityMd.includes('does **NOT** claim live market coverage'),
      );
    });

    it('documents runtime operational constraints', () => {
      assert.ok(qualityMd.includes('In-memory sliding-window maps') || qualityMd.includes('in-process memory maps'));
      assert.ok(qualityMd.includes('Redis'));
      assert.ok(qualityMd.includes('5 attempts per assessment') || qualityMd.includes('5 attempts'));
      assert.ok(qualityMd.includes('Text-based') || qualityMd.includes('text-only'));
    });
  });

  // =========================================================================
  // 5. Cross-Documentation Synchronization
  // =========================================================================
  describe('5. Cross-Documentation Synchronization', () => {
    it('verifies that architecture.md cross-references quality-and-limitations.md', () => {
      assert.ok(
        architectureMd.includes('quality-and-limitations.md'),
        'architecture.md must link to quality-and-limitations.md',
      );
      assert.ok(
        architectureMd.includes('10.4 Quality, Verification & System Limitations'),
        'architecture.md must include section 10.4',
      );
    });
  });
});
