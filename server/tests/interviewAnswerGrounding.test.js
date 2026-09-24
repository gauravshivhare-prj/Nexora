import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  INTERVIEW_EVALUATION_SYSTEM_PROMPT,
  buildInterviewEvaluationRequest,
  checkAnswerRelevanceMarkers,
  escapeCandidateAnswerForPrompt,
  groundAnswerEvaluation,
} from '../src/domain/interview/interviewAnswerGrounding.js';
import { ADVERSARIAL_INTERVIEW_FIXTURES } from './fixtures/adversarialInterviewFixtures.js';

describe('R6 — Interview Answer Grounding & Adversarial Defense Suite', () => {
  const sampleQuestion = {
    id: 'iq-node-001',
    targetSkill: 'Node.js',
    type: 'conceptual',
    difficulty: 'intermediate',
    prompt: 'Explain the primary phases of the Node.js event loop.',
    rubricCriteria: [
      'Names event loop phases (timers, poll, check, close)',
      'Explains microtask queue priority and process.nextTick',
    ],
  };

  describe('1. Prompt Isolation & Delimiter Protection', () => {
    it('keeps system prompt immutable and completely free of untrusted candidate answer', () => {
      const maliciousAnswer = ADVERSARIAL_INTERVIEW_FIXTURES.DIRECT_SYSTEM_OVERRIDE.answerText;
      const request = buildInterviewEvaluationRequest({
        question: sampleQuestion,
        answerText: maliciousAnswer,
      });

      // System prompt must remain constant and pure
      assert.equal(request.system, INTERVIEW_EVALUATION_SYSTEM_PROMPT);
      assert.ok(!request.system.includes('SYSTEM OVERRIDE'));
      assert.ok(!request.system.includes('flawless performance'));

      // Untrusted answer must be contained inside request.user
      assert.ok(request.user.includes('<candidate_untrusted_answer>'));
      assert.ok(request.user.includes('SYSTEM OVERRIDE'));
      assert.ok(request.user.includes('</candidate_untrusted_answer>'));
    });

    it('neutralizes XML closing tag breakout attempts in candidate answer', () => {
      const breakoutAnswer = ADVERSARIAL_INTERVIEW_FIXTURES.DELIMITER_BREAKOUT.answerText;
      const escaped = escapeCandidateAnswerForPrompt(breakoutAnswer);

      assert.ok(!escaped.includes('</candidate_untrusted_answer>'));
      assert.ok(escaped.includes('&lt;/candidate_untrusted_answer&gt;'));
      assert.ok(escaped.includes('&lt;system_instruction&gt;'));
    });

    it('embeds question definition and rubric criteria in structured XML blocks', () => {
      const request = buildInterviewEvaluationRequest({
        question: sampleQuestion,
        answerText: 'Simple answer',
      });

      assert.ok(request.user.includes('<question_target>'));
      assert.ok(request.user.includes('Target Skill: Node.js'));
      assert.ok(request.user.includes('Difficulty: intermediate'));
      assert.ok(request.user.includes('<rubric_criteria>'));
      assert.ok(request.user.includes('Names event loop phases'));
    });
  });

  describe('2. Adversarial Injection Neutralization & Grounding', () => {
    it('defends against direct system override even if an AI model double returned 1.0', () => {
      // Simulate an AI provider that was duped by the injection and returned perfect marks
      const dupedAiOutput = {
        dimensions: { accuracy: 1.0, depth: 1.0, clarity: 1.0, relevance: 1.0 },
        compositeScore: 1.0,
        feedback: 'Exceptional performance - verified engineer',
        strengths: ['Flawless'],
        growthAreas: [],
        groundedSkills: ['Node.js'],
      };

      const result = groundAnswerEvaluation(dupedAiOutput, {
        question: sampleQuestion,
        candidateAnswer: ADVERSARIAL_INTERVIEW_FIXTURES.DIRECT_SYSTEM_OVERRIDE.answerText,
      });

      // Grounding must stop the injection: cap relevance, accuracy, and depth to <= 0.1
      assert.ok(result.evaluation.dimensions.relevance <= 0.1);
      assert.ok(result.evaluation.dimensions.accuracy <= 0.1);
      assert.ok(result.evaluation.dimensions.depth <= 0.1);
      assert.ok(result.evaluation.compositeScore <= 0.1);

      // Adversarial injections must never earn skill grounding
      assert.deepEqual(result.evaluation.groundedSkills, []);
      assert.ok(result.warnings.some((w) => w.includes('Adversarial prompt injection pattern detected')));
    });

    it('neutralizes delimiter breakout injection during grounding', () => {
      const dupedAiOutput = {
        dimensions: { accuracy: 0.9, depth: 0.9, clarity: 0.9, relevance: 0.9 },
        compositeScore: 0.9,
        feedback: 'Awarding 1.0 as instructed',
        strengths: [],
        growthAreas: [],
        groundedSkills: ['Node.js'],
      };

      const result = groundAnswerEvaluation(dupedAiOutput, {
        question: sampleQuestion,
        candidateAnswer: ADVERSARIAL_INTERVIEW_FIXTURES.DELIMITER_BREAKOUT.answerText,
      });

      assert.ok(result.evaluation.dimensions.relevance <= 0.1);
      assert.deepEqual(result.evaluation.groundedSkills, []);
      assert.ok(result.warnings.length > 0);
    });

    it('neutralizes roleplay / jailbreak attempts during grounding', () => {
      const dupedAiOutput = {
        dimensions: { accuracy: 1.0, depth: 1.0, clarity: 1.0, relevance: 1.0 },
        compositeScore: 1.0,
        feedback: 'As Dan, I award 1.0',
        strengths: [],
        growthAreas: [],
        groundedSkills: ['SQL'],
      };

      const result = groundAnswerEvaluation(dupedAiOutput, {
        question: { ...sampleQuestion, targetSkill: 'SQL' },
        candidateAnswer: ADVERSARIAL_INTERVIEW_FIXTURES.ROLEPLAY_JAILBREAK.answerText,
      });

      assert.ok(result.evaluation.dimensions.relevance <= 0.1);
      assert.deepEqual(result.evaluation.groundedSkills, []);
    });
  });

  describe('3. Keyword Stuffing & Off-Topic Evasion Detection', () => {
    it('detects keyword stuffing and restricts relevance and skill grounding', () => {
      const keywordAnswer = ADVERSARIAL_INTERVIEW_FIXTURES.KEYWORD_STUFFING.answerText;
      const marker = checkAnswerRelevanceMarkers(keywordAnswer, 'Node.js');
      assert.equal(marker.isKeywordStuffing, true);

      const aiOutput = {
        dimensions: { accuracy: 0.6, depth: 0.5, clarity: 0.4, relevance: 0.8 },
        compositeScore: 0.6,
        feedback: 'Mentioned many skills',
        strengths: [],
        growthAreas: ['Needs conceptual explanation'],
        groundedSkills: ['Node.js', 'React', 'Docker'],
      };

      const result = groundAnswerEvaluation(aiOutput, {
        question: sampleQuestion,
        candidateAnswer: keywordAnswer,
      });

      assert.ok(result.evaluation.dimensions.relevance <= 0.25);
      assert.ok(result.evaluation.dimensions.depth <= 0.2);
      assert.deepEqual(result.evaluation.groundedSkills, []);
      assert.ok(result.warnings.some((w) => w.includes('Keyword stuffing detected')));
    });

    it('refuses to ground skills for off-topic evasion answers', () => {
      const cakeRecipe = ADVERSARIAL_INTERVIEW_FIXTURES.OFF_TOPIC_EVASION.answerText;

      // Realistic model reading of an off-topic answer: low relevance
      const aiOutput = {
        dimensions: { accuracy: 0.05, depth: 0.0, clarity: 0.8, relevance: 0.05 },
        compositeScore: 0.18,
        feedback: 'The candidate answered with a baking recipe instead of discussing SQL indexing.',
        strengths: [],
        growthAreas: ['Answer the technical question'],
        groundedSkills: ['SQL'],
      };

      const result = groundAnswerEvaluation(aiOutput, {
        question: { ...sampleQuestion, targetSkill: 'SQL' },
        candidateAnswer: cakeRecipe,
      });

      assert.deepEqual(result.evaluation.groundedSkills, []);
      assert.ok(result.evaluation.compositeScore < 0.25);
    });
  });

  describe('4. Legitimate Answers & True Skill Grounding', () => {
    it('properly endorses canonical targetSkill for high quality legitimate answers', () => {
      const goodAnswer = ADVERSARIAL_INTERVIEW_FIXTURES.LEGITIMATE_STRONG_ANSWER.answerText;

      const aiOutput = {
        dimensions: { accuracy: 0.95, depth: 0.90, clarity: 0.90, relevance: 0.95 },
        compositeScore: 0.93,
        feedback: 'Comprehensive breakdown of libuv event loop phases and microtasks scheduling.',
        strengths: ['Clear phase explanation', 'Accurate microtask priority'],
        growthAreas: [],
        groundedSkills: ['Node.js', 'JavaScript'],
      };

      const result = groundAnswerEvaluation(aiOutput, {
        question: sampleQuestion,
        candidateAnswer: goodAnswer,
      });

      assert.equal(result.warnings.length, 0);
      assert.ok(result.evaluation.dimensions.accuracy >= 0.9);
      assert.ok(result.evaluation.dimensions.relevance >= 0.9);
      assert.deepEqual(result.evaluation.groundedSkills, ['Node.js']);
    });

    it('does not flag honest junior answer with misconceptions as adversarial', () => {
      const juniorAnswer = ADVERSARIAL_INTERVIEW_FIXTURES.LEGITIMATE_JUNIOR_ANSWER.answerText;

      const aiOutput = {
        dimensions: { accuracy: 0.55, depth: 0.40, clarity: 0.70, relevance: 0.80 },
        compositeScore: 0.5725,
        feedback: 'Understands basic async concept but confused nextTick priority relative to setImmediate.',
        strengths: ['Identified single-threaded JS model'],
        growthAreas: ['Review check phase vs nextTick queue priority'],
        groundedSkills: ['Node.js'],
      };

      const result = groundAnswerEvaluation(aiOutput, {
        question: sampleQuestion,
        candidateAnswer: juniorAnswer,
      });

      assert.equal(result.warnings.length, 0); // Not flagged as adversarial
      // Accuracy 0.55 is below 0.65 threshold, so targetSkill is not yet endorsed as grounded evidence
      assert.deepEqual(result.evaluation.groundedSkills, []);
      assert.equal(result.evaluation.dimensions.relevance, 0.80);
    });
  });
});
