/**
 * Task 20 — Interview Session Structured Report.
 *
 * Generates a deterministic, per-question feedback report after an interview
 * session is completed. This is the "Structured Report" component of Task 20,
 * separate from the cross-feature impact signal (interviewImpact.js).
 *
 * ## What this report contains
 *
 * 1. **Session summary** — overall score, evaluator type, target skills, completion time.
 * 2. **Per-question results** — question prompt, answer, score, feedback, strengths,
 *    growth areas, and target skill for each evaluated question.
 * 3. **Skill breakdown** — aggregated per-skill score across all questions for that skill.
 * 4. **Evidence summary** — what evidence was created (if any) and at what strength.
 * 5. **Next steps** — concrete, student-facing actions derived deterministically from the scores.
 *
 * ## Design decisions
 *
 * **Pure aggregation, no AI.** The report is computed from data already stored in
 * the session document. No additional AI calls are made — the AI evaluation happened
 * during the session itself. Representing AI-generated feedback in the report is safe
 * because the data was already written and safety-checked when the answer was submitted.
 *
 * **Session must be completed.** Reports are only generated for COMPLETED sessions.
 * An incomplete session has no `overallScore` and cannot produce an evidence summary.
 *
 * **No independent evidence promotion.** The report reads `evidenceCheck` from the
 * session — it never re-evaluates or re-scores the session. Evidence status is as
 * persisted by `completeSession`.
 */

import { SESSION_STATUS } from '../domain/interview/interviewContract.js';
import { INTERVIEW_PASS_MARK } from '../domain/evidence/skillEvidenceCheck.js';
import {
  InterviewSession,
  toPublicInterviewQuestion,
} from '../models/InterviewSession.model.js';
import { SkillEvidenceCheck, toPublicSkillEvidenceCheck } from '../models/SkillEvidenceCheck.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ERROR_CODES } from '../constants/errorCodes.js';

/**
 * Generates a structured report for a completed interview session.
 *
 * Ownership is enforced: the session must belong to `userId`. A 404 is
 * returned for missing sessions and for sessions owned by other users — the
 * caller cannot distinguish between "not found" and "not yours."
 *
 * @param {string} userId Authenticated user id.
 * @param {string} sessionId Session to report on.
 * @returns {Promise<object>} Structured session report.
 */
export async function generateSessionReport(userId, sessionId) {
  const session = await InterviewSession.findOne({ _id: sessionId, user: userId })
    .populate('evidenceCheck')
    .lean();

  if (!session) {
    throw ApiError.notFound(
      'Interview session not found.',
      ERROR_CODES.INTERVIEW_SESSION_NOT_FOUND,
    );
  }

  if (session.status !== SESSION_STATUS.COMPLETED) {
    throw ApiError.badRequest(
      `A report can only be generated for a completed session. Current status: "${session.status}".`,
      ERROR_CODES.INTERVIEW_INVALID_STATE,
    );
  }

  const questions = Array.isArray(session.questions) ? session.questions : [];
  const evaluatedQuestions = questions.filter((q) => q?.evaluation != null);
  const overallScore = typeof session.overallScore === 'number' ? session.overallScore : 0;
  const passed = overallScore >= INTERVIEW_PASS_MARK;
  const evaluatorType = session.evaluatorType ?? 'ai';
  const targetSkills = Array.isArray(session.targetSkills) ? session.targetSkills : [];

  // ── Per-question results ──────────────────────────────────────────────────
  const questionResults = evaluatedQuestions.map((q) => {
    const publicQ = toPublicInterviewQuestion(q);
    const score = typeof q.evaluation?.compositeScore === 'number'
      ? q.evaluation.compositeScore
      : (typeof q.evaluation?.score === 'number' ? q.evaluation.score : 0);

    return {
      questionId: q.id ?? q._id?.toString() ?? '',
      prompt: q.prompt ?? '',
      targetSkill: q.targetSkill ?? null,
      score: Math.max(0, Math.min(1, score)),
      weight: typeof q.weight === 'number' ? q.weight : 1,
      evaluation: publicQ.evaluation ?? null,
    };
  });

  // ── Per-skill breakdown ───────────────────────────────────────────────────
  const skillBreakdown = buildSkillBreakdown(questionResults, targetSkills, evaluatedQuestions);

  // ── Evidence summary ──────────────────────────────────────────────────────
  // Reload the actual persisted SkillEvidenceChecks for this session
  const evidenceChecks = await SkillEvidenceCheck.find({
    user: userId,
    reference: String(session._id),
  }).lean();

  const evidenceSummary = evidenceChecks.map(toPublicSkillEvidenceCheck);

  // ── Session summary ───────────────────────────────────────────────────────
  const summary = {
    sessionId: String(session._id),
    status: session.status,
    overallScore,
    passed,
    evaluatorType,
    targetSkills,
    difficulty: session.difficulty ?? null,
    questionCount: questions.length,
    evaluatedCount: evaluatedQuestions.length,
    completedAt: session.completedAt ?? null,
    startedAt: session.startedAt ?? null,
    passMark: INTERVIEW_PASS_MARK,
  };

  // ── Aggregate strengths and growth areas ─────────────────────────────────
  const { topStrengths, topGrowthAreas } = aggregateFeedback(questionResults);

  // ── Next steps ────────────────────────────────────────────────────────────
  const nextSteps = buildNextSteps({
    passed,
    evaluatorType,
    overallScore,
    evidenceSummary,
    skillBreakdown,
    targetSkills,
  });

  return {
    summary,
    questionResults,
    skillBreakdown,
    topStrengths,
    topGrowthAreas,
    evidenceSummary,
    nextSteps,
    method: {
      deterministic: true,
      usesAi: false,
      note: 'This report aggregates evaluation data recorded during the session. No AI calls are made during report generation. AI-generated feedback is advisory and does not independently create verified career evidence.',
    },
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Aggregates per-question results into a per-skill breakdown.
 * Questions not tagged with a targetSkill are attributed to all target skills
 * (session-level questions).
 */
function buildSkillBreakdown(questionResults, targetSkills, rawQuestions) {
  if (targetSkills.length === 0) return [];

  const skillMap = new Map();
  for (const skillName of targetSkills) {
    skillMap.set(skillName, { skillName, totalScore: 0, totalWeight: 0, questionCount: 0 });
  }

  for (let i = 0; i < questionResults.length; i++) {
    const qr = questionResults[i];
    const rawQ = rawQuestions[i];
    const targetSkill = qr.targetSkill ?? null;
    const weight = qr.weight;

    if (targetSkill && skillMap.has(targetSkill)) {
      const entry = skillMap.get(targetSkill);
      entry.totalScore += qr.score * weight;
      entry.totalWeight += weight;
      entry.questionCount += 1;
    } else if (!rawQuestions.some((q) => Boolean(q.targetSkill))) {
      // No skill tags on any question — attribute to all target skills
      for (const entry of skillMap.values()) {
        entry.totalScore += qr.score * weight;
        entry.totalWeight += weight;
        entry.questionCount += 1;
      }
    }
  }

  return [...skillMap.values()].map((entry) => ({
    skillName: entry.skillName,
    score: entry.totalWeight > 0
      ? Math.round((entry.totalScore / entry.totalWeight) * 10000) / 10000
      : 0,
    questionCount: entry.questionCount,
    passed: entry.totalWeight > 0
      ? (entry.totalScore / entry.totalWeight) >= INTERVIEW_PASS_MARK
      : false,
  }));
}

/**
 * Collects the top strengths and growth areas across all question evaluations.
 * Deduplicates by text content (case-insensitive).
 */
function aggregateFeedback(questionResults) {
  const strengthSet = new Map(); // normalized → original
  const growthSet = new Map();

  for (const qr of questionResults) {
    const eval_ = qr.evaluation;
    if (!eval_) continue;

    for (const s of eval_.strengths ?? []) {
      if (typeof s === 'string' && s.trim()) {
        const key = s.trim().toLowerCase();
        if (!strengthSet.has(key)) strengthSet.set(key, s.trim());
      }
    }
    for (const g of eval_.growthAreas ?? []) {
      if (typeof g === 'string' && g.trim()) {
        const key = g.trim().toLowerCase();
        if (!growthSet.has(key)) growthSet.set(key, g.trim());
      }
    }
  }

  return {
    topStrengths: [...strengthSet.values()].slice(0, 5),
    topGrowthAreas: [...growthSet.values()].slice(0, 5),
  };
}

/**
 * Builds concrete student-facing next steps from the session outcome.
 */
function buildNextSteps({ passed, evaluatorType, overallScore, evidenceSummary, skillBreakdown, targetSkills }) {
  const steps = [];

  if (!passed) {
    steps.push(
      `Your overall score (${Math.round(overallScore * 100)}%) did not reach the pass mark (${Math.round(INTERVIEW_PASS_MARK * 100)}%). Review the growth areas above and reattempt after addressing them.`,
    );
    const weakSkills = skillBreakdown.filter((s) => !s.passed).map((s) => s.skillName);
    if (weakSkills.length > 0) {
      steps.push(`Focus on improving: ${weakSkills.join(', ')}.`);
    }
    steps.push('Use the roadmap to find learning resources for these skills.');
    return steps;
  }

  const hasVerified = evidenceSummary.some((e) => e.eligibleForVerified);

  if (hasVerified) {
    steps.push('Congratulations! Your interview performance has been verified. Your CareerTwin will refresh on your next visit.');
    steps.push('Check your updated skill gap and opportunities — new roles may now be within reach.');
  } else if (evaluatorType === 'ai') {
    steps.push('Great effort! Your AI-evaluated session was recorded as supported evidence. To reach verified status, request a human-evaluated interview.');
    steps.push('An assessor will review your responses and can formally verify your skills.');
  } else {
    steps.push('Your interview passed. Skill evidence has been recorded.');
    steps.push('To further strengthen your profile, complete assessments in the same skills.');
  }

  if (targetSkills.length > 0) {
    steps.push(`Keep practising: ${targetSkills.join(', ')}.`);
  }

  return steps;
}
