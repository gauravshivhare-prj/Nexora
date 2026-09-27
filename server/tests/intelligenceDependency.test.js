import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CAREER_ROLES, findRole, CATALOGUE_VERSION } from '../src/domain/careers/roleCatalogue.js';
import { rankRoles } from '../src/domain/careers/matchRole.js';
import { computeSkillGap, GAP_STATUS, GAP_IMPORTANCE } from '../src/domain/skillGap/computeSkillGap.js';
import { canonicalSkill, skillKey, SKILL_TAXONOMY_VERSION, knownSkillNames } from '../src/domain/skills/skillKey.js';
import { getQuestionBank } from '../src/domain/assessment/questionBank.js';
import { INTERVIEW_QUESTION_BANK } from '../src/domain/interview/interviewQuestions.js';
import { EVIDENCE_STRENGTH } from '../src/domain/evidence/evidence.js';
import {
  buildAssessmentResult,
  buildInterviewResult,
  CHECK_OUTCOMES,
  SkillEvidenceInputError,
} from '../src/domain/evidence/skillEvidenceCheck.js';
import {
  READINESS_CONTRACT_VERSION,
  READINESS_DATA_STATUS,
  READINESS_EVIDENCE_STATUS,
  READINESS_REQUIRED_FIELDS,
  READINESS_COUNT_FIELDS,
} from '../src/domain/readiness/readinessContract.js';
import { computeReadiness } from '../src/domain/readiness/computeReadiness.js';

describe('intelligence dependency & architecture audit', () => {
  describe('1. Taxonomy & Canonical Skill Alignment', () => {
    it('verifies that every skill in the career role catalogue exists in canonical taxonomy', () => {
      for (const role of CAREER_ROLES) {
        assert.ok(role.id, 'Role must have an id');
        for (const skill of role.requiredSkills) {
          const canonical = canonicalSkill(skill);
          assert.ok(canonical, `Role "${role.id}" required skill "${skill}" not in canonical taxonomy`);
          assert.equal(canonical.key, skillKey(skill));
        }
        for (const skill of role.preferredSkills) {
          const canonical = canonicalSkill(skill);
          assert.ok(canonical, `Role "${role.id}" preferred skill "${skill}" not in canonical taxonomy`);
          assert.equal(canonical.key, skillKey(skill));
        }
      }
    });

    it('verifies that every question in assessment question bank grounds in canonical taxonomy', () => {
      const questions = getQuestionBank();
      assert.ok(questions.length > 0, 'Assessment question bank must not be empty');

      for (const q of questions) {
        const canonical = canonicalSkill(q.skillKey);
        assert.ok(
          canonical,
          `Assessment question "${q.id}" skillKey "${q.skillKey}" not in canonical taxonomy`,
        );
      }
    });

    it('verifies that every question in interview question bank grounds in taxonomy and catalogue roles', () => {
      assert.ok(INTERVIEW_QUESTION_BANK.length > 0, 'Interview question bank must not be empty');

      for (const q of INTERVIEW_QUESTION_BANK) {
        const canonical = canonicalSkill(q.targetSkill);
        assert.ok(
          canonical,
          `Interview question "${q.id}" targetSkill "${q.targetSkill}" not in canonical taxonomy`,
        );

        for (const roleId of q.roles) {
          assert.ok(findRole(roleId), `Interview question "${q.id}" references unknown role "${roleId}"`);
        }
      }
    });

    it('enforces taxonomy versioning and canonical key normalization idempotency', () => {
      assert.equal(SKILL_TAXONOMY_VERSION, 2);

      for (const name of knownSkillNames()) {
        const key = skillKey(name);
        assert.ok(key, `Skill "${name}" produced empty key`);
        const canonical = canonicalSkill(key);
        assert.ok(canonical, `Skill key "${key}" could not be resolved canonically`);
        assert.equal(canonical.key, key);
      }
    });
  });

  describe('2. Evidence Model & Institutional Verification Policy', () => {
    it('allows verified evidence creation exclusively on passing assessment results', () => {
      const passResult = buildAssessmentResult({
        skill: 'Node.js',
        score: 0.85,
        assessmentId: 'asm_nodejs_intermediate',
        passMark: 0.7,
      });

      assert.equal(passResult.outcome, CHECK_OUTCOMES.PASS);
      assert.equal(passResult.eligibleForVerified, true);
      assert.ok(passResult.evidence);
      assert.equal(passResult.evidence.source, 'assessment');

      const failResult = buildAssessmentResult({
        skill: 'Node.js',
        score: 0.65,
        assessmentId: 'asm_nodejs_intermediate',
        passMark: 0.7,
      });

      assert.equal(failResult.outcome, CHECK_OUTCOMES.FAIL);
      assert.equal(failResult.eligibleForVerified, false);
      assert.equal(failResult.evidence, null);
    });

    it('enforces that raw AI interview feedback is advisory and never produces verified evidence', () => {
      const aiEvaluation = buildInterviewResult({
        skill: 'Node.js',
        score: 0.95,
        interviewId: 'interview_session_123',
        evaluatedBy: 'ai',
      });

      assert.equal(aiEvaluation.outcome, CHECK_OUTCOMES.UNCERTAIN);
      assert.equal(aiEvaluation.eligibleForVerified, false);
      assert.equal(aiEvaluation.evidence, null);
    });

    it('allows verified evidence from interview evaluation only when evaluated by human with passing score', () => {
      const humanPass = buildInterviewResult({
        skill: 'Node.js',
        score: 0.8,
        interviewId: 'interview_session_456',
        evaluatedBy: 'human',
        passMark: 0.75,
      });

      assert.equal(humanPass.outcome, CHECK_OUTCOMES.PASS);
      assert.equal(humanPass.eligibleForVerified, true);
      assert.ok(humanPass.evidence);

      const humanFail = buildInterviewResult({
        skill: 'Node.js',
        score: 0.7,
        interviewId: 'interview_session_456',
        evaluatedBy: 'human',
        passMark: 0.75,
      });

      assert.equal(humanFail.outcome, CHECK_OUTCOMES.FAIL);
      assert.equal(humanFail.eligibleForVerified, false);
      assert.equal(humanFail.evidence, null);
    });

    it('rejects ungrounded non-canonical skills during evidence check construction', () => {
      assert.throws(
        () => {
          buildAssessmentResult({
            skill: 'Arbitrary Hallucinated Skill 123',
            score: 0.9,
            assessmentId: 'asm_fake_001',
          });
        },
        SkillEvidenceInputError,
        /Unknown canonical skill/,
      );
    });
  });

  describe('3. Recommendation & Skill-Gap Dependencies', () => {
    it('produces explainable role recommendations without hallucinating market data', () => {
      const sampleTwin = {
        skills: [
          { key: 'nodejs', name: 'Node.js', strength: EVIDENCE_STRENGTH.VERIFIED },
          { key: 'sql', name: 'SQL', strength: EVIDENCE_STRENGTH.SUPPORTED },
          { key: 'git', name: 'Git', strength: EVIDENCE_STRENGTH.CLAIMED },
        ],
        interests: ['Backend Development'],
        targetRoles: ['backend-developer'],
        academic: { degree: 'B.Tech', branch: 'Computer Science' },
        indicators: { projects: 1, certifications: 0, verified: 1 },
      };

      const ranked = rankRoles(sampleTwin, { limit: 3 });
      assert.ok(ranked.matches.length > 0);
      assert.equal(ranked.matches[0].roleId, 'backend-developer');
      assert.ok(ranked.matches[0].score >= 0 && ranked.matches[0].score <= 100);
      assert.ok(ranked.matches[0].explanation);

      // Verify no live job market hallucinations
      for (const match of ranked.matches) {
        assert.equal('salary' in match, false);
        assert.equal('demand' in match, false);
        assert.equal('growth' in match, false);
        assert.equal('hiringRate' in match, false);
      }
    });

    it('maps CareerTwin evidence strengths to skill gap statuses deterministically', () => {
      const twin = {
        skills: [
          { key: 'nodejs', name: 'Node.js', strength: EVIDENCE_STRENGTH.VERIFIED },
          { key: 'sql', name: 'SQL', strength: EVIDENCE_STRENGTH.SUPPORTED },
          { key: 'docker', name: 'Docker', strength: EVIDENCE_STRENGTH.CLAIMED },
        ],
      };
      const backendRole = findRole('backend-developer');
      const gap = computeSkillGap(twin, backendRole);

      assert.equal(gap.roleId, 'backend-developer');
      const nodeSkill = gap.skills.find((s) => s.key === 'nodejs');
      const sqlSkill = gap.skills.find((s) => s.key === 'sql');
      const dockerSkill = gap.skills.find((s) => s.key === 'docker');

      assert.equal(nodeSkill?.status, GAP_STATUS.VERIFIED);
      assert.equal(sqlSkill?.status, GAP_STATUS.SUPPORTED);
      assert.equal(dockerSkill?.status, GAP_STATUS.CLAIMED);

      // Any role skill not in twin is MISSING
      const missingSkills = gap.skills.filter((s) => s.status === GAP_STATUS.MISSING);
      assert.ok(missingSkills.length > 0);
    });
  });

  describe('4. Readiness Projection Contract & Skill-Gap Parity', () => {
    it('maintains 1:1 count parity between skill gap summary and readiness required/preferred', () => {
      const twin = {
        skills: [
          { key: 'nodejs', name: 'Node.js', strength: EVIDENCE_STRENGTH.VERIFIED },
          { key: 'sql', name: 'SQL', strength: EVIDENCE_STRENGTH.SUPPORTED },
          { key: 'docker', name: 'Docker', strength: EVIDENCE_STRENGTH.CLAIMED },
        ],
      };
      const backendRole = findRole('backend-developer');
      const gap = computeSkillGap(twin, backendRole);

      const readiness = computeReadiness(gap, {
        dataStatus: READINESS_DATA_STATUS.FRESH,
        basedOn: { catalogueVersion: CATALOGUE_VERSION },
      });

      assert.deepEqual(readiness.required, gap.summary.required);
      assert.deepEqual(readiness.preferred, gap.summary.preferred);
    });

    it('strictly isolates blockingSkills to unverified required skills', () => {
      const twin = {
        skills: [
          { key: 'nodejs', name: 'Node.js', strength: EVIDENCE_STRENGTH.VERIFIED },
          { key: 'sql', name: 'SQL', strength: EVIDENCE_STRENGTH.SUPPORTED },
          { key: 'docker', name: 'Docker', strength: EVIDENCE_STRENGTH.CLAIMED },
        ],
      };
      const backendRole = findRole('backend-developer');
      const gap = computeSkillGap(twin, backendRole);

      const readiness = computeReadiness(gap);

      for (const blocker of readiness.blockingSkills) {
        assert.equal(blocker.importance, 'required');
        assert.notEqual(blocker.status, 'verified');
      }

      // Verified required skill must not appear in blockingSkills
      const nodeBlocker = readiness.blockingSkills.find((s) => s.key === 'nodejs');
      assert.equal(nodeBlocker, undefined);
    });

    it('enforces explicit non-goals: no synthetic scores or percentages in readiness', () => {
      const backendRole = findRole('backend-developer');
      const gap = computeSkillGap({ skills: [] }, backendRole);
      const readiness = computeReadiness(gap);

      for (const field of ['score', 'readinessScore', 'percentage', 'rating', 'confidence']) {
        assert.equal(field in readiness, false, `Readiness must not expose "${field}"`);
      }
    });

    it('correctly reports dataStatus as stale when CareerTwin is stale, without altering evidenceStatus', () => {
      const backendRole = findRole('backend-developer');
      const allVerifiedSkills = backendRole.requiredSkills.map((s) => ({
        key: skillKey(s),
        name: s,
        strength: EVIDENCE_STRENGTH.VERIFIED,
      }));

      const gap = computeSkillGap({ skills: allVerifiedSkills }, backendRole);
      const staleReadiness = computeReadiness(gap, { dataStatus: READINESS_DATA_STATUS.STALE });

      assert.equal(staleReadiness.evidenceStatus, READINESS_EVIDENCE_STATUS.VERIFIED);
      assert.equal(staleReadiness.dataStatus, READINESS_DATA_STATUS.STALE);
    });

    it('handles missing or ungenerated CareerTwin as insufficient_data and incomplete', () => {
      const emptyReadiness = computeReadiness(null, { dataStatus: READINESS_DATA_STATUS.INCOMPLETE });
      assert.equal(emptyReadiness.evidenceStatus, READINESS_EVIDENCE_STATUS.INSUFFICIENT_DATA);
      assert.equal(emptyReadiness.dataStatus, READINESS_DATA_STATUS.INCOMPLETE);
      assert.deepEqual(emptyReadiness.blockingSkills, []);
      assert.equal(emptyReadiness.required.total, 0);
    });
  });
});
