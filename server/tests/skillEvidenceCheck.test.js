import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import mongoose from 'mongoose';

import {
  ASSESSMENT_PASS_MARK,
  CHECK_KINDS,
  CHECK_OUTCOMES,
  INTERVIEW_PASS_MARK,
  buildAssessmentResult,
  buildInterviewResult,
} from '../src/domain/evidence/skillEvidenceCheck.js';
import {
  EVIDENCE_SOURCES,
  EVIDENCE_STRENGTH,
  SOURCE_STRENGTH,
  makeEvidence,
} from '../src/domain/evidence/evidence.js';
import { buildCareerTwin } from '../src/domain/careerTwin/buildCareerTwin.js';
import {
  DIFFICULTY_LEVELS,
  evaluateAssessmentSubmission,
} from '../src/domain/assessment/assessmentContract.js';
import {
  scoringTestAssessment,
  beginnerTestAssessment,
  correctSubmissionFixture,
} from './fixtures/assessmentScoringFixtures.js';
import { SkillEvidenceCheck } from '../src/models/SkillEvidenceCheck.model.js';

const completedAt = '2026-09-22T00:00:00.000Z';

describe('skill evidence checks', () => {
  it('turns a passing assessment into verified provenance', () => {
    const result = buildAssessmentResult({
      skill: 'NODE JS',
      score: ASSESSMENT_PASS_MARK,
      assessmentId: 'assessment-1',
      completedAt,
    });

    assert.equal(result.skillKey, 'nodejs');
    assert.equal(result.outcome, CHECK_OUTCOMES.PASS);
    assert.equal(result.eligibleForVerified, true);
    assert.equal(result.evidence.source, 'assessment');
    assert.equal(result.evidence.strength, 'verified');
    assert.equal(result.evidence.reference, 'assessment-1');
  });

  it('does not create verified evidence for a failed assessment', () => {
    const result = buildAssessmentResult({
      skill: 'Docker',
      score: ASSESSMENT_PASS_MARK - 0.01,
      assessmentId: 'assessment-2',
      completedAt,
    });

    assert.equal(result.outcome, CHECK_OUTCOMES.FAIL);
    assert.equal(result.eligibleForVerified, false);
    assert.equal(result.evidence, null);
    assert.equal(result.reference, 'assessment-2');
  });

  it('strictly blocks AI assessment evaluation from creating verified evidence', () => {
    // 1. Default evaluation by AI with perfect score
    const aiDefault = buildAssessmentResult({
      skill: 'Python',
      score: 1.0,
      assessmentId: 'asm-ai-1',
      evaluatedBy: 'ai',
      completedAt,
    });
    assert.equal(aiDefault.outcome, CHECK_OUTCOMES.PASS);
    assert.equal(aiDefault.eligibleForVerified, false);
    assert.equal(aiDefault.evidence, null);

    // 2. Adversarial attempt to force eligibleForVerified: true on AI assessment
    const aiForced = buildAssessmentResult({
      skill: 'Python',
      score: 1.0,
      assessmentId: 'asm-ai-2',
      evaluatedBy: 'ai',
      eligibleForVerified: true,
      completedAt,
    });
    assert.equal(aiForced.eligibleForVerified, false, 'AI assessment must never be eligible for verified');
    assert.equal(aiForced.evidence, null, 'AI assessment must never generate verified evidence object');
  });

  it('blocks beginner and practice assessments from creating verified evidence', () => {
    const beginnerResult = buildAssessmentResult({
      skill: 'Node.js',
      score: 1.0,
      assessmentId: 'asm-beg-1',
      difficulty: 'beginner',
      completedAt,
    });
    assert.equal(beginnerResult.eligibleForVerified, false);
    assert.equal(beginnerResult.evidence, null);

    const practiceResult = buildAssessmentResult({
      skill: 'Node.js',
      score: 1.0,
      assessmentId: 'asm-prac-1',
      isPractice: true,
      completedAt,
    });
    assert.equal(practiceResult.eligibleForVerified, false);
    assert.equal(practiceResult.evidence, null);
  });

  it('requires a human interview evaluation for a verified pass', () => {
    const aiResult = buildInterviewResult({
      skill: 'Python',
      score: 1,
      interviewId: 'interview-ai',
      evaluatedBy: 'ai',
      completedAt,
    });
    const humanPass = buildInterviewResult({
      skill: 'Python',
      score: INTERVIEW_PASS_MARK,
      interviewId: 'interview-human',
      evaluatedBy: 'human',
      completedAt,
    });
    const humanFail = buildInterviewResult({
      skill: 'Python',
      score: INTERVIEW_PASS_MARK - 0.05,
      interviewId: 'interview-human-fail',
      evaluatedBy: 'human',
      completedAt,
    });

    assert.equal(aiResult.outcome, CHECK_OUTCOMES.UNCERTAIN);
    assert.equal(aiResult.eligibleForVerified, false);
    assert.equal(aiResult.evidence, null);

    assert.equal(humanPass.outcome, CHECK_OUTCOMES.PASS);
    assert.equal(humanPass.eligibleForVerified, true);
    assert.equal(humanPass.evidence.strength, 'verified');

    assert.equal(humanFail.outcome, CHECK_OUTCOMES.FAIL);
    assert.equal(humanFail.eligibleForVerified, false);
    assert.equal(humanFail.evidence, null);
  });

  it('rejects unknown skills and invalid scores', () => {
    assert.throws(
      () =>
        buildAssessmentResult({ skill: 'Made Up Tool', score: 1, assessmentId: 'assessment-3' }),
      /Unknown canonical skill/,
    );
    assert.throws(
      () => buildAssessmentResult({ skill: 'Docker', score: 2, assessmentId: 'assessment-4' }),
      /between 0 and 1/,
    );
  });
});

describe('A04 — Claimed, Supported, Verified Semantics Across Subsystems', () => {
  it('enforces exact source strengths across resume, projects, and assessments', () => {
    assert.equal(SOURCE_STRENGTH[EVIDENCE_SOURCES.SELF_DECLARED], EVIDENCE_STRENGTH.CLAIMED);
    assert.equal(SOURCE_STRENGTH[EVIDENCE_SOURCES.RESUME], EVIDENCE_STRENGTH.CLAIMED);
    assert.equal(SOURCE_STRENGTH[EVIDENCE_SOURCES.PROJECT], EVIDENCE_STRENGTH.SUPPORTED);
    assert.equal(SOURCE_STRENGTH[EVIDENCE_SOURCES.CERTIFICATION], EVIDENCE_STRENGTH.SUPPORTED);
    assert.equal(SOURCE_STRENGTH[EVIDENCE_SOURCES.ASSESSMENT], EVIDENCE_STRENGTH.VERIFIED);
    assert.equal(SOURCE_STRENGTH[EVIDENCE_SOURCES.INTERVIEW], EVIDENCE_STRENGTH.VERIFIED);
  });

  it('ensures resume parsing yields only claimed or supported evidence in CareerTwin', () => {
    const twin = buildCareerTwin({
      profile: {
        skills: [{ name: 'JavaScript', level: 'intermediate' }],
        projects: [{ title: 'Nexora App', technologies: ['React'] }],
        certifications: [{ name: 'Certified JavaScript Developer' }],
      },
      resumes: [
        {
          id: 'res_1',
          label: 'Resume v1',
          parsed: {
            skills: [{ name: 'TypeScript' }, { name: 'Python' }],
            projects: [{ title: 'Data Pipeline', technologies: ['SQL'] }],
            certifications: [{ name: 'Python Specialist' }],
          },
        },
      ],
      verifiedEvidence: [],
    });

    const jsSkill = twin.skills.find((s) => s.key === 'javascript');
    const tsSkill = twin.skills.find((s) => s.key === 'typescript');
    const pySkill = twin.skills.find((s) => s.key === 'python');
    const reactSkill = twin.skills.find((s) => s.key === 'react');
    const sqlSkill = twin.skills.find((s) => s.key === 'sql');

    // Profile + Certification corroboration -> SUPPORTED
    assert.equal(jsSkill.strength, EVIDENCE_STRENGTH.SUPPORTED);
    // Resume parsed skill alone -> strictly CLAIMED
    assert.equal(tsSkill.strength, EVIDENCE_STRENGTH.CLAIMED);
    // Resume parsed skill + resume certification -> SUPPORTED
    assert.equal(pySkill.strength, EVIDENCE_STRENGTH.SUPPORTED);
    // Profile project technology -> SUPPORTED
    assert.equal(reactSkill.strength, EVIDENCE_STRENGTH.SUPPORTED);
    // Resume project technology -> SUPPORTED
    assert.equal(sqlSkill.strength, EVIDENCE_STRENGTH.SUPPORTED);

    // Absolute rule: zero skills in twin have verified strength without verifiedEvidence
    for (const skill of twin.skills) {
      assert.notEqual(
        skill.strength,
        EVIDENCE_STRENGTH.VERIFIED,
        `Skill "${skill.name}" was granted verified evidence without verified check!`,
      );
    }
  });

  it('prevents AI assessment evaluation in assessmentContract from granting verified status', () => {
    const aiSubmission = {
      ...correctSubmissionFixture,
      evaluatedBy: 'ai',
    };
    const evalResult = evaluateAssessmentSubmission({
      assessment: scoringTestAssessment,
      submission: aiSubmission,
    });

    assert.equal(evalResult.passed, true);
    assert.equal(evalResult.evidenceStatus.eligibleForVerified, false);
    assert.equal(evalResult.evidenceStatus.evidenceStrength, EVIDENCE_STRENGTH.SUPPORTED);
    assert.equal(evalResult.evidenceResult.eligibleForVerified, false);
    assert.equal(evalResult.evidenceResult.evidence, null);
  });

  it('SkillEvidenceCheck schema validation enforces that AI records cannot be eligibleForVerified', () => {
    const validUserId = new mongoose.Types.ObjectId();

    // 1. Invalid: AI evaluated with eligibleForVerified: true
    const invalidAiDoc = new SkillEvidenceCheck({
      user: validUserId,
      kind: CHECK_KINDS.ASSESSMENT,
      skillKey: 'nodejs',
      skillName: 'Node.js',
      score: 0.95,
      passMark: 0.7,
      outcome: CHECK_OUTCOMES.PASS,
      eligibleForVerified: true,
      evaluatedBy: 'ai',
      reference: 'asm_test',
      completedAt: new Date(),
    });
    const errAi = invalidAiDoc.validateSync();
    assert.ok(errAi, 'Validation error expected for AI eligibleForVerified: true');
    assert.match(errAi.errors.eligibleForVerified.message, /AI evaluations/);

    // 2. Invalid: Failed outcome with eligibleForVerified: true
    const invalidFailDoc = new SkillEvidenceCheck({
      user: validUserId,
      kind: CHECK_KINDS.ASSESSMENT,
      skillKey: 'nodejs',
      skillName: 'Node.js',
      score: 0.5,
      passMark: 0.7,
      outcome: CHECK_OUTCOMES.FAIL,
      eligibleForVerified: true,
      evaluatedBy: 'assessment-engine',
      reference: 'asm_test',
      completedAt: new Date(),
    });
    const errFail = invalidFailDoc.validateSync();
    assert.ok(errFail, 'Validation error expected for FAIL outcome with eligibleForVerified: true');
    assert.match(errFail.errors.eligibleForVerified.message, /non-passing/);

    // 3. Valid: Engine passing assessment with eligibleForVerified: true
    const validEngineDoc = new SkillEvidenceCheck({
      user: validUserId,
      kind: CHECK_KINDS.ASSESSMENT,
      skillKey: 'nodejs',
      skillName: 'Node.js',
      score: 0.85,
      passMark: 0.7,
      outcome: CHECK_OUTCOMES.PASS,
      eligibleForVerified: true,
      evaluatedBy: 'assessment-engine',
      reference: 'asm_test',
      completedAt: new Date(),
    });
    const errValidEngine = validEngineDoc.validateSync();
    assert.equal(errValidEngine, undefined);

    // 4. Valid: Human passing interview with eligibleForVerified: true
    const validHumanDoc = new SkillEvidenceCheck({
      user: validUserId,
      kind: CHECK_KINDS.INTERVIEW,
      skillKey: 'nodejs',
      skillName: 'Node.js',
      score: 0.85,
      passMark: 0.75,
      outcome: CHECK_OUTCOMES.PASS,
      eligibleForVerified: true,
      evaluatedBy: 'human',
      reference: 'int_test',
      completedAt: new Date(),
    });
    const errValidHuman = validHumanDoc.validateSync();
    assert.equal(errValidHuman, undefined);

    // 5. Valid: AI evaluation with eligibleForVerified: false
    const validAiDoc = new SkillEvidenceCheck({
      user: validUserId,
      kind: CHECK_KINDS.INTERVIEW,
      skillKey: 'nodejs',
      skillName: 'Node.js',
      score: 0.85,
      passMark: 0.75,
      outcome: CHECK_OUTCOMES.UNCERTAIN,
      eligibleForVerified: false,
      evaluatedBy: 'ai',
      reference: 'int_test',
      completedAt: new Date(),
    });
    const errValidAi = validAiDoc.validateSync();
    assert.equal(errValidAi, undefined);
  });
});
