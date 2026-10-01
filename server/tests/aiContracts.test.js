import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AI_AUTHORITY_TIER,
  AI_CONTRACT_ID,
  AI_CONTRACT_REGISTRY,
  getAiContract,
  getAiContractInventory,
  assertAiBoundary,
} from '../src/domain/ai/aiContracts.js';
import { buildResumeExtractionRequest, RESUME_PROMPT_VERSION } from '../src/domain/resume/resumePrompt.js';
import { buildInterviewEvaluationRequest, INTERVIEW_PROMPT_VERSION } from '../src/domain/interview/interviewAnswerGrounding.js';
import { buildNarrativeRequest, NARRATIVE_PROMPT_VERSION } from '../src/domain/careerTwin/careerTwinNarrative.js';
import {
  registerAiProvider,
  requestCompletion,
  resetAiProviders,
  useAiProvider,
} from '../src/services/ai/aiProvider.js';

describe('Task 13 — Gemini Intelligence Architecture & AI Boundary Redesign Suite', () => {
  // =========================================================================
  // 1. AI Contract Registry & Immutability
  // =========================================================================
  describe('1. AI Contract Registry & Immutability', () => {
    it('registers all required core AI touchpoints with frozen specifications', () => {
      const inventory = getAiContractInventory();
      assert.equal(inventory.length, 4);

      const contractIds = inventory.map((c) => c.id);
      assert.ok(contractIds.includes(AI_CONTRACT_ID.RESUME_EXTRACTION));
      assert.ok(contractIds.includes(AI_CONTRACT_ID.INTERVIEW_EVALUATION));
      assert.ok(contractIds.includes(AI_CONTRACT_ID.CAREERTWIN_NARRATIVE));
      assert.ok(contractIds.includes(AI_CONTRACT_ID.ROLE_PROPOSAL));

      for (const contract of inventory) {
        assert.ok(Object.isFrozen(contract), `Contract ${contract.id} must be frozen`);
        assert.ok(contract.version, `Contract ${contract.id} must have a version string`);
        assert.ok(contract.purpose, `Contract ${contract.id} must have a documented purpose`);
        assert.ok(contract.authorityTier, `Contract ${contract.id} must have an explicit authority tier`);
        assert.equal(contract.canEstablishTruth, false, `Contract ${contract.id} must NEVER establish ground truth`);
      }
    });

    it('retrieves contract by ID and throws on unrecognized contract IDs', () => {
      const contract = getAiContract(AI_CONTRACT_ID.RESUME_EXTRACTION);
      assert.equal(contract.id, AI_CONTRACT_ID.RESUME_EXTRACTION);
      assert.equal(contract.authorityTier, AI_AUTHORITY_TIER.EXTRACTION_CLAIMED);

      assert.throws(
        () => getAiContract('non_existent_contract'),
        /Unrecognized AI Contract ID/,
      );
    });
  });

  // =========================================================================
  // 2. Generation vs Decision Authority Boundaries
  // =========================================================================
  describe('2. Generation vs Decision Authority Boundaries', () => {
    it('strictly forbids any AI contract from directly establishing canonical truth', () => {
      assert.throws(
        () => assertAiBoundary(AI_CONTRACT_ID.RESUME_EXTRACTION, 'establish_canonical_truth'),
        /forbidden from establishing ground truth/i,
      );

      assert.throws(
        () => assertAiBoundary(AI_CONTRACT_ID.INTERVIEW_EVALUATION, 'establish_canonical_truth'),
        /forbidden from establishing ground truth/i,
      );

      assert.throws(
        () => assertAiBoundary(AI_CONTRACT_ID.CAREERTWIN_NARRATIVE, 'establish_canonical_truth'),
        /forbidden from establishing ground truth/i,
      );
    });

    it('blocks resume extraction from promoting verified evidence or bypassing grounding', () => {
      assert.throws(
        () => assertAiBoundary(AI_CONTRACT_ID.RESUME_EXTRACTION, 'direct_verification_promotion'),
        /strictly forbidden for AI contract/i,
      );

      assert.throws(
        () => assertAiBoundary(AI_CONTRACT_ID.RESUME_EXTRACTION, 'bypass_grounding_check'),
        /strictly forbidden for AI contract/i,
      );

      // Allowed action passes cleanly
      assert.equal(assertAiBoundary(AI_CONTRACT_ID.RESUME_EXTRACTION, 'evidence_engine:create_claimed_evidence'), true);
    });

    it('blocks CareerTwin narrative from influencing career matching, readiness, or roadmaps', () => {
      assert.throws(
        () => assertAiBoundary(AI_CONTRACT_ID.CAREERTWIN_NARRATIVE, 'career_matching_influence'),
        /strictly forbidden for AI contract/i,
      );

      assert.throws(
        () => assertAiBoundary(AI_CONTRACT_ID.CAREERTWIN_NARRATIVE, 'readiness_score_influence'),
        /strictly forbidden for AI contract/i,
      );

      assert.throws(
        () => assertAiBoundary(AI_CONTRACT_ID.CAREERTWIN_NARRATIVE, 'roadmap_generation_influence'),
        /strictly forbidden for AI contract/i,
      );

      assert.equal(assertAiBoundary(AI_CONTRACT_ID.CAREERTWIN_NARRATIVE, 'frontend_ui:display_profile_narrative'), true);
    });
  });

  // =========================================================================
  // 3. Prompt Builders Contract Metadata & Context Bounds
  // =========================================================================
  describe('3. Prompt Builders Contract Metadata & Context Bounds', () => {
    it('buildResumeExtractionRequest binds contract ID, version, and bounded tokens', () => {
      const req = buildResumeExtractionRequest('Jane Doe\nSkills: JavaScript, Node.js');
      assert.equal(req.contractId, AI_CONTRACT_ID.RESUME_EXTRACTION);
      assert.equal(req.contractVersion, RESUME_PROMPT_VERSION);
      assert.ok(req.maxOutputTokens <= 4096);
      assert.match(req.system, /Return ONLY a JSON object/);
      assert.match(req.user, /<untrusted_resume_text>/);
    });

    it('buildInterviewEvaluationRequest binds contract ID, version, and bounded tokens', () => {
      const req = buildInterviewEvaluationRequest({
        question: {
          id: 'q_test_1',
          targetSkill: 'JavaScript',
          prompt: 'Explain closures in JavaScript.',
          rubricCriteria: ['Lexical scoping', 'Function scope preservation'],
        },
        answerText: 'A closure is a function bundled with its lexical environment.',
      });

      assert.equal(req.contractId, AI_CONTRACT_ID.INTERVIEW_EVALUATION);
      assert.equal(req.contractVersion, INTERVIEW_PROMPT_VERSION);
      assert.ok(req.maxOutputTokens <= 1024);
      assert.match(req.user, /<candidate_untrusted_answer>/);
    });

    it('buildNarrativeRequest binds contract ID, version, and bounded tokens', () => {
      const twin = {
        skills: [{ name: 'JavaScript', strength: 'supported', sourceCount: 2 }],
        academic: { branch: 'Computer Science', graduationYear: 2026 },
        interests: ['Web Development'],
        indicators: { projectCount: 2, certificationCount: 0 },
      };

      const req = buildNarrativeRequest(twin);
      assert.equal(req.contractId, AI_CONTRACT_ID.CAREERTWIN_NARRATIVE);
      assert.equal(req.contractVersion, NARRATIVE_PROMPT_VERSION);
      assert.ok(req.maxOutputTokens <= 500);
      assert.match(req.user, /Skills:\n- JavaScript/);
    });
  });

  // =========================================================================
  // 4. End-to-End Completion Provider Contract Metadata Pass-Through
  // =========================================================================
  describe('4. End-to-End Completion Provider Contract Metadata Pass-Through', () => {
    it('enforces contract token limits and includes contract metadata in completion result', async () => {
      let receivedMaxTokens = null;

      const mockProvider = {
        name: 'mock-gemini-test',
        async complete(req) {
          receivedMaxTokens = req.maxOutputTokens;
          return {
            text: JSON.stringify({ summary: 'Candidate shows strong foundational web skills.' }),
            model: 'gemini-2.0-flash-contract-test',
          };
        },
      };

      registerAiProvider(mockProvider);
      useAiProvider('mock-gemini-test');

      try {
        const twin = {
          skills: [{ name: 'JavaScript', strength: 'supported' }],
          academic: { branch: 'CS', graduationYear: 2026 },
        };
        const req = buildNarrativeRequest(twin);

        // Attempt to pass an artificially high maxOutputTokens
        const res = await requestCompletion({
          ...req,
          maxOutputTokens: 99999, // Should be capped by contract context limit (500)
        });

        assert.equal(receivedMaxTokens, 500);
        assert.equal(res.contractId, AI_CONTRACT_ID.CAREERTWIN_NARRATIVE);
        assert.equal(res.contractVersion, NARRATIVE_PROMPT_VERSION);
        assert.equal(res.model, 'gemini-2.0-flash-contract-test');
      } finally {
        resetAiProviders();
      }
    });
  });
});
