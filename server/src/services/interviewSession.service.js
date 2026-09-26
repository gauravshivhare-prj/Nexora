import mongoose from 'mongoose';

import { ERROR_CODES } from '../constants/errorCodes.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import {
  InterviewSession,
  toPublicInterviewQuestion,
  toPublicInterviewSession,
} from '../models/InterviewSession.model.js';
import {
  SkillEvidenceCheck,
  toPublicSkillEvidenceCheck,
} from '../models/SkillEvidenceCheck.model.js';
import { User } from '../models/User.model.js';
import {
  INTERVIEW_DIFFICULTY,
  INTERVIEW_DIFFICULTY_VALUES,
  INTERVIEW_LIMITS,
  SESSION_STATUS,
  canTransitionSession,
} from '../domain/interview/interviewContract.js';
import { selectQuestionsForSession } from '../domain/interview/interviewQuestions.js';
import {
  evaluateQuestionAnswer,
  evaluateSessionResults,
} from './interviewEvaluation.service.js';
import { canonicalSkill } from '../domain/skills/skillKey.js';
import { findRole, CAREER_ROLES } from '../domain/careers/roleCatalogue.js';

/**
 * Loads an interview session scoped strictly to its owner.
 *
 * Prevents IDOR by design: a query for another student's session returns the
 * exact same 404 as a non-existent session ID, preventing ID enumeration.
 *
 * @param {string} userId Authenticated student user ID
 * @param {string} sessionId Interview session ObjectId
 * @returns {Promise<InterviewSession>}
 * @throws {ApiError} 404 if not found or not owned by caller
 */
async function findOwnedSession(userId, sessionId) {
  if (!mongoose.isValidObjectId(sessionId)) {
    throw sessionNotFound();
  }

  const session = await InterviewSession.findOne({
    _id: sessionId,
    user: userId,
  });

  if (!session) {
    throw sessionNotFound();
  }

  return session;
}

function sessionNotFound() {
  return ApiError.notFound(
    'No interview session was found with that id.',
    ERROR_CODES.INTERVIEW_SESSION_NOT_FOUND,
  );
}

/**
 * Creates and initializes a new interview session with selected questions.
 *
 * @param {string} userId
 * @param {object} input
 * @returns {Promise<object>} Public interview session DTO
 */
export async function createSession(userId, input = {}) {
  const {
    targetRole,
    targetSkills,
    difficulty = INTERVIEW_DIFFICULTY.INTERMEDIATE,
    questionCount = 5,
    timeLimitMinutes = 30,
  } = input;

  if (typeof targetRole !== 'string' || targetRole.trim() === '') {
    throw ApiError.badRequest('Target role is required.', ERROR_CODES.BAD_REQUEST);
  }

  // Validate target role exists in catalogue
  const normalizedRole = targetRole.trim().toLowerCase();
  const matchedRole = CAREER_ROLES.find(
    (r) => r.id === normalizedRole || r.title.toLowerCase() === normalizedRole,
  );
  if (!matchedRole) {
    throw ApiError.badRequest(
      `Role "${targetRole}" is not a recognized career role.`,
      ERROR_CODES.CAREER_ROLE_NOT_FOUND,
    );
  }

  if (!Array.isArray(targetSkills) || targetSkills.length === 0) {
    throw ApiError.badRequest(
      'Target skills must be a non-empty list of skills.',
      ERROR_CODES.BAD_REQUEST,
    );
  }

  if (targetSkills.length > INTERVIEW_LIMITS.maxTargetSkills) {
    throw ApiError.badRequest(
      `Target skills cannot exceed ${INTERVIEW_LIMITS.maxTargetSkills} skills.`,
      ERROR_CODES.BAD_REQUEST,
    );
  }

  // Validate canonical skills
  const canonicalTargets = [];
  for (const raw of targetSkills) {
    if (typeof raw !== 'string' || raw.trim() === '') continue;
    const resolved = canonicalSkill(raw.trim());
    if (!resolved) {
      throw ApiError.badRequest(
        `Skill "${raw}" is not recognized in the canonical taxonomy.`,
        ERROR_CODES.BAD_REQUEST,
      );
    }
    if (!canonicalTargets.includes(resolved.name)) {
      canonicalTargets.push(resolved.name);
    }
  }

  if (canonicalTargets.length === 0) {
    throw ApiError.badRequest('At least one canonical target skill is required.');
  }

  if (!INTERVIEW_DIFFICULTY_VALUES.includes(difficulty)) {
    throw ApiError.badRequest(
      `Difficulty must be one of: ${INTERVIEW_DIFFICULTY_VALUES.join(', ')}.`,
      ERROR_CODES.BAD_REQUEST,
    );
  }

  const boundedCount = Math.max(
    INTERVIEW_LIMITS.minQuestions,
    Math.min(INTERVIEW_LIMITS.maxQuestions, Number(questionCount) || 5),
  );

  // Deterministically select questions from curated question bank
  let selectedQuestions;
  try {
    selectedQuestions = selectQuestionsForSession({
      targetRole: matchedRole.id,
      targetSkills: canonicalTargets,
      difficulty,
      count: boundedCount,
      seed: `${userId}-${Date.now()}`,
    });
  } catch (error) {
    throw ApiError.badRequest(error.message, ERROR_CODES.BAD_REQUEST);
  }

  const session = new InterviewSession({
    user: userId,
    status: SESSION_STATUS.INITIALIZED,
    targetRole: matchedRole.title,
    targetSkills: canonicalTargets,
    difficulty,
    questionCount: selectedQuestions.length,
    timeLimitMinutes: Math.min(
      INTERVIEW_LIMITS.maxSessionMinutes,
      Math.max(1, Number(timeLimitMinutes) || 30),
    ),
    questions: selectedQuestions,
  });

  await session.save();
  logger.info(`Interview session initialized: ${session._id} for user ${userId}`);

  return toPublicInterviewSession(session);
}

/**
 * Lists all interview sessions belonging to the authenticated student.
 *
 * @param {string} userId
 * @returns {Promise<Array<object>>}
 */
export async function listSessions(userId) {
  const now = new Date();
  await InterviewSession.updateMany(
    {
      user: userId,
      status: { $in: [SESSION_STATUS.INITIALIZED, SESSION_STATUS.IN_PROGRESS] },
      expiresAt: { $lt: now },
    },
    {
      $set: {
        status: SESSION_STATUS.TIMED_OUT,
        completedAt: now,
      },
    },
  );

  const sessions = await InterviewSession.find({ user: userId })
    .select('-user -__v')
    .sort({ createdAt: -1 })
    .lean();

  return sessions.map((s) => toPublicInterviewSession(s));
}

/**
 * Retrieves a single session belonging to the authenticated student.
 *
 * @param {string} userId
 * @param {string} sessionId
 * @returns {Promise<object>}
 */
export async function getSession(userId, sessionId) {
  const session = await findOwnedSession(userId, sessionId);

  if (
    (session.status === SESSION_STATUS.INITIALIZED || session.status === SESSION_STATUS.IN_PROGRESS) &&
    session.isExpired()
  ) {
    session.status = SESSION_STATUS.TIMED_OUT;
    session.completedAt = session.completedAt || new Date();
    await session.save();
  }

  return toPublicInterviewSession(session);
}

/**
 * Transitions an interview session to in_progress.
 *
 * @param {string} userId
 * @param {string} sessionId
 * @returns {Promise<object>}
 */
export async function startSession(userId, sessionId) {
  const session = await findOwnedSession(userId, sessionId);

  if (session.status === SESSION_STATUS.TIMED_OUT || session.isExpired()) {
    if (session.status !== SESSION_STATUS.TIMED_OUT) {
      session.status = SESSION_STATUS.TIMED_OUT;
      session.completedAt = session.completedAt || new Date();
      await session.save();
    }
    throw ApiError.badRequest(
      'Session has expired and cannot be started.',
      ERROR_CODES.INTERVIEW_SESSION_EXPIRED,
    );
  }

  if (session.status !== SESSION_STATUS.INITIALIZED) {
    throw ApiError.badRequest(
      `Cannot start session in status "${session.status}".`,
      ERROR_CODES.INTERVIEW_INVALID_STATE,
    );
  }

  const now = new Date();
  const updated = await InterviewSession.findOneAndUpdate(
    {
      _id: session._id,
      user: userId,
      status: SESSION_STATUS.INITIALIZED,
      expiresAt: { $gt: now },
    },
    {
      $set: {
        status: SESSION_STATUS.IN_PROGRESS,
        startedAt: now,
      },
    },
    { new: true, runValidators: true },
  );

  if (!updated) {
    const current = await findOwnedSession(userId, sessionId);
    if (current.status === SESSION_STATUS.TIMED_OUT || current.isExpired()) {
      if (current.status !== SESSION_STATUS.TIMED_OUT) {
        current.status = SESSION_STATUS.TIMED_OUT;
        current.completedAt = current.completedAt || new Date();
        await current.save();
      }
      throw ApiError.badRequest(
        'Session has expired and cannot be started.',
        ERROR_CODES.INTERVIEW_SESSION_EXPIRED,
      );
    }
    throw ApiError.badRequest(
      `Cannot start session in status "${current.status}".`,
      ERROR_CODES.INTERVIEW_INVALID_STATE,
    );
  }

  return toPublicInterviewSession(updated);
}

/**
 * Submits an answer for a specific question in an in-progress session.
 * Evaluates the answer using AI provider and stores evaluation results.
 *
 * @param {string} userId
 * @param {string} sessionId
 * @param {string} questionId
 * @param {object} answerData { answerText, durationSeconds }
 * @param {object} [options] { signal }
 * @returns {Promise<object>} Updated question and session evaluation status
 */
export async function submitQuestionAnswer(
  userId,
  sessionId,
  questionId,
  answerData = {},
  options = {},
) {
  const session = await findOwnedSession(userId, sessionId);

  // Check expiration before checking active status
  if (session.status === SESSION_STATUS.TIMED_OUT || session.isExpired()) {
    if (session.status !== SESSION_STATUS.TIMED_OUT) {
      session.status = SESSION_STATUS.TIMED_OUT;
      session.completedAt = session.completedAt || new Date();
      await session.save();
    }
    throw ApiError.badRequest(
      'Session time limit has expired.',
      ERROR_CODES.INTERVIEW_SESSION_EXPIRED,
    );
  }

  // Status check: Must be in_progress
  if (session.status !== SESSION_STATUS.IN_PROGRESS) {
    throw ApiError.badRequest(
      `Cannot submit answer: session is in "${session.status}" state (must be in_progress).`,
      ERROR_CODES.INTERVIEW_INVALID_STATE,
    );
  }

  // Find question in session
  const questionIndex = session.questions.findIndex(
    (q) => q.questionId === questionId || String(q.order) === questionId,
  );
  if (questionIndex === -1) {
    throw ApiError.notFound(
      `Question "${questionId}" was not found in this interview session.`,
      ERROR_CODES.NOT_FOUND,
    );
  }

  const question = session.questions[questionIndex];

  // Prevent duplicate submissions if question attempt limit reached
  if (question.answer?.submittedAt) {
    const currentAttempts = question.answer.attemptNumber || 1;
    if (currentAttempts >= session.attemptLimitPerQuestion) {
      throw ApiError.conflict(
        'An answer has already been submitted for this question.',
        ERROR_CODES.CONFLICT,
      );
    }
  }

  if (session.hasReachedAttemptLimit()) {
    throw ApiError.conflict(
      'This session has used all of its answer attempts.',
      ERROR_CODES.CONFLICT,
    );
  }

  const { answerText, durationSeconds = 30 } = answerData;
  if (typeof answerText !== 'string' || answerText.trim().length < 5) {
    throw ApiError.badRequest(
      'Answer text must be at least 5 characters.',
      ERROR_CODES.BAD_REQUEST,
    );
  }

  if (answerText.trim().length > INTERVIEW_LIMITS.studentAnswer.max) {
    throw ApiError.badRequest(
      `Answer text exceeds maximum length of ${INTERVIEW_LIMITS.studentAnswer.max} characters.`,
      ERROR_CODES.BAD_REQUEST,
    );
  }

  // Step: Run AI evaluation service
  const { evaluation, providerMetadata, warnings } = await evaluateQuestionAnswer({
    question,
    answerText: answerText.trim(),
    signal: options.signal,
    timeoutMs: options.timeoutMs,
  });

  // Record answer and evaluation on question subdocument
  const previousAttemptNumber = question.answer?.attemptNumber || 0;
  const nextAttemptNumber = previousAttemptNumber + 1;
  const previousAttemptCount = session.attemptCount || 0;
  const questionPath = `questions.${questionIndex}`;

  const attemptFilter = previousAttemptNumber === 0
    ? {
        $or: [
          { [`${questionPath}.answer.attemptNumber`]: { $exists: false } },
          { [`${questionPath}.answer`]: null },
          { [`${questionPath}.answer`]: { $exists: false } },
        ],
      }
    : { [`${questionPath}.answer.attemptNumber`]: previousAttemptNumber };

  // Atomically update: must still be in_progress, not expired, and attempt not yet recorded
  const updated = await InterviewSession.findOneAndUpdate(
    {
      _id: session._id,
      user: userId,
      status: SESSION_STATUS.IN_PROGRESS,
      expiresAt: { $gt: new Date() },
      attemptCount: previousAttemptCount,
      ...attemptFilter,
    },
    {
      $set: {
        [`${questionPath}.answer`]: {
          answerText: answerText.trim(),
          submittedAt: new Date(),
          durationSeconds: Math.max(0, Math.min(INTERVIEW_LIMITS.maxTimePerQuestionSeconds, Number(durationSeconds) || 0)),
          attemptNumber: nextAttemptNumber,
        },
        [`${questionPath}.evaluation`]: {
          dimensions: evaluation.dimensions,
          compositeScore: evaluation.compositeScore,
          feedback: evaluation.feedback,
          strengths: evaluation.strengths,
          growthAreas: evaluation.growthAreas,
          groundedSkills: evaluation.groundedSkills,
          evaluatedAt: new Date(),
        },
        providerMetadata,
        attemptCount: previousAttemptCount + 1,
        currentQuestionIndex: Math.max(
          session.currentQuestionIndex,
          Math.min(session.questionCount, questionIndex + 1),
        ),
      },
    },
    { new: true, runValidators: true },
  );

  if (!updated) {
    const current = await findOwnedSession(userId, sessionId);
    if (current.status === SESSION_STATUS.TIMED_OUT || current.isExpired()) {
      if (current.status !== SESSION_STATUS.TIMED_OUT) {
        current.status = SESSION_STATUS.TIMED_OUT;
        current.completedAt = current.completedAt || new Date();
        await current.save();
      }
      throw ApiError.badRequest(
        'Session time limit has expired.',
        ERROR_CODES.INTERVIEW_SESSION_EXPIRED,
      );
    }

    if (current.status !== SESSION_STATUS.IN_PROGRESS) {
      throw ApiError.badRequest(
        `Cannot submit answer: session is in "${current.status}" state (must be in_progress).`,
        ERROR_CODES.INTERVIEW_INVALID_STATE,
      );
    }

    throw ApiError.conflict(
      'This answer was already recorded by another request. Reload the session and try again.',
      ERROR_CODES.CONFLICT,
    );
  }

  const recorded = updated.questions[questionIndex];

  return {
    session: toPublicInterviewSession(updated),
    evaluatedQuestion: toPublicInterviewQuestion(recorded),
    warnings,
  };
}

/**
 * Completes an interview session, computing the final overall score across answered questions.
 *
 * @param {string} userId
 * @param {string} sessionId
 * @param {object} [options]
 * @returns {Promise<object>} Completed session DTO and evidence results
 */
export async function completeSession(userId, sessionId, options = {}) {
  const session = await findOwnedSession(userId, sessionId);

  if (session.status === SESSION_STATUS.TIMED_OUT || session.isExpired()) {
    if (session.status !== SESSION_STATUS.TIMED_OUT) {
      session.status = SESSION_STATUS.TIMED_OUT;
      session.completedAt = session.completedAt || new Date();
      await session.save();
    }
    throw ApiError.badRequest(
      'Session time limit has expired.',
      ERROR_CODES.INTERVIEW_SESSION_EXPIRED,
    );
  }

  if (session.status !== SESSION_STATUS.IN_PROGRESS) {
    throw ApiError.badRequest(
      `Cannot complete session in "${session.status}" state.`,
      ERROR_CODES.INTERVIEW_INVALID_STATE,
    );
  }

  let evaluatorType = 'ai';
  if (options.evaluatorType === 'human') {
    if (options.bypassRoleCheck) {
      evaluatorType = 'human';
    } else {
      const caller = await User.findById(userId).select('role').lean();
      if (caller && caller.role === 'admin') {
        evaluatorType = 'human';
      }
    }
  }

  const { overallScore, eligibleForVerified, evidenceResults } =
    evaluateSessionResults({
      session,
      evaluatorType,
    });

  const completedAt = new Date();

  // Claim the completion atomically before writing any evidence. Two
  // concurrent completes would otherwise both pass the status check above and
  // each insert a full set of evidence records.
  const completedSession = await InterviewSession.findOneAndUpdate(
    { _id: session._id, user: userId, status: SESSION_STATUS.IN_PROGRESS },
    {
      $set: {
        status: SESSION_STATUS.COMPLETED,
        completedAt,
        overallScore,
        evaluatorType,
      },
    },
    { new: true, runValidators: true },
  );

  if (!completedSession) {
    throw ApiError.badRequest(
      'Cannot complete session: it is no longer in progress.',
      ERROR_CODES.INTERVIEW_INVALID_STATE,
    );
  }

  // Persist SkillEvidenceCheck records for each target skill evaluated in the session
  const savedChecks = [];
  for (const ev of evidenceResults) {
    const check = await SkillEvidenceCheck.create({
      user: userId,
      kind: ev.kind,
      skillKey: ev.skillKey,
      skillName: ev.skillName,
      score: ev.score,
      passMark: ev.passMark,
      outcome: ev.outcome,
      eligibleForVerified: ev.eligibleForVerified,
      evaluatedBy: ev.evaluatedBy,
      reference: String(session._id),
      completedAt,
    });
    savedChecks.push(check);
  }

  if (savedChecks.length > 0) {
    completedSession.evidenceCheck = savedChecks[0]._id;
    await InterviewSession.updateOne(
      { _id: completedSession._id },
      { $set: { evidenceCheck: savedChecks[0]._id } },
    );
  }

  logger.info(`Interview session completed: ${completedSession._id} with overall score ${overallScore}`);

  return {
    session: toPublicInterviewSession(completedSession),
    overallScore,
    eligibleForVerified,
    evidenceResults,
    evidenceChecks: savedChecks.map(toPublicSkillEvidenceCheck),
  };
}

/**
 * Abandons an active interview session.
 *
 * @param {string} userId
 * @param {string} sessionId
 * @returns {Promise<object>}
 */
export async function abandonSession(userId, sessionId) {
  const session = await findOwnedSession(userId, sessionId);

  if (!canTransitionSession(session.status, SESSION_STATUS.ABANDONED)) {
    throw ApiError.badRequest(
      `Cannot abandon session in status "${session.status}".`,
      ERROR_CODES.INTERVIEW_INVALID_STATE,
    );
  }

  const completedAt = new Date();
  const updated = await InterviewSession.findOneAndUpdate(
    {
      _id: session._id,
      user: userId,
      status: { $in: [SESSION_STATUS.INITIALIZED, SESSION_STATUS.IN_PROGRESS] },
    },
    {
      $set: {
        status: SESSION_STATUS.ABANDONED,
        completedAt,
      },
    },
    { new: true, runValidators: true },
  );

  if (!updated) {
    const current = await findOwnedSession(userId, sessionId);
    throw ApiError.badRequest(
      `Cannot abandon session in status "${current.status}".`,
      ERROR_CODES.INTERVIEW_INVALID_STATE,
    );
  }

  return toPublicInterviewSession(updated);
}
