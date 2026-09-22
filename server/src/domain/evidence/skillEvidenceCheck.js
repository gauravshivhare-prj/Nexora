import { makeEvidence } from './evidence.js';
import { canonicalSkill } from '../skills/skillKey.js';

export const CHECK_KINDS = {
  ASSESSMENT: 'assessment',
  INTERVIEW: 'interview',
};

export const CHECK_OUTCOMES = {
  PASS: 'pass',
  FAIL: 'fail',
  UNCERTAIN: 'uncertain',
};

export const ASSESSMENT_PASS_MARK = 0.7;
export const INTERVIEW_PASS_MARK = 0.75;

/**
 * Builds the persisted result of a deterministic skill check.
 *
 * The caller supplies the authenticated owner separately. A result can only
 * become CareerTwin evidence when this module marks it eligible; clients
 * cannot submit `verified` or an evidence strength directly.
 */
export function buildAssessmentResult({
  skill,
  score,
  assessmentId,
  completedAt = new Date(),
  passMark = ASSESSMENT_PASS_MARK,
}) {
  const canonical = requireCanonicalSkill(skill);
  validateScore(score);
  validateReference(assessmentId, 'assessmentId');
  validateDate(completedAt, 'completedAt');
  validatePassMark(passMark);

  const outcome = score >= passMark ? CHECK_OUTCOMES.PASS : CHECK_OUTCOMES.FAIL;

  return result({
    kind: CHECK_KINDS.ASSESSMENT,
    canonical,
    score,
    passMark,
    outcome,
    reference: assessmentId,
    completedAt,
    evaluatedBy: 'assessment-engine',
  });
}

/**
 * Builds an interview result. AI feedback is advisory and can never produce
 * verified evidence by itself. Only an explicitly human-evaluated pass does.
 */
export function buildInterviewResult({
  skill,
  score,
  interviewId,
  evaluatedBy,
  completedAt = new Date(),
  passMark = INTERVIEW_PASS_MARK,
}) {
  const canonical = requireCanonicalSkill(skill);
  if (!['human', 'ai'].includes(evaluatedBy)) {
    throw new Error('evaluatedBy must be "human" or "ai".');
  }
  validateScore(score);
  validateReference(interviewId, 'interviewId');
  validateDate(completedAt, 'completedAt');
  validatePassMark(passMark);

  const outcome =
    evaluatedBy === 'human'
      ? score >= passMark
        ? CHECK_OUTCOMES.PASS
        : CHECK_OUTCOMES.FAIL
      : CHECK_OUTCOMES.UNCERTAIN;

  return result({
    kind: CHECK_KINDS.INTERVIEW,
    canonical,
    score,
    passMark,
    outcome,
    reference: interviewId,
    completedAt,
    evaluatedBy,
  });
}

function result({ kind, canonical, score, passMark, outcome, reference, completedAt, evaluatedBy }) {
  const eligibleForVerified = outcome === CHECK_OUTCOMES.PASS;

  return {
    kind,
    skillKey: canonical.key,
    skillName: canonical.name,
    score,
    passMark,
    outcome,
    eligibleForVerified,
    evaluatedBy,
    reference,
    completedAt: new Date(completedAt),
    evidence: eligibleForVerified
      ? makeEvidence({
          source: kind,
          detail: `${kind === CHECK_KINDS.ASSESSMENT ? 'Passed assessment' : 'Passed interview'} for ${canonical.name} with score ${score}.`,
          reference,
        })
      : null,
  };
}

function requireCanonicalSkill(skill) {
  const canonical = canonicalSkill(skill);
  if (!canonical) throw new Error(`Unknown canonical skill: ${skill}`);
  return canonical;
}

function validateScore(score) {
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) {
    throw new Error('Score must be a number between 0 and 1.');
  }
}

function validatePassMark(passMark) {
  if (typeof passMark !== 'number' || !Number.isFinite(passMark) || passMark <= 0 || passMark > 1) {
    throw new Error('Pass mark must be a number greater than 0 and at most 1.');
  }
}

function validateReference(reference, field) {
  if (typeof reference !== 'string' || reference.trim() === '') {
    throw new Error(`${field} is required.`);
  }
}

function validateDate(value, field) {
  if (Number.isNaN(new Date(value).getTime())) throw new Error(`${field} must be a valid date.`);
}
