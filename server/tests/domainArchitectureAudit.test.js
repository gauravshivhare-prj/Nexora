import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { canonicalSkill, knownSkillNames, skillKey, SKILL_TAXONOMY_VERSION } from '../src/domain/skills/skillKey.js';
import {
  EVIDENCE_SOURCES,
  EVIDENCE_STRENGTH,
  EVIDENCE_STRENGTH_ORDER,
  SOURCE_STRENGTH,
} from '../src/domain/evidence/evidence.js';
import {
  ASSESSMENT_PASS_MARK,
  CHECK_OUTCOMES,
  buildAssessmentResult,
  buildInterviewResult,
} from '../src/domain/evidence/skillEvidenceCheck.js';
import {
  CAREER_ROLES,
  CATALOGUE_VERSION,
  findRole,
} from '../src/domain/careers/roleCatalogue.js';
import {
  DIMENSION_WEIGHTS,
  MATCH_BANDS,
  STRENGTH_CREDIT,
  WEIGHTS_VERSION,
  bandFor,
} from '../src/domain/careers/scoring.js';
import {
  GAP_IMPORTANCE,
  GAP_STATUS,
  computeSkillGap,
} from '../src/domain/skillGap/computeSkillGap.js';
import { buildRoadmap } from '../src/domain/roadmap/buildRoadmap.js';
import { verificationFor } from '../src/domain/roadmap/resourceReferences.js';
import {
  READINESS_CONTRACT_VERSION,
  READINESS_DATA_STATUS,
  READINESS_EVIDENCE_STATUS,
} from '../src/domain/readiness/readinessContract.js';
import { computeReadiness } from '../src/domain/readiness/computeReadiness.js';
import { buildCareerTwin } from '../src/domain/careerTwin/buildCareerTwin.js';
import {
  DIFFICULTY_LEVELS,
  evaluateAssessmentSubmission,
} from '../src/domain/assessment/assessmentContract.js';
import { getAssessmentCatalog } from '../src/domain/assessment/assessmentCatalog.js';

describe('A02 — Domain Architecture Audit: Rule Harmonization & Conflict Verification', () => {
  describe('1. Taxonomy & Canonical Skill Alignment', () => {
    it('verifies that known taxonomy skills resolve idempotently to their canonical key', () => {
      assert.equal(SKILL_TAXONOMY_VERSION, 2);
      const names = knownSkillNames();
      assert.ok(names.length > 50, 'Taxonomy should contain substantial curated skills');

      for (const name of names) {
        const key = skillKey(name);
        assert.ok(key, `Skill "${name}" produced empty key`);
        const canonical = canonicalSkill(name);
        assert.ok(canonical, `Known skill "${name}" must resolve canonically`);
        assert.equal(canonical.key, key);
        assert.equal(canonicalSkill(key).key, key, 'Re-resolving by key must be idempotent');
      }
    });

    it('verifies all career role required and preferred skills are in canonical taxonomy', () => {
      for (const role of CAREER_ROLES) {
        for (const skill of [...role.requiredSkills, ...role.preferredSkills]) {
          const canonical = canonicalSkill(skill);
          assert.ok(
            canonical,
            `Role "${role.id}" references ungrounded skill "${skill}" not in canonical taxonomy`,
          );
        }
      }
    });

    it('verifies all curated assessments target valid canonical taxonomy skills', () => {
      const catalog = getAssessmentCatalog();
      assert.ok(catalog.length > 0, 'Assessment catalog must not be empty');

      for (const assessment of catalog) {
        const canonical = canonicalSkill(assessment.skillKey);
        assert.ok(
          canonical,
          `Assessment "${assessment.id}" targets ungrounded skill "${assessment.skillKey}"`,
        );
        assert.equal(canonical.key, assessment.skillKey);
      }
    });
  });

  describe('2. Evidence Model & Institutional Verification Policy', () => {
    it('enforces that passing intermediate assessment yields verified evidence by default', () => {
      const res = buildAssessmentResult({
        skill: 'Node.js',
        score: 0.85,
        assessmentId: 'asm_nodejs_intermediate',
        difficulty: DIFFICULTY_LEVELS.INTERMEDIATE,
        passMark: ASSESSMENT_PASS_MARK,
      });

      assert.equal(res.outcome, CHECK_OUTCOMES.PASS);
      assert.equal(res.eligibleForVerified, true);
      assert.ok(res.evidence);
      assert.equal(res.evidence.strength, EVIDENCE_STRENGTH.VERIFIED);
    });

    it('enforces that beginner assessment does NOT yield verified evidence even with 100% score', () => {
      const res = buildAssessmentResult({
        skill: 'Docker',
        score: 1.0,
        assessmentId: 'asm_docker_beginner',
        difficulty: DIFFICULTY_LEVELS.BEGINNER,
        passMark: ASSESSMENT_PASS_MARK,
      });

      assert.equal(res.outcome, CHECK_OUTCOMES.PASS);
      assert.equal(res.eligibleForVerified, false);
      assert.equal(res.evidence, null);
    });

    it('enforces that practice assessment does NOT yield verified evidence', () => {
      const res = buildAssessmentResult({
        skill: 'Node.js',
        score: 0.9,
        assessmentId: 'asm_nodejs_intermediate',
        difficulty: DIFFICULTY_LEVELS.INTERMEDIATE,
        isPractice: true,
      });

      assert.equal(res.outcome, CHECK_OUTCOMES.PASS);
      assert.equal(res.eligibleForVerified, false);
      assert.equal(res.evidence, null);
    });

    it('enforces that AI evaluation does NOT yield verified evidence', () => {
      const res = buildAssessmentResult({
        skill: 'Node.js',
        score: 0.95,
        assessmentId: 'asm_nodejs_intermediate',
        difficulty: DIFFICULTY_LEVELS.INTERMEDIATE,
        evaluatedBy: 'ai',
      });

      assert.equal(res.outcome, CHECK_OUTCOMES.PASS);
      assert.equal(res.eligibleForVerified, false);
      assert.equal(res.evidence, null);
    });

    it('enforces that AI interview evaluations are strictly advisory and uncertain', () => {
      const interviewRes = buildInterviewResult({
        skill: 'Python',
        score: 0.95,
        interviewId: 'interview_ai_123',
        evaluatedBy: 'ai',
      });

      assert.equal(interviewRes.outcome, CHECK_OUTCOMES.UNCERTAIN);
      assert.equal(interviewRes.eligibleForVerified, false);
      assert.equal(interviewRes.evidence, null);
    });

    it('enforces that only human-evaluated interview passes yield verified evidence', () => {
      const humanPass = buildInterviewResult({
        skill: 'Python',
        score: 0.8,
        interviewId: 'interview_human_456',
        evaluatedBy: 'human',
      });

      assert.equal(humanPass.outcome, CHECK_OUTCOMES.PASS);
      assert.equal(humanPass.eligibleForVerified, true);
      assert.ok(humanPass.evidence);
      assert.equal(humanPass.evidence.strength, EVIDENCE_STRENGTH.VERIFIED);
    });
  });

  describe('3. Recommendation & Scoring Dimension Weights', () => {
    it('verifies dimension weights sum to exactly 1.0', () => {
      const sum = Object.values(DIMENSION_WEIGHTS).reduce((acc, w) => acc + w, 0);
      assert.equal(Math.round(sum * 1000) / 1000, 1.0);
    });

    it('verifies STRENGTH_CREDIT ordering is strictly monotonic: claimed < supported < verified', () => {
      assert.ok(STRENGTH_CREDIT[EVIDENCE_STRENGTH.CLAIMED] > 0);
      assert.ok(
        STRENGTH_CREDIT[EVIDENCE_STRENGTH.CLAIMED] < STRENGTH_CREDIT[EVIDENCE_STRENGTH.SUPPORTED],
      );
      assert.ok(
        STRENGTH_CREDIT[EVIDENCE_STRENGTH.SUPPORTED] < STRENGTH_CREDIT[EVIDENCE_STRENGTH.VERIFIED],
      );
      assert.equal(STRENGTH_CREDIT[EVIDENCE_STRENGTH.VERIFIED], 1.0);
    });

    it('verifies MATCH_BANDS partition scores [0, 100] deterministically', () => {
      assert.equal(bandFor(100).label, 'strong');
      assert.equal(bandFor(75).label, 'strong');
      assert.equal(bandFor(74).label, 'developing');
      assert.equal(bandFor(50).label, 'developing');
      assert.equal(bandFor(49).label, 'early');
      assert.equal(bandFor(25).label, 'early');
      assert.equal(bandFor(24).label, 'exploratory');
      assert.equal(bandFor(0).label, 'exploratory');
    });
  });

  describe('4. Skill Gap, CareerTwin & Readiness Contract Parity', () => {
    it('verifies computeReadiness derives required and preferred counts using canonical GAP_STATUS', () => {
      const twin = {
        skills: [
          { key: 'javascript', name: 'JavaScript', strength: EVIDENCE_STRENGTH.VERIFIED },
          { key: 'nodejs', name: 'Node.js', strength: EVIDENCE_STRENGTH.SUPPORTED },
          { key: 'sql', name: 'SQL', strength: EVIDENCE_STRENGTH.CLAIMED },
        ],
      };
      const backendRole = findRole('backend-developer');
      const gap = computeSkillGap(twin, backendRole);
      const readiness = computeReadiness(gap, {
        dataStatus: READINESS_DATA_STATUS.FRESH,
        basedOn: { catalogueVersion: CATALOGUE_VERSION },
      });

      assert.equal(readiness.required.total, gap.summary.required.total);
      assert.equal(readiness.required.missing, gap.summary.required.missing);
      assert.equal(readiness.required.claimed, gap.summary.required.claimed);
      assert.equal(readiness.required.supported, gap.summary.required.supported);
      assert.equal(readiness.required.verified, gap.summary.required.verified);

      assert.equal(readiness.preferred.total, gap.summary.preferred.total);
      assert.equal(readiness.preferred.missing, gap.summary.preferred.missing);
      assert.equal(readiness.preferred.claimed, gap.summary.preferred.claimed);
      assert.equal(readiness.preferred.supported, gap.summary.preferred.supported);
      assert.equal(readiness.preferred.verified, gap.summary.preferred.verified);
    });

    it('verifies blockingSkills in readiness strictly excludes verified required skills', () => {
      const twin = {
        skills: [
          { key: 'javascript', name: 'JavaScript', strength: EVIDENCE_STRENGTH.VERIFIED },
          { key: 'nodejs', name: 'Node.js', strength: EVIDENCE_STRENGTH.SUPPORTED },
          { key: 'sql', name: 'SQL', strength: EVIDENCE_STRENGTH.CLAIMED },
        ],
      };
      const backendRole = findRole('backend-developer');
      const gap = computeSkillGap(twin, backendRole);
      const readiness = computeReadiness(gap);

      const blockingKeys = readiness.blockingSkills.map((s) => s.key);
      assert.equal(blockingKeys.includes('javascript'), false);
      assert.ok(blockingKeys.includes('nodejs'));
      assert.ok(blockingKeys.includes('sql'));
      assert.ok(blockingKeys.includes('restapis'));
    });

    it('verifies CareerTwin ranks skills according to canonical EVIDENCE_STRENGTH_ORDER', () => {
      const twin = buildCareerTwin({
        profile: {
          skills: [
            { name: 'JavaScript', level: 'beginner' },
            { name: 'Git', level: 'intermediate' },
          ],
          projects: [
            { title: 'Project A', technologies: ['Git'] },
          ],
        },
        verifiedEvidence: [
          {
            skill: 'JavaScript',
            evidence: {
              source: EVIDENCE_SOURCES.ASSESSMENT,
              strength: EVIDENCE_STRENGTH.VERIFIED,
              detail: 'Passed assessment',
              reference: 'asm_js',
            },
          },
        ],
      });

      assert.ok(twin.skills.length >= 2);
      const js = twin.skills.find((s) => s.key === 'javascript');
      const git = twin.skills.find((s) => s.key === 'git');

      assert.equal(js.strength, EVIDENCE_STRENGTH.VERIFIED);
      assert.equal(git.strength, EVIDENCE_STRENGTH.SUPPORTED);

      // Verified skill must rank higher than supported skill
      const jsIndex = twin.skills.indexOf(js);
      const gitIndex = twin.skills.indexOf(git);
      assert.ok(jsIndex < gitIndex, 'Verified skill must appear before supported skill');
    });

    it('verifies roadmap verificationFor references canonical GAP_STATUS values', () => {
      const verification = verificationFor('Docker');
      assert.equal(verification.reaches, GAP_STATUS.SUPPORTED);
      assert.equal(verification.alternative.reaches, GAP_STATUS.VERIFIED);
    });
  });
});
