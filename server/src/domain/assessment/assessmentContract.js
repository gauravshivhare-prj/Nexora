import { canonicalSkill, skillKey, skillDisplayName } from '../skills/skillKey.js';
import {
  ASSESSMENT_PASS_MARK,
  CHECK_KINDS,
  CHECK_OUTCOMES,
  buildAssessmentResult,
} from '../evidence/skillEvidenceCheck.js';
import { EVIDENCE_STRENGTH } from '../evidence/evidence.js';

export { ASSESSMENT_PASS_MARK, CHECK_KINDS, CHECK_OUTCOMES };

/**
 * Assessment Domain Contract Version.
 * Bump this whenever the schema or deterministic evaluation contract changes.
 */
export const ASSESSMENT_CONTRACT_VERSION = 1;

/**
 * Standardized difficulty tiers for assessments.
 */
export const DIFFICULTY_LEVELS = Object.freeze({
  BEGINNER: 'beginner',
  INTERMEDIATE: 'intermediate',
  ADVANCED: 'advanced',
});

export const DIFFICULTY_LEVEL_VALUES = Object.freeze(Object.values(DIFFICULTY_LEVELS));

/**
 * Supported deterministic question types.
 */
export const QUESTION_TYPES = Object.freeze({
  SINGLE_CHOICE: 'single_choice',
  MULTIPLE_CHOICE: 'multiple_choice',
  CODE_OUTPUT: 'code_output',
  SHORT_ANSWER: 'short_answer',
  BOOLEAN: 'boolean',
});

export const QUESTION_TYPE_VALUES = Object.freeze(Object.values(QUESTION_TYPES));

/**
 * Question answer outcome statuses.
 */
export const QUESTION_ANSWER_STATUS = Object.freeze({
  CORRECT: 'correct',
  PARTIAL: 'partial',
  INCORRECT: 'incorrect',
  SKIPPED: 'skipped',
  INVALID: 'invalid',
});

export const QUESTION_ANSWER_STATUS_VALUES = Object.freeze(
  Object.values(QUESTION_ANSWER_STATUS),
);

/**
 * Evidence eligibility policy constraints.
 * High scores do not automatically earn verified status without satisfying rigor thresholds.
 */
export const EVIDENCE_ELIGIBILITY_POLICY = Object.freeze({
  MIN_VERIFIED_DIFFICULTY: DIFFICULTY_LEVELS.INTERMEDIATE,
  STANDARD_PASS_MARK: 0.7,
});

/**
 * Scoring strategies for multiple-choice questions.
 */
export const SCORING_STRATEGIES = Object.freeze({
  ALL_OR_NOTHING: 'all_or_nothing',
  PARTIAL_CREDIT: 'partial_credit',
});

/**
 * Assessment attempt statuses.
 */
export const ATTEMPT_STATUS = Object.freeze({
  IN_PROGRESS: 'in_progress',
  SUBMITTED: 'submitted',
  EVALUATED: 'evaluated',
  TIMED_OUT: 'timed_out',
  ABANDONED: 'abandoned',
});

export const ATTEMPT_STATUS_VALUES = Object.freeze(Object.values(ATTEMPT_STATUS));

/**
 * Default grace period for timed assessments in seconds.
 */
export const DEFAULT_GRACE_PERIOD_SECONDS = 60;

/**
 * Validates an assessment definition against the domain contract.
 *
 * Ensures the skill is recognized by Nexora's canonical taxonomy,
 * the pass mark and weights are valid numbers, and all questions
 * adhere to deterministic evaluation rules.
 *
 * @param {object} def Assessment definition
 * @returns {object} Validated, normalized assessment definition
 */
export function validateAssessmentDefinition(def) {
  if (!def || typeof def !== 'object') {
    throw new Error('Assessment definition must be an object.');
  }

  // ID validation
  if (typeof def.id !== 'string' || !/^[a-z0-9_-]+$/i.test(def.id.trim())) {
    throw new Error('Assessment ID must be a non-empty alphanumeric slug (letters, numbers, hyphens, underscores).');
  }
  const id = def.id.trim();

  // Version validation
  const version = def.version ?? ASSESSMENT_CONTRACT_VERSION;
  if (!Number.isInteger(version) || version < 1) {
    throw new Error('Assessment version must be a positive integer.');
  }

  // Skill taxonomy validation
  if (!def.skillKey || typeof def.skillKey !== 'string') {
    throw new Error('skillKey is required.');
  }
  const canonical = canonicalSkill(def.skillKey);
  if (!canonical) {
    throw new Error(`Unknown canonical skill: "${def.skillKey}". Must be recognized in Nexora taxonomy.`);
  }

  // Optional secondary skill keys
  const secondarySkills = [];
  if (Array.isArray(def.secondarySkillKeys)) {
    for (const secKey of def.secondarySkillKeys) {
      const secCanonical = canonicalSkill(secKey);
      if (!secCanonical) {
        throw new Error(`Unknown secondary canonical skill: "${secKey}".`);
      }
      if (secCanonical.key !== canonical.key && !secondarySkills.some((s) => s.key === secCanonical.key)) {
        secondarySkills.push(secCanonical);
      }
    }
  }

  // Difficulty validation
  if (!DIFFICULTY_LEVEL_VALUES.includes(def.difficulty)) {
    throw new Error(`Invalid difficulty "${def.difficulty}". Must be one of: ${DIFFICULTY_LEVEL_VALUES.join(', ')}.`);
  }

  // Title & description validation
  if (typeof def.title !== 'string' || def.title.trim().length === 0) {
    throw new Error('Assessment title is required.');
  }
  if (typeof def.description !== 'string' || def.description.trim().length === 0) {
    throw new Error('Assessment description is required.');
  }

  // Pass mark validation
  const passMark = def.passMark ?? ASSESSMENT_PASS_MARK;
  if (typeof passMark !== 'number' || !Number.isFinite(passMark) || passMark <= 0 || passMark > 1) {
    throw new Error('passMark must be a number greater than 0 and at most 1.');
  }

  // Time limit validation
  let timeLimitMinutes = null;
  if (def.timeLimitMinutes !== undefined && def.timeLimitMinutes !== null) {
    if (!Number.isInteger(def.timeLimitMinutes) || def.timeLimitMinutes <= 0) {
      throw new Error('timeLimitMinutes must be a positive integer if provided.');
    }
    timeLimitMinutes = def.timeLimitMinutes;
  }

  // Questions validation
  if (!Array.isArray(def.questions) || def.questions.length === 0) {
    throw new Error('Assessment must contain an array of at least one question.');
  }

  const seenQuestionIds = new Set();
  const validatedQuestions = def.questions.map((q, idx) => {
    return validateQuestionDefinition(q, idx, seenQuestionIds);
  });

  return {
    id,
    version,
    skillKey: canonical.key,
    skillName: canonical.name,
    secondarySkillKeys: secondarySkills.map((s) => s.key),
    difficulty: def.difficulty,
    title: def.title.trim(),
    description: def.description.trim(),
    passMark,
    timeLimitMinutes,
    isPractice: Boolean(def.isPractice),
    evidencePolicy: def.evidencePolicy ?? null,
    questions: validatedQuestions,
  };
}

/**
 * Validates a single question definition within an assessment.
 */
function validateQuestionDefinition(q, index, seenQuestionIds) {
  if (!q || typeof q !== 'object') {
    throw new Error(`Question at index ${index} must be an object.`);
  }

  if (typeof q.id !== 'string' || q.id.trim() === '') {
    throw new Error(`Question at index ${index} must have a non-empty string id.`);
  }
  const qId = q.id.trim();
  if (seenQuestionIds.has(qId)) {
    throw new Error(`Duplicate question id: "${qId}". Question IDs must be unique.`);
  }
  seenQuestionIds.add(qId);

  if (!QUESTION_TYPE_VALUES.includes(q.type)) {
    throw new Error(`Question "${qId}" has invalid type "${q.type}". Must be one of: ${QUESTION_TYPE_VALUES.join(', ')}.`);
  }

  if (typeof q.prompt !== 'string' || q.prompt.trim() === '') {
    throw new Error(`Question "${qId}" must have a non-empty prompt.`);
  }

  const weight = q.weight ?? 1;
  if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) {
    throw new Error(`Question "${qId}" weight must be a positive finite number.`);
  }

  const validated = {
    id: qId,
    type: q.type,
    prompt: q.prompt.trim(),
    weight,
    codeSnippet: typeof q.codeSnippet === 'string' ? q.codeSnippet : null,
    explanation: typeof q.explanation === 'string' ? q.explanation.trim() : null,
  };

  // Type-specific validations
  if (q.type === QUESTION_TYPES.SINGLE_CHOICE || q.type === QUESTION_TYPES.MULTIPLE_CHOICE) {
    if (!Array.isArray(q.options) || q.options.length < 2) {
      throw new Error(`Question "${qId}" of type "${q.type}" must have at least 2 options.`);
    }

    const seenOptionIds = new Set();
    validated.options = q.options.map((opt, optIdx) => {
      if (!opt || typeof opt !== 'object') {
        throw new Error(`Question "${qId}" option at index ${optIdx} must be an object.`);
      }
      if (typeof opt.id !== 'string' || opt.id.trim() === '') {
        throw new Error(`Question "${qId}" option at index ${optIdx} must have a non-empty id.`);
      }
      const optId = opt.id.trim();
      if (seenOptionIds.has(optId)) {
        throw new Error(`Question "${qId}" has duplicate option id "${optId}".`);
      }
      seenOptionIds.add(optId);

      if (typeof opt.text !== 'string' || opt.text.trim() === '') {
        throw new Error(`Question "${qId}" option "${optId}" must have non-empty text.`);
      }

      return { id: optId, text: opt.text.trim() };
    });

    if (!q.expectedAnswer || typeof q.expectedAnswer !== 'object') {
      throw new Error(`Question "${qId}" must specify expectedAnswer.`);
    }

    if (q.type === QUESTION_TYPES.SINGLE_CHOICE) {
      const correctId = q.expectedAnswer.correctOptionId;
      if (typeof correctId !== 'string' || !seenOptionIds.has(correctId.trim())) {
        throw new Error(`Question "${qId}" correctOptionId "${correctId}" does not match any valid option ID.`);
      }
      validated.expectedAnswer = {
        correctOptionId: correctId.trim(),
      };
    } else {
      // MULTIPLE_CHOICE
      const correctIds = q.expectedAnswer.correctOptionIds;
      if (!Array.isArray(correctIds) || correctIds.length === 0) {
        throw new Error(`Question "${qId}" expectedAnswer.correctOptionIds must be a non-empty array.`);
      }
      for (const cId of correctIds) {
        if (typeof cId !== 'string' || !seenOptionIds.has(cId.trim())) {
          throw new Error(`Question "${qId}" correctOptionId "${cId}" is not a valid option ID.`);
        }
      }
      const strategy = q.expectedAnswer.strategy ?? SCORING_STRATEGIES.ALL_OR_NOTHING;
      if (!Object.values(SCORING_STRATEGIES).includes(strategy)) {
        throw new Error(`Question "${qId}" invalid scoring strategy "${strategy}".`);
      }
      validated.expectedAnswer = {
        correctOptionIds: [...new Set(correctIds.map((c) => c.trim()))],
        strategy,
      };
    }
  } else if (q.type === QUESTION_TYPES.CODE_OUTPUT) {
    if (!q.expectedAnswer || typeof q.expectedAnswer !== 'object') {
      throw new Error(`Question "${qId}" of type "${q.type}" must specify expectedAnswer.`);
    }
    if (typeof q.expectedAnswer.expectedOutput !== 'string') {
      throw new Error(`Question "${qId}" expectedAnswer.expectedOutput must be a string.`);
    }
    validated.expectedAnswer = {
      expectedOutput: q.expectedAnswer.expectedOutput,
      trimWhitespace: q.expectedAnswer.trimWhitespace ?? true,
      caseSensitive: q.expectedAnswer.caseSensitive ?? true,
    };
  } else if (q.type === QUESTION_TYPES.SHORT_ANSWER) {
    if (!q.expectedAnswer || typeof q.expectedAnswer !== 'object') {
      throw new Error(`Question "${qId}" of type "${q.type}" must specify expectedAnswer.`);
    }
    const accepted = q.expectedAnswer.acceptedAnswers;
    if (!Array.isArray(accepted) || accepted.length === 0) {
      throw new Error(`Question "${qId}" expectedAnswer.acceptedAnswers must be a non-empty array of strings.`);
    }
    validated.expectedAnswer = {
      acceptedAnswers: accepted.map((a) => String(a).trim()).filter(Boolean),
      caseSensitive: q.expectedAnswer.caseSensitive ?? false,
      trimWhitespace: q.expectedAnswer.trimWhitespace ?? true,
    };
    if (validated.expectedAnswer.acceptedAnswers.length === 0) {
      throw new Error(`Question "${qId}" must have at least one non-empty accepted answer.`);
    }
  } else if (q.type === QUESTION_TYPES.BOOLEAN) {
    if (!q.expectedAnswer || typeof q.expectedAnswer !== 'object') {
      throw new Error(`Question "${qId}" of type "${q.type}" must specify expectedAnswer.`);
    }
    if (typeof q.expectedAnswer.expectedValue !== 'boolean') {
      throw new Error(`Question "${qId}" expectedAnswer.expectedValue must be a boolean.`);
    }
    validated.expectedAnswer = {
      expectedValue: q.expectedAnswer.expectedValue,
    };
  }

  return validated;
}

/**
 * Sanitizes an assessment definition so it can be safely served to students.
 * Strips expected answers and explanations.
 *
 * @param {object} assessment Validated assessment definition
 * @returns {object} Student-safe assessment view
 */
export function sanitizeAssessmentForStudent(assessment) {
  const validated = validateAssessmentDefinition(assessment);

  return {
    id: validated.id,
    version: validated.version,
    skillKey: validated.skillKey,
    skillName: validated.skillName,
    secondarySkillKeys: validated.secondarySkillKeys,
    difficulty: validated.difficulty,
    title: validated.title,
    description: validated.description,
    passMark: validated.passMark,
    timeLimitMinutes: validated.timeLimitMinutes,
    totalQuestions: validated.questions.length,
    questions: validated.questions.map((q) => {
      const studentQuestion = {
        id: q.id,
        type: q.type,
        prompt: q.prompt,
        weight: q.weight,
        codeSnippet: q.codeSnippet,
      };
      if (q.options) {
        studentQuestion.options = q.options.map((opt) => ({
          id: opt.id,
          text: opt.text,
        }));
      }
      return studentQuestion;
    }),
  };
}

/**
 * Creates an initial assessment attempt record.
 *
 * @param {object} params
 * @param {string} params.assessmentId
 * @param {string} params.studentId
 * @param {number} [params.attemptNumber=1]
 * @param {Date|string} [params.startedAt]
 * @returns {object} Attempt record
 */
export function createAssessmentAttempt({
  assessmentId,
  studentId,
  attemptNumber = 1,
  startedAt = new Date(),
}) {
  if (typeof assessmentId !== 'string' || assessmentId.trim() === '') {
    throw new Error('assessmentId is required.');
  }
  if (typeof studentId !== 'string' || studentId.trim() === '') {
    throw new Error('studentId is required.');
  }
  if (!Number.isInteger(attemptNumber) || attemptNumber < 1) {
    throw new Error('attemptNumber must be an integer >= 1.');
  }

  const startDate = new Date(startedAt);
  if (Number.isNaN(startDate.getTime())) {
    throw new Error('startedAt must be a valid date.');
  }

  return {
    attemptId: `att_${assessmentId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    assessmentId: assessmentId.trim(),
    studentId: studentId.trim(),
    attemptNumber,
    status: ATTEMPT_STATUS.IN_PROGRESS,
    startedAt: startDate,
    submittedAt: null,
    answers: {},
  };
}

/**
 * Deterministically scores a single question.
 *
 * @param {object} question Validated question object
 * @param {*} studentAnswer Answer provided by the student
 * @returns {{ status: string, isCorrect: boolean, ratio: number, earnedPoints: number, maxPoints: number, scoringRule: string, explanation: string|null }}
 */
export function scoreQuestion(question, studentAnswer) {
  const maxPoints = question.weight;
  let ratio = 0;
  let status = QUESTION_ANSWER_STATUS.INCORRECT;
  let scoringRule = 'default_unmatched';

  if (studentAnswer === undefined || studentAnswer === null) {
    return {
      status: QUESTION_ANSWER_STATUS.SKIPPED,
      isCorrect: false,
      ratio: 0,
      earnedPoints: 0,
      maxPoints,
      scoringRule: 'skipped_no_answer',
      explanation: question.explanation ?? null,
    };
  }

  switch (question.type) {
    case QUESTION_TYPES.SINGLE_CHOICE: {
      if (typeof studentAnswer !== 'string' && typeof studentAnswer !== 'number') {
        status = QUESTION_ANSWER_STATUS.INVALID;
        scoringRule = 'invalid_single_choice_type';
        break;
      }
      const selected = String(studentAnswer).trim();
      const validOption =
        !Array.isArray(question.options) || question.options.some((o) => o.id === selected);
      if (!validOption) {
        status = QUESTION_ANSWER_STATUS.INVALID;
        scoringRule = 'invalid_option_id_not_found';
        break;
      }

      if (selected === question.expectedAnswer.correctOptionId) {
        ratio = 1;
        status = QUESTION_ANSWER_STATUS.CORRECT;
        scoringRule = 'exact_single_choice_match';
      } else {
        ratio = 0;
        status = QUESTION_ANSWER_STATUS.INCORRECT;
        scoringRule = 'single_choice_mismatch';
      }
      break;
    }

    case QUESTION_TYPES.MULTIPLE_CHOICE: {
      if (!Array.isArray(studentAnswer)) {
        status = QUESTION_ANSWER_STATUS.INVALID;
        scoringRule = 'invalid_multiple_choice_expected_array';
        break;
      }
      if (studentAnswer.length === 0) {
        status = QUESTION_ANSWER_STATUS.SKIPPED;
        scoringRule = 'skipped_empty_selection';
        break;
      }

      const allValid =
        !Array.isArray(question.options) ||
        studentAnswer.every(
          (s) => typeof s === 'string' && question.options.some((o) => o.id === s.trim()),
        );
      if (!allValid) {
        status = QUESTION_ANSWER_STATUS.INVALID;
        scoringRule = 'invalid_option_id_in_selection';
        break;
      }

      const selectedList = [...new Set(studentAnswer.map((s) => String(s).trim()))];
      const expectedList = question.expectedAnswer.correctOptionIds;
      const strategy = question.expectedAnswer.strategy;

      const expectedSet = new Set(expectedList);
      const selectedSet = new Set(selectedList);

      if (strategy === SCORING_STRATEGIES.PARTIAL_CREDIT) {
        let correctSelected = 0;
        let incorrectSelected = 0;

        for (const sel of selectedSet) {
          if (expectedSet.has(sel)) {
            correctSelected++;
          } else {
            incorrectSelected++;
          }
        }

        const totalExpected = expectedSet.size;
        const partial = (correctSelected - incorrectSelected) / totalExpected;
        ratio = Math.max(0, Math.min(1, partial));

        if (ratio === 1) {
          status = QUESTION_ANSWER_STATUS.CORRECT;
          scoringRule = 'partial_credit_full_match';
        } else if (ratio > 0) {
          status = QUESTION_ANSWER_STATUS.PARTIAL;
          scoringRule = 'partial_credit_proportional';
        } else {
          status = QUESTION_ANSWER_STATUS.INCORRECT;
          scoringRule = 'partial_credit_penalized_to_zero';
        }
      } else {
        // ALL_OR_NOTHING
        const match =
          expectedSet.size === selectedSet.size &&
          [...expectedSet].every((id) => selectedSet.has(id));
        ratio = match ? 1 : 0;
        status = match ? QUESTION_ANSWER_STATUS.CORRECT : QUESTION_ANSWER_STATUS.INCORRECT;
        scoringRule = match ? 'all_or_nothing_match' : 'all_or_nothing_mismatch';
      }
      break;
    }

    case QUESTION_TYPES.CODE_OUTPUT: {
      if (typeof studentAnswer !== 'string') {
        status = QUESTION_ANSWER_STATUS.INVALID;
        scoringRule = 'invalid_code_output_expected_string';
        break;
      }
      if (studentAnswer.trim() === '') {
        status = QUESTION_ANSWER_STATUS.SKIPPED;
        scoringRule = 'skipped_empty_code_output';
        break;
      }

      const { expectedOutput, trimWhitespace, caseSensitive } = question.expectedAnswer;
      let rawStudent = String(studentAnswer);
      let rawExpected = String(expectedOutput);

      if (trimWhitespace) {
        rawStudent = rawStudent.replace(/\r\n/g, '\n').trim();
        rawExpected = rawExpected.replace(/\r\n/g, '\n').trim();
      }

      if (!caseSensitive) {
        rawStudent = rawStudent.toLowerCase();
        rawExpected = rawExpected.toLowerCase();
      }

      const match = rawStudent === rawExpected;
      ratio = match ? 1 : 0;
      status = match ? QUESTION_ANSWER_STATUS.CORRECT : QUESTION_ANSWER_STATUS.INCORRECT;
      scoringRule = match ? 'code_output_normalized_match' : 'code_output_mismatch';
      break;
    }

    case QUESTION_TYPES.SHORT_ANSWER: {
      if (typeof studentAnswer !== 'string') {
        status = QUESTION_ANSWER_STATUS.INVALID;
        scoringRule = 'invalid_short_answer_expected_string';
        break;
      }
      if (studentAnswer.trim() === '') {
        status = QUESTION_ANSWER_STATUS.SKIPPED;
        scoringRule = 'skipped_empty_short_answer';
        break;
      }

      const { acceptedAnswers, caseSensitive, trimWhitespace } = question.expectedAnswer;
      let cleanedStudent = String(studentAnswer);
      if (trimWhitespace) cleanedStudent = cleanedStudent.trim();
      if (!caseSensitive) cleanedStudent = cleanedStudent.toLowerCase();

      const matched = acceptedAnswers.some((ans) => {
        let cleanedAns = String(ans);
        if (trimWhitespace) cleanedAns = cleanedAns.trim();
        if (!caseSensitive) cleanedAns = cleanedAns.toLowerCase();
        return cleanedStudent === cleanedAns;
      });

      ratio = matched ? 1 : 0;
      status = matched ? QUESTION_ANSWER_STATUS.CORRECT : QUESTION_ANSWER_STATUS.INCORRECT;
      scoringRule = matched ? 'short_answer_keyword_match' : 'short_answer_mismatch';
      break;
    }

    case QUESTION_TYPES.BOOLEAN: {
      let parsed = null;
      if (typeof studentAnswer === 'boolean') {
        parsed = studentAnswer;
      } else if (typeof studentAnswer === 'string') {
        const lower = studentAnswer.trim().toLowerCase();
        if (lower === 'true') parsed = true;
        if (lower === 'false') parsed = false;
      }

      if (parsed === null) {
        status = QUESTION_ANSWER_STATUS.INVALID;
        scoringRule = 'invalid_boolean_format';
        break;
      }

      const expected = question.expectedAnswer.expectedValue;
      const match = parsed === expected;
      ratio = match ? 1 : 0;
      status = match ? QUESTION_ANSWER_STATUS.CORRECT : QUESTION_ANSWER_STATUS.INCORRECT;
      scoringRule = match ? 'boolean_exact_match' : 'boolean_mismatch';
      break;
    }

    default:
      ratio = 0;
      status = QUESTION_ANSWER_STATUS.INVALID;
      scoringRule = 'unsupported_question_type';
  }

  // Bound ratio strictly to [0, 1] and round to 4 decimals
  const boundedRatio = Math.max(0, Math.min(1, Math.round(ratio * 10000) / 10000));
  const earnedPoints = Math.round(boundedRatio * maxPoints * 10000) / 10000;
  const isCorrect = boundedRatio === 1;

  return {
    status,
    isCorrect,
    ratio: boundedRatio,
    earnedPoints,
    maxPoints,
    scoringRule,
    explanation: question.explanation ?? null,
  };
}

/**
 * Normalizes submission answers into a Map of questionId -> answer.
 */
function normalizeSubmissionAnswers(answers) {
  const map = new Map();
  if (!answers) return map;

  if (Array.isArray(answers)) {
    for (const item of answers) {
      if (item && typeof item === 'object' && item.questionId) {
        map.set(String(item.questionId).trim(), item.answer);
      }
    }
  } else if (typeof answers === 'object') {
    for (const [key, val] of Object.entries(answers)) {
      map.set(String(key).trim(), val);
    }
  }
  return map;
}

/**
 * Evaluates an assessment submission deterministically.
 *
 * Produces transparent question-level breakdowns, calculated overall score,
 * and separates raw arithmetic performance from evidence eligibility.
 *
 * @param {object} params
 * @param {object} params.assessment Validated or raw assessment definition
 * @param {object} params.submission Student submission object
 * @param {Date|string} [params.evaluatedAt=new Date()] Evaluation timestamp
 * @param {number} [params.gracePeriodSeconds=DEFAULT_GRACE_PERIOD_SECONDS]
 * @returns {object} Comprehensive assessment result with evidence payload
 */
export function evaluateAssessmentSubmission({
  assessment,
  submission,
  evaluatedAt = new Date(),
  gracePeriodSeconds = DEFAULT_GRACE_PERIOD_SECONDS,
}) {
  const validatedAssessment = validateAssessmentDefinition(assessment);

  if (!submission || typeof submission !== 'object') {
    throw new Error('submission must be an object.');
  }

  if (typeof submission.studentId !== 'string' || submission.studentId.trim() === '') {
    throw new Error('submission.studentId is required.');
  }

  const evalDate = new Date(evaluatedAt);
  if (Number.isNaN(evalDate.getTime())) {
    throw new Error('evaluatedAt must be a valid date.');
  }

  // Verify assessmentId match if submission specifies it
  if (submission.assessmentId && submission.assessmentId.trim() !== validatedAssessment.id) {
    throw new Error(
      `Submission assessmentId "${submission.assessmentId}" does not match definition id "${validatedAssessment.id}".`,
    );
  }

  // Time limit check if startedAt was provided
  let isTimedOut = false;
  if (validatedAssessment.timeLimitMinutes && submission.startedAt) {
    const startMs = new Date(submission.startedAt).getTime();
    if (!Number.isNaN(startMs)) {
      const allowedMs = (validatedAssessment.timeLimitMinutes * 60 + gracePeriodSeconds) * 1000;
      const elapsedMs = evalDate.getTime() - startMs;
      if (elapsedMs > allowedMs) {
        isTimedOut = true;
      }
    }
  }

  const answersMap = normalizeSubmissionAnswers(submission.answers);

  let totalEarnedPoints = 0;
  let totalMaxPoints = 0;
  let correctQuestionsCount = 0;
  let partialCount = 0;
  let incorrectCount = 0;
  let skippedCount = 0;
  let invalidCount = 0;

  const questionResults = validatedAssessment.questions.map((q) => {
    totalMaxPoints += q.weight;

    const studentAnswer = answersMap.get(q.id) ?? null;
    const scoreBreakdown = isTimedOut
      ? {
          status: QUESTION_ANSWER_STATUS.INCORRECT,
          isCorrect: false,
          ratio: 0,
          earnedPoints: 0,
          maxPoints: q.weight,
          scoringRule: 'timed_out_zero_points',
        }
      : scoreQuestion(q, studentAnswer);

    totalEarnedPoints += scoreBreakdown.earnedPoints;
    if (scoreBreakdown.status === QUESTION_ANSWER_STATUS.CORRECT) correctQuestionsCount++;
    else if (scoreBreakdown.status === QUESTION_ANSWER_STATUS.PARTIAL) partialCount++;
    else if (scoreBreakdown.status === QUESTION_ANSWER_STATUS.SKIPPED) skippedCount++;
    else if (scoreBreakdown.status === QUESTION_ANSWER_STATUS.INVALID) invalidCount++;
    else incorrectCount++;

    return {
      questionId: q.id,
      prompt: q.prompt,
      weight: q.weight,
      studentAnswer,
      status: scoreBreakdown.status,
      isCorrect: scoreBreakdown.isCorrect,
      ratio: scoreBreakdown.ratio,
      earnedPoints: scoreBreakdown.earnedPoints,
      maxPoints: scoreBreakdown.maxPoints,
      scoringRule: scoreBreakdown.scoringRule,
      explanation: q.explanation,
    };
  });

  const rawScore = totalMaxPoints > 0 ? totalEarnedPoints / totalMaxPoints : 0;
  const score = Math.max(0, Math.min(1, Math.round(rawScore * 10000) / 10000));
  const passed = !isTimedOut && score >= validatedAssessment.passMark;
  const outcome = passed ? CHECK_OUTCOMES.PASS : CHECK_OUTCOMES.FAIL;

  // Scoring summary separating raw arithmetic performance from evidence eligibility
  const scoringSummary = {
    rawScore: score,
    percentage: Math.round(score * 10000) / 100,
    totalEarnedPoints: Math.round(totalEarnedPoints * 10000) / 10000,
    totalMaxPoints: Math.round(totalMaxPoints * 10000) / 10000,
    totalQuestions: validatedAssessment.questions.length,
    correctCount: correctQuestionsCount,
    partialCount,
    incorrectCount,
    skippedCount,
    invalidCount,
    passedThreshold: passed,
  };

  // Evidence policy evaluation: High score does not automatically grant verified if policy requires stronger proof
  const isAiEvaluated = submission.evaluatedBy === 'ai' || validatedAssessment.evaluatedBy === 'ai';
  const requiresStrongerProof =
    (validatedAssessment.difficulty === DIFFICULTY_LEVELS.BEGINNER &&
      submission.evidencePolicy?.allowBeginnerVerified !== true) ||
    isAiEvaluated ||
    submission.isPractice === true ||
    validatedAssessment.isPractice === true ||
    submission.evidencePolicy?.requiresStrongerProof === true ||
    validatedAssessment.evidencePolicy?.requiresStrongerProof === true;

  let eligibleForVerified = false;
  let evidenceStrength = null;
  let evidenceReason = '';

  if (isTimedOut) {
    eligibleForVerified = false;
    evidenceStrength = null;
    evidenceReason = 'Assessment attempt timed out.';
  } else if (!passed) {
    eligibleForVerified = false;
    evidenceStrength = null;
    evidenceReason = `Raw score (${scoringSummary.percentage}%) does not meet passing threshold (${Math.round(validatedAssessment.passMark * 100)}%).`;
  } else if (requiresStrongerProof) {
    eligibleForVerified = false;
    evidenceStrength = EVIDENCE_STRENGTH.SUPPORTED;
    if (isAiEvaluated) {
      evidenceReason =
        'AI Copilot evaluations are advisory and cannot produce verified evidence directly.';
    } else if (validatedAssessment.difficulty === DIFFICULTY_LEVELS.BEGINNER) {
      evidenceReason =
        'Beginner assessments provide supported evidence but do not meet the intermediate threshold required for verified provenance.';
    } else if (submission.isPractice || validatedAssessment.isPractice) {
      evidenceReason =
        'Practice assessments establish supported evidence but cannot produce verified provenance.';
    } else {
      evidenceReason =
        'Evidence policy requires stronger proof before verified status can be granted.';
    }
  } else {
    eligibleForVerified = true;
    evidenceStrength = EVIDENCE_STRENGTH.VERIFIED;
    evidenceReason = 'Passed assessment meeting all verified provenance requirements.';
  }

  const evidenceStatus = {
    eligibleForVerified,
    evidenceStrength,
    outcome,
    reason: evidenceReason,
    requiresStrongerProof: Boolean(requiresStrongerProof),
  };

  // Build the evidence result using Nexora's standard domain builder
  const evidenceResult = buildAssessmentResult({
    skill: validatedAssessment.skillKey,
    score,
    assessmentId: validatedAssessment.id,
    completedAt: evalDate,
    passMark: validatedAssessment.passMark,
    difficulty: validatedAssessment.difficulty,
    isPractice: Boolean(validatedAssessment.isPractice || submission.isPractice),
    evaluatedBy: submission.evaluatedBy ?? validatedAssessment.evaluatedBy ?? 'assessment-engine',
    eligibleForVerified,
  });

  return {
    attemptId: submission.attemptId ?? null,
    assessmentId: validatedAssessment.id,
    version: validatedAssessment.version,
    studentId: submission.studentId.trim(),
    skillKey: validatedAssessment.skillKey,
    skillName: validatedAssessment.skillName,
    secondarySkillKeys: validatedAssessment.secondarySkillKeys,
    difficulty: validatedAssessment.difficulty,
    status: isTimedOut ? ATTEMPT_STATUS.TIMED_OUT : ATTEMPT_STATUS.EVALUATED,
    score,
    passMark: validatedAssessment.passMark,
    passed,
    outcome,
    earnedPoints: Math.round(totalEarnedPoints * 10000) / 10000,
    maxPoints: Math.round(totalMaxPoints * 10000) / 10000,
    totalQuestions: validatedAssessment.questions.length,
    correctQuestionsCount,
    questionResults,
    completedAt: evalDate,
    evidenceResult,
    scoringSummary,
    evidenceStatus,
  };
}
