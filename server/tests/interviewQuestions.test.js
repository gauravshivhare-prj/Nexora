import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  INTERVIEW_QUESTION_BANK,
  QUESTION_BANK_VERSION,
  getAllQuestions,
  getQuestionById,
  getQuestionsForRole,
  getQuestionsForSkill,
  getSupportedSkills,
  isSkillSupported,
  selectQuestionsForSession,
} from '../src/domain/interview/interviewQuestions.js';
import { canonicalSkill } from '../src/domain/skills/skillKey.js';
import { CAREER_ROLES, findRole } from '../src/domain/careers/roleCatalogue.js';
import {
  INTERVIEW_DIFFICULTY_VALUES,
  INTERVIEW_LIMITS,
  INTERVIEW_QUESTION_TYPE_VALUES,
} from '../src/domain/interview/interviewContract.js';

describe('R4 — Curated Interview Questions Suite', () => {
  describe('1. Taxonomy & Role Alignment', () => {
    it('declares positive question bank version and questions list', () => {
      assert.equal(typeof QUESTION_BANK_VERSION, 'number');
      assert.ok(QUESTION_BANK_VERSION >= 1);
      assert.ok(Array.isArray(INTERVIEW_QUESTION_BANK));
      assert.ok(INTERVIEW_QUESTION_BANK.length >= 10);
    });

    it('ensures every targetSkill references a valid canonical skill', () => {
      for (const question of INTERVIEW_QUESTION_BANK) {
        const canonical = canonicalSkill(question.targetSkill);
        assert.ok(
          canonical,
          `Question ${question.id} targetSkill "${question.targetSkill}" is not canonical`,
        );
        assert.equal(
          question.skillKey,
          canonical.key,
          `Question ${question.id} skillKey must match canonical key "${canonical.key}"`,
        );
        assert.equal(
          question.targetSkill,
          canonical.name,
          `Question ${question.id} targetSkill must match canonical display name "${canonical.name}"`,
        );
      }
    });

    it('ensures every role reference exists in the career role catalogue', () => {
      const validRoleIds = new Set(CAREER_ROLES.map((r) => r.id));

      for (const question of INTERVIEW_QUESTION_BANK) {
        assert.ok(Array.isArray(question.roles), `Question ${question.id} roles must be an array`);
        assert.ok(question.roles.length > 0, `Question ${question.id} must belong to at least 1 role`);

        for (const roleId of question.roles) {
          assert.ok(
            validRoleIds.has(roleId),
            `Question ${question.id} references non-existent career role "${roleId}"`,
          );
        }
      }
    });

    it('ensures all question types and difficulties use declared constants', () => {
      for (const question of INTERVIEW_QUESTION_BANK) {
        assert.ok(
          INTERVIEW_QUESTION_TYPE_VALUES.includes(question.type),
          `Question ${question.id} has invalid type "${question.type}"`,
        );
        assert.ok(
          INTERVIEW_DIFFICULTY_VALUES.includes(question.difficulty),
          `Question ${question.id} has invalid difficulty "${question.difficulty}"`,
        );
      }
    });
  });

  describe('2. Stable IDs, Versioning & No Duplicates', () => {
    it('ensures all question IDs are stable, well-formed, and unique across the bank', () => {
      const seenIds = new Set();

      for (const question of INTERVIEW_QUESTION_BANK) {
        assert.equal(typeof question.id, 'string', 'Question ID must be a string');
        assert.match(question.id, /^iq-[a-z0-9]+-\d{3}$/, `Question ID "${question.id}" invalid format`);

        assert.equal(
          seenIds.has(question.id),
          false,
          `Duplicate question ID detected: "${question.id}"`,
        );
        seenIds.add(question.id);

        assert.equal(typeof question.version, 'number');
        assert.ok(question.version >= 1, `Question ${question.id} version must be >= 1`);
      }
    });

    it('ensures zero duplicate prompts or intent summaries across the entire question bank', () => {
      const seenPrompts = new Map();
      const seenSummaries = new Map();

      for (const question of INTERVIEW_QUESTION_BANK) {
        const normalizedPrompt = question.intent.prompt.trim().toLowerCase();
        const normalizedSummary = question.intent.summary.trim().toLowerCase();

        assert.equal(
          seenPrompts.has(normalizedPrompt),
          false,
          `Duplicate prompt detected between ${question.id} and ${seenPrompts.get(normalizedPrompt)}`,
        );
        seenPrompts.set(normalizedPrompt, question.id);

        assert.equal(
          seenSummaries.has(normalizedSummary),
          false,
          `Duplicate summary detected between ${question.id} and ${seenSummaries.get(normalizedSummary)}`,
        );
        seenSummaries.set(normalizedSummary, question.id);
      }
    });

    it('getQuestionById returns the requested question or null if missing', () => {
      const found = getQuestionById('iq-node-001');
      assert.ok(found);
      assert.equal(found.id, 'iq-node-001');
      assert.equal(found.targetSkill, 'Node.js');

      const missing = getQuestionById('iq-non-existent-999');
      assert.equal(missing, null);
    });
  });

  describe('3. Separation of Question Intent from Evaluation Criteria', () => {
    it('strictly separates candidate intent from grading evaluation criteria', () => {
      for (const question of INTERVIEW_QUESTION_BANK) {
        // Candidate-facing intent
        assert.ok(question.intent, `Question ${question.id} must have intent`);
        assert.equal(typeof question.intent.summary, 'string');
        assert.ok(question.intent.summary.trim().length >= 10);
        assert.equal(typeof question.intent.prompt, 'string');
        assert.ok(
          question.intent.prompt.trim().length >= 20,
          `Question ${question.id} prompt is too short`,
        );

        // Evaluator-facing criteria
        assert.ok(
          question.evaluationCriteria,
          `Question ${question.id} must have evaluationCriteria`,
        );
        assert.ok(
          Array.isArray(question.evaluationCriteria.rubricCriteria),
          `Question ${question.id} rubricCriteria must be array`,
        );
        assert.ok(
          question.evaluationCriteria.rubricCriteria.length >= 2,
          `Question ${question.id} must have at least 2 rubric criteria`,
        );
        assert.ok(
          Array.isArray(question.evaluationCriteria.expectedKeyConcepts),
          `Question ${question.id} expectedKeyConcepts must be array`,
        );
        assert.ok(
          Array.isArray(question.evaluationCriteria.commonMisconceptions),
          `Question ${question.id} commonMisconceptions must be array`,
        );
        assert.ok(
          question.evaluationCriteria.scoringGuidelines &&
            typeof question.evaluationCriteria.scoringGuidelines === 'object',
          `Question ${question.id} must have scoringGuidelines`,
        );
        assert.ok(
          question.evaluationCriteria.scoringGuidelines.accuracy,
          `Question ${question.id} must have accuracy scoring guideline`,
        );
        assert.ok(
          question.evaluationCriteria.scoringGuidelines.depth,
          `Question ${question.id} must have depth scoring guideline`,
        );
        assert.ok(
          question.evaluationCriteria.scoringGuidelines.clarity,
          `Question ${question.id} must have clarity scoring guideline`,
        );
        assert.ok(
          question.evaluationCriteria.scoringGuidelines.relevance,
          `Question ${question.id} must have relevance scoring guideline`,
        );

        // Time limit bounds
        assert.equal(typeof question.timeLimitSeconds, 'number');
        assert.ok(
          question.timeLimitSeconds > 0 &&
            question.timeLimitSeconds <= INTERVIEW_LIMITS.maxTimePerQuestionSeconds,
          `Question ${question.id} time limit must be between 1 and ${INTERVIEW_LIMITS.maxTimePerQuestionSeconds} seconds`,
        );
      }
    });
  });

  describe('4. Deterministic Question Selection', () => {
    it('produces identical question sequence given identical parameters and seed', () => {
      const params = {
        targetRole: 'backend-developer',
        targetSkills: ['Node.js', 'SQL', 'MongoDB'],
        difficulty: 'intermediate',
        count: 3,
        seed: 'test-seed-alpha',
      };

      const run1 = selectQuestionsForSession(params);
      const run2 = selectQuestionsForSession(params);

      assert.equal(run1.length, 3);
      assert.equal(run2.length, 3);
      assert.deepEqual(run1, run2);

      // Verify shape matches InterviewSession schema requirements
      for (let i = 0; i < run1.length; i += 1) {
        const q = run1[i];
        assert.equal(q.order, i + 1);
        assert.ok(q.questionId.startsWith('iq-'));
        assert.ok(q.prompt.length >= 20);
        assert.ok(canonicalSkill(q.targetSkill));
        assert.ok(Array.isArray(q.rubricCriteria));
      }
    });

    it('distributes selected questions across requested target skills', () => {
      const result = selectQuestionsForSession({
        targetRole: 'backend-developer',
        targetSkills: ['Node.js', 'SQL'],
        difficulty: 'intermediate',
        count: 2,
      });

      assert.equal(result.length, 2);
      const skillsInResult = result.map((q) => q.targetSkill);
      assert.ok(skillsInResult.includes('Node.js'));
      assert.ok(skillsInResult.includes('SQL'));
    });

    it('accepts role title as well as role ID', () => {
      const byId = selectQuestionsForSession({
        targetRole: 'backend-developer',
        targetSkills: ['Node.js'],
        count: 1,
      });
      const byTitle = selectQuestionsForSession({
        targetRole: 'Backend Developer',
        targetSkills: ['Node.js'],
        count: 1,
      });

      assert.equal(byId[0].questionId, byTitle[0].questionId);
    });

    it('ensures zero duplicate questions within a session even when requested count exceeds available bank items', () => {
      // Node.js has 3 questions; requesting 10 must return only 3 unique questions without repeats
      const singleSkillResult = selectQuestionsForSession({
        targetRole: 'backend-developer',
        targetSkills: ['Node.js'],
        count: 10,
      });

      assert.equal(singleSkillResult.length, 3);
      const singleSkillIds = singleSkillResult.map((q) => q.questionId);
      assert.equal(new Set(singleSkillIds).size, singleSkillResult.length);

      // Node.js (3) + MongoDB (1) = 4 total; requesting 6 must yield exactly 4 unique questions
      const multiSkillResult = selectQuestionsForSession({
        targetRole: 'backend-developer',
        targetSkills: ['Node.js', 'MongoDB'],
        count: 6,
      });

      assert.equal(multiSkillResult.length, 4);
      const multiSkillIds = multiSkillResult.map((q) => q.questionId);
      assert.equal(new Set(multiSkillIds).size, multiSkillResult.length);
    });

    it('enforces target-role relevance by matching questions tagged for the target role', () => {
      const devopsQuestions = selectQuestionsForSession({
        targetRole: 'devops-engineer',
        targetSkills: ['Docker', 'Git', 'Linux'],
        count: 3,
      });

      assert.equal(devopsQuestions.length, 3);
      for (const q of devopsQuestions) {
        const original = INTERVIEW_QUESTION_BANK.find((orig) => orig.id === q.questionId);
        assert.ok(original, `Selected question ${q.questionId} must exist in bank`);
        assert.ok(
          original.roles.includes('devops-engineer'),
          `Selected question ${q.questionId} must be mapped to devops-engineer`,
        );
      }

      const frontendQuestions = selectQuestionsForSession({
        targetRole: 'frontend-developer',
        targetSkills: ['JavaScript', 'React'],
        count: 2,
      });

      assert.equal(frontendQuestions.length, 2);
      for (const q of frontendQuestions) {
        const original = INTERVIEW_QUESTION_BANK.find((orig) => orig.id === q.questionId);
        assert.ok(
          original.roles.includes('frontend-developer'),
          `Selected question ${q.questionId} must be mapped to frontend-developer`,
        );
      }
    });

    it('guarantees deterministic repeatable ordering across multiple consecutive runs', () => {
      const params = {
        targetRole: 'backend-developer',
        targetSkills: ['JavaScript', 'SQL', 'Node.js'],
        difficulty: 'intermediate',
        count: 3,
      };

      const baseline = selectQuestionsForSession(params);
      for (let i = 0; i < 5; i += 1) {
        const comparison = selectQuestionsForSession(params);
        assert.deepEqual(comparison, baseline, `Run ${i + 1} diverged from baseline deterministic selection`);
      }
    });

    it('maintains contiguous 1-based ordering without gaps', () => {
      const result = selectQuestionsForSession({
        targetRole: 'full-stack-developer',
        targetSkills: ['JavaScript', 'React', 'Node.js', 'SQL'],
        count: 4,
      });

      assert.equal(result.length, 4);
      result.forEach((q, idx) => {
        assert.equal(q.order, idx + 1);
      });
    });
  });

  describe('5. Unsupported Skills & Error Handling', () => {
    it('correctly reports supported vs unsupported skills', () => {
      assert.equal(isSkillSupported('Node.js'), true);
      assert.equal(isSkillSupported('JavaScript'), true);
      assert.equal(isSkillSupported('React'), true);
      assert.equal(isSkillSupported('SQL'), true);

      // Canonical skill that does not have curated questions in the bank yet
      assert.equal(isSkillSupported('Flutter'), false);

      // Non-existent skill
      assert.equal(isSkillSupported('NonExistentTool123'), false);
    });

    it('getSupportedSkills returns sorted canonical skill names', () => {
      const supported = getSupportedSkills();
      assert.ok(supported.length >= 5);
      const sorted = [...supported].sort();
      assert.deepEqual(supported, sorted);
      assert.ok(supported.includes('Node.js'));
    });

    it('rejects unknown role with informative error message', () => {
      assert.throws(
        () =>
          selectQuestionsForSession({
            targetRole: 'quantum-astrophysicist',
            targetSkills: ['Node.js'],
          }),
        /Role "quantum-astrophysicist" is not a recognized career role/,
      );
    });

    it('rejects non-canonical target skills with informative error message', () => {
      assert.throws(
        () =>
          selectQuestionsForSession({
            targetRole: 'backend-developer',
            targetSkills: ['Node.js', 'UnrecognizedSkill99'],
          }),
        /Target skill "UnrecognizedSkill99" is not a recognized canonical skill/,
      );
    });

    it('throws clear error when all requested target skills are unsupported in bank', () => {
      // 'Flutter' is canonical but has no questions in current curated bank
      assert.ok(canonicalSkill('Flutter'));
      assert.equal(isSkillSupported('Flutter'), false);

      assert.throws(
        () =>
          selectQuestionsForSession({
            targetRole: 'mobile-developer',
            targetSkills: ['Flutter'],
          }),
        /No curated interview questions are currently available for: "Flutter"/,
      );
    });

    it('rejects invalid difficulty values with informative error message', () => {
      assert.throws(
        () =>
          selectQuestionsForSession({
            targetRole: 'backend-developer',
            targetSkills: ['Node.js'],
            difficulty: 'grandmaster',
          }),
        /Difficulty "grandmaster" is not a recognized interview difficulty level/,
      );
    });

    it('rejects targetSkills when list exceeds maximum allowed target skills', () => {
      assert.throws(
        () =>
          selectQuestionsForSession({
            targetRole: 'backend-developer',
            targetSkills: ['Node.js', 'React', 'SQL', 'MongoDB', 'Docker', 'Python'],
          }),
        /targetSkills cannot exceed maximum of 5 skills/,
      );
    });
  });

  describe('6. Query Filter Helpers', () => {
    it('filters questions for a skill with optional difficulty and role', () => {
      const allNodeQuestions = getQuestionsForSkill('Node.js');
      assert.ok(allNodeQuestions.length >= 2);

      const intermediateNode = getQuestionsForSkill('Node.js', { difficulty: 'intermediate' });
      assert.ok(intermediateNode.every((q) => q.difficulty === 'intermediate'));

      const backendNode = getQuestionsForSkill('Node.js', { roleId: 'backend-developer' });
      assert.ok(backendNode.every((q) => q.roles.includes('backend-developer')));
    });

    it('filters questions for a role', () => {
      const backendQuestions = getQuestionsForRole('backend-developer');
      assert.ok(backendQuestions.length >= 4);
      assert.ok(backendQuestions.every((q) => q.roles.includes('backend-developer')));
    });
  });
});
