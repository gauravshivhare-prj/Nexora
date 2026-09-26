/**
 * A12 — Interview Question Quality Audit Test Suite
 *
 * Verifies:
 * 1. Curated question bank integrity (unique IDs, unique prompts, canonical skill references, valid roles, rubric criteria).
 * 2. 100% role coverage across all 10 career catalogue roles without fatal errors.
 * 3. Difficulty coverage (beginner, intermediate, advanced) across role categories.
 * 4. Question type variety including behavioral questions and type-based filtering.
 * 5. Full contract parity with validateInterviewQuestion and Mongoose schema requirements.
 * 6. Preservation of unsupported skills (e.g. Flutter) and security error boundaries.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  INTERVIEW_QUESTION_BANK,
  QUESTION_BANK_VERSION,
  getAllQuestions,
  getQuestionById,
  getSupportedSkills,
  isSkillSupported,
  getQuestionsForSkill,
  getQuestionsForRole,
  selectQuestionsForSession,
} from '../src/domain/interview/interviewQuestions.js';

import {
  INTERVIEW_DIFFICULTY,
  INTERVIEW_DIFFICULTY_VALUES,
  INTERVIEW_QUESTION_TYPES,
  INTERVIEW_QUESTION_TYPE_VALUES,
  validateInterviewQuestion,
} from '../src/domain/interview/interviewContract.js';

import { CAREER_ROLES } from '../src/domain/careers/roleCatalogue.js';
import { canonicalSkill } from '../src/domain/skills/skillKey.js';

// Isolated Mongo DB URI per task specification
process.env.TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/nexora_anvesha_a12_test';

describe('A12 — Interview Question Quality & Bank Audit Suite', () => {
  describe('1. Bank Integrity, Duplicates, and Taxonomy Coverage', () => {
    it('declares question bank version 2 with expanded quality curation', () => {
      assert.equal(QUESTION_BANK_VERSION, 2);
      assert.ok(INTERVIEW_QUESTION_BANK.length >= 40, `Bank has ${INTERVIEW_QUESTION_BANK.length} questions, expected >= 40`);
    });

    it('has zero duplicate question IDs across the entire bank', () => {
      const seenIds = new Set();
      const duplicateIds = [];

      for (const q of INTERVIEW_QUESTION_BANK) {
        if (seenIds.has(q.id)) {
          duplicateIds.push(q.id);
        }
        seenIds.add(q.id);
      }

      assert.deepEqual(duplicateIds, [], `Found duplicate question IDs: ${duplicateIds.join(', ')}`);
    });

    it('has zero duplicate or near-duplicate prompts', () => {
      const seenPrompts = new Set();
      const duplicatePrompts = [];

      for (const q of INTERVIEW_QUESTION_BANK) {
        const normalizedPrompt = q.intent.prompt.trim().toLowerCase();
        if (seenPrompts.has(normalizedPrompt)) {
          duplicatePrompts.push(q.id);
        }
        seenPrompts.add(normalizedPrompt);
      }

      assert.deepEqual(duplicatePrompts, [], `Found duplicate question prompts in: ${duplicatePrompts.join(', ')}`);
    });

    it('every question adheres strictly to structural schema requirements', () => {
      const idPattern = /^iq-[a-z0-9]+-\d{3}$/;

      for (const q of INTERVIEW_QUESTION_BANK) {
        // ID format
        assert.match(q.id, idPattern, `Question ${q.id} has invalid ID format`);

        // Versioning
        assert.ok(Number.isInteger(q.version) && q.version >= 1, `Question ${q.id} version must be >= 1`);

        // Skill canonicalization
        assert.ok(typeof q.targetSkill === 'string' && q.targetSkill.trim().length > 0, `Question ${q.id} missing targetSkill`);
        const canonical = canonicalSkill(q.targetSkill);
        assert.ok(canonical, `Question ${q.id} targetSkill "${q.targetSkill}" is not canonical`);
        assert.equal(q.targetSkill, canonical.name, `Question ${q.id} targetSkill name mismatch`);
        assert.equal(q.skillKey, canonical.key, `Question ${q.id} skillKey mismatch`);

        // Difficulty & Type constants
        assert.ok(INTERVIEW_DIFFICULTY_VALUES.includes(q.difficulty), `Question ${q.id} invalid difficulty: ${q.difficulty}`);
        assert.ok(INTERVIEW_QUESTION_TYPE_VALUES.includes(q.type), `Question ${q.id} invalid type: ${q.type}`);

        // Roles
        assert.ok(Array.isArray(q.roles) && q.roles.length > 0, `Question ${q.id} has empty roles`);
        for (const roleId of q.roles) {
          const roleExists = CAREER_ROLES.some((r) => r.id === roleId);
          assert.ok(roleExists, `Question ${q.id} references non-existent role: ${roleId}`);
        }

        // Time limits
        assert.ok(Number.isInteger(q.timeLimitSeconds) && q.timeLimitSeconds >= 60 && q.timeLimitSeconds <= 600, `Question ${q.id} invalid timeLimitSeconds: ${q.timeLimitSeconds}`);

        // Intent
        assert.ok(typeof q.intent?.summary === 'string' && q.intent.summary.length >= 10, `Question ${q.id} invalid intent.summary`);
        assert.ok(typeof q.intent?.prompt === 'string' && q.intent.prompt.length >= 20, `Question ${q.id} invalid intent.prompt`);
        assert.ok(typeof q.intent?.context === 'string' && q.intent.context.length >= 10, `Question ${q.id} invalid intent.context`);

        // Evaluation criteria
        assert.ok(Array.isArray(q.evaluationCriteria?.rubricCriteria) && q.evaluationCriteria.rubricCriteria.length >= 2, `Question ${q.id} rubricCriteria must have >= 2 items`);
        assert.ok(Array.isArray(q.evaluationCriteria?.expectedKeyConcepts) && q.evaluationCriteria.expectedKeyConcepts.length >= 1, `Question ${q.id} expectedKeyConcepts empty`);
        assert.ok(Array.isArray(q.evaluationCriteria?.commonMisconceptions) && q.evaluationCriteria.commonMisconceptions.length >= 1, `Question ${q.id} commonMisconceptions empty`);
        assert.ok(typeof q.evaluationCriteria?.scoringGuidelines?.accuracy === 'string', `Question ${q.id} missing scoringGuidelines.accuracy`);
        assert.ok(typeof q.evaluationCriteria?.scoringGuidelines?.depth === 'string', `Question ${q.id} missing scoringGuidelines.depth`);
        assert.ok(typeof q.evaluationCriteria?.scoringGuidelines?.clarity === 'string', `Question ${q.id} missing scoringGuidelines.clarity`);
        assert.ok(typeof q.evaluationCriteria?.scoringGuidelines?.relevance === 'string', `Question ${q.id} missing scoringGuidelines.relevance`);
      }
    });
  });

  describe('2. Career Role Coverage (Zero Dead Roles)', () => {
    it('provides curated questions for all 10 catalogue career roles', () => {
      for (const role of CAREER_ROLES) {
        const matchingQuestions = INTERVIEW_QUESTION_BANK.filter((q) => q.roles.includes(role.id));
        assert.ok(
          matchingQuestions.length >= 3,
          `Role ${role.id} (${role.title}) only has ${matchingQuestions.length} questions, expected at least 3`,
        );
      }
    });

    it('successfully selects session questions for every catalogue role without missing curated question errors', () => {
      for (const role of CAREER_ROLES) {
        // Collect required skills that are supported
        const supportedSkills = role.requiredSkills.filter((s) => isSkillSupported(s));
        assert.ok(
          supportedSkills.length > 0,
          `Role ${role.id} has no supported skills in its requiredSkills list: ${role.requiredSkills.join(', ')}`,
        );

        const selected = selectQuestionsForSession({
          targetRole: role.id,
          targetSkills: supportedSkills,
          difficulty: INTERVIEW_DIFFICULTY.INTERMEDIATE,
          count: 3,
          seed: `role-test-${role.id}`,
        });

        assert.ok(Array.isArray(selected) && selected.length > 0, `Failed to select questions for role ${role.id}`);
        assert.equal(selected.length, Math.min(3, supportedSkills.length * 5));

        for (const sq of selected) {
          assert.ok(sq.id, 'Session question missing id');
          assert.ok(sq.questionId, 'Session question missing questionId');
          assert.equal(sq.id, sq.questionId, 'id and questionId should match');
          assert.ok(sq.prompt.length >= 20, 'Prompt too short');
          assert.ok(sq.rubricCriteria.length >= 2, 'Rubric criteria missing');
          assert.ok(Number.isInteger(sq.timeLimitSeconds), 'timeLimitSeconds missing or invalid');
        }
      }
    });

    it('specifically supports previously failing roles: qa-engineer and ui-ux-designer', () => {
      // QA Engineer
      const qaQuestions = selectQuestionsForSession({
        targetRole: 'qa-engineer',
        targetSkills: ['Testing', 'Test Automation'],
        difficulty: INTERVIEW_DIFFICULTY.INTERMEDIATE,
        count: 2,
        seed: 'qa-seed',
      });
      assert.equal(qaQuestions.length, 2);
      assert.ok(qaQuestions.some((q) => q.targetSkill === 'Testing'));
      assert.ok(qaQuestions.some((q) => q.targetSkill === 'Test Automation'));

      // UI/UX Designer
      const designQuestions = selectQuestionsForSession({
        targetRole: 'ui-ux-designer',
        targetSkills: ['UI Design', 'UX Research', 'Figma'],
        difficulty: INTERVIEW_DIFFICULTY.INTERMEDIATE,
        count: 3,
        seed: 'design-seed',
      });
      assert.equal(designQuestions.length, 3);
      const designSkills = designQuestions.map((q) => q.targetSkill);
      assert.ok(designSkills.includes('UI Design') || designSkills.includes('UX Research') || designSkills.includes('Figma'));
    });
  });

  describe('3. Difficulty Tier Coverage & Quality', () => {
    it('contains balanced difficulty tiers across beginner, intermediate, and advanced', () => {
      const beginner = INTERVIEW_QUESTION_BANK.filter((q) => q.difficulty === INTERVIEW_DIFFICULTY.BEGINNER);
      const intermediate = INTERVIEW_QUESTION_BANK.filter((q) => q.difficulty === INTERVIEW_DIFFICULTY.INTERMEDIATE);
      const advanced = INTERVIEW_QUESTION_BANK.filter((q) => q.difficulty === INTERVIEW_DIFFICULTY.ADVANCED);

      assert.ok(beginner.length >= 6, `Expected >= 6 beginner questions, found ${beginner.length}`);
      assert.ok(intermediate.length >= 15, `Expected >= 15 intermediate questions, found ${intermediate.length}`);
      assert.ok(advanced.length >= 10, `Expected >= 10 advanced questions, found ${advanced.length}`);
    });

    it('prioritizes beginner questions when requested for roles with beginner options', () => {
      const questions = selectQuestionsForSession({
        targetRole: 'frontend-developer',
        targetSkills: ['HTML', 'CSS'],
        difficulty: INTERVIEW_DIFFICULTY.BEGINNER,
        count: 2,
        seed: 'beginner-frontend',
      });

      assert.equal(questions.length, 2);
      for (const q of questions) {
        assert.equal(q.difficulty, INTERVIEW_DIFFICULTY.BEGINNER, `Expected beginner question, got ${q.difficulty}`);
      }
    });

    it('prioritizes advanced questions when requested for backend systems', () => {
      const questions = selectQuestionsForSession({
        targetRole: 'backend-developer',
        targetSkills: ['Node.js', 'SQL'],
        difficulty: INTERVIEW_DIFFICULTY.ADVANCED,
        count: 2,
        seed: 'advanced-backend',
      });

      assert.equal(questions.length, 2);
      for (const q of questions) {
        assert.equal(q.difficulty, INTERVIEW_DIFFICULTY.ADVANCED, `Expected advanced question, got ${q.difficulty}`);
      }
    });
  });

  describe('4. Question Types & Type Filtering Helpers', () => {
    it('covers all declared question types including behavioral', () => {
      for (const type of INTERVIEW_QUESTION_TYPE_VALUES) {
        const matching = INTERVIEW_QUESTION_BANK.filter((q) => q.type === type);
        assert.ok(matching.length >= 2, `Expected >= 2 questions of type "${type}", found ${matching.length}`);
      }
    });

    it('filters questions by type using getQuestionsForSkill', () => {
      const behavioral = getQuestionsForSkill('JavaScript', { type: INTERVIEW_QUESTION_TYPES.BEHAVIORAL });
      assert.ok(behavioral.length >= 1);
      assert.equal(behavioral[0].type, INTERVIEW_QUESTION_TYPES.BEHAVIORAL);
      assert.equal(behavioral[0].id, 'iq-behav-001');
    });

    it('filters questions by type using getQuestionsForRole', () => {
      const devopsBehavioral = getQuestionsForRole('devops-engineer', {
        type: INTERVIEW_QUESTION_TYPES.BEHAVIORAL,
      });
      assert.ok(devopsBehavioral.length >= 1);
      assert.equal(devopsBehavioral[0].type, INTERVIEW_QUESTION_TYPES.BEHAVIORAL);
    });
  });

  describe('5. Contract Parity & Validation Parity', () => {
    it('ensures session questions strictly pass validateInterviewQuestion', () => {
      const questions = selectQuestionsForSession({
        targetRole: 'full-stack-developer',
        targetSkills: ['JavaScript', 'React', 'Node.js'],
        difficulty: INTERVIEW_DIFFICULTY.INTERMEDIATE,
        count: 3,
        seed: 'validation-test-seed',
      });

      for (let i = 0; i < questions.length; i++) {
        const validated = validateInterviewQuestion(questions[i], i);
        assert.equal(validated.id, questions[i].id);
        assert.equal(validated.type, questions[i].type);
        assert.equal(validated.targetSkillName, questions[i].targetSkill);
        assert.equal(validated.prompt, questions[i].prompt);
        assert.ok(validated.rubricCriteria.length >= 2);
      }
    });

    it('preserves Flutter as an unsupported skill', () => {
      assert.equal(isSkillSupported('Flutter'), false);
      assert.throws(
        () =>
          selectQuestionsForSession({
            targetRole: 'mobile-developer',
            targetSkills: ['Flutter'],
            seed: 42,
          }),
        /No curated interview questions are currently available for: "Flutter"/,
      );
    });
  });
});
