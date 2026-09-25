import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { buildNarrativeRequest } from '../src/domain/careerTwin/careerTwinNarrative.js';
import { buildInterviewEvaluationRequest } from '../src/domain/interview/interviewAnswerGrounding.js';
import { buildResumeExtractionRequest } from '../src/domain/resume/resumePrompt.js';
import { CareerTwin, Resume, StudentProfile } from '../src/models/index.js';
import {
  registerAiProvider,
  resetAiProviders,
  useAiProvider,
} from '../src/services/ai/aiProvider.js';
import { generateCareerTwin } from '../src/services/careerTwin.service.js';
import {
  clearCareerTwins,
  clearProfiles,
  clearResumes,
  clearUsers,
  postJson,
  resetRateLimiters,
  startTestServer,
} from './helpers/testServer.js';

describe('ai cost and latency controls (G17)', () => {
  let server;
  let providerCallCount = 0;
  let lastRequest = null;

  const mockProvider = {
    name: 'cost-control-mock',
    async complete(request) {
      providerCallCount += 1;
      lastRequest = request;
      return {
        text: JSON.stringify({
          summary: 'You have demonstrated strong proficiency in Node.js across verified projects.',
        }),
        model: 'cost-control-mock',
      };
    },
  };

  before(async () => {
    server = await startTestServer();
    registerAiProvider(mockProvider);
  });

  after(async () => {
    resetAiProviders();
    await server.close();
  });

  beforeEach(async () => {
    await clearUsers();
    await clearProfiles();
    await clearResumes();
    await clearCareerTwins();
    resetRateLimiters();
    useAiProvider('cost-control-mock');
    providerCallCount = 0;
    lastRequest = null;
  });

  describe('bounded token controls', () => {
    it('enforces safe maxOutputTokens on all domain AI request builders', () => {
      const narrativeReq = buildNarrativeRequest({
        skills: [{ name: 'Node.js', strength: 'verified', sourceCount: 1 }],
        interests: ['Backend'],
        targetRoles: [{ title: 'Backend Developer' }],
        academic: { branch: 'Computer Science', graduationYear: 2026 },
        indicators: { projectCount: 1, certificationCount: 0 },
      });
      assert.equal(narrativeReq.maxOutputTokens, 500);

      const interviewReq = buildInterviewEvaluationRequest({
        question: {
          prompt: 'Explain event loop',
          targetSkill: 'Node.js',
          type: 'conceptual',
          difficulty: 'intermediate',
        },
        answerText: 'The event loop handles asynchronous non-blocking I/O operations.',
      });
      assert.equal(interviewReq.maxOutputTokens, 2048);

      const resumeReq = buildResumeExtractionRequest('Gaurav Shivhare\nSkills: Node.js, React');
      assert.equal(resumeReq.maxOutputTokens, 4096);
    });
  });

  describe('CareerTwin narrative deduplication', () => {
    it('reuses existing narrative when twin is fresh and avoids duplicate AI calls', async () => {
      // 1. Create student and profile
      const authRes = await postJson(server.baseUrl, '/api/auth/register', {
        name: 'Gaurav AI Test',
        email: 'gaurav.ai@example.com',
        password: 'ValidPassword123!',
      });
      const userId = authRes.body.data.user.id;

      await StudentProfile.create({
        user: userId,
        skills: [{ name: 'Node.js', level: 'intermediate' }],
        projects: [{ title: 'Nexora', description: 'AI platform' }],
      });

      // 2. First generation with narrative
      assert.equal(providerCallCount, 0);
      const twin1 = await generateCareerTwin(userId, { withNarrative: true });
      assert.ok(twin1.narrative);
      assert.match(twin1.narrative.text, /Node\.js/);
      assert.equal(providerCallCount, 1, 'First generation should call AI provider once');

      // 3. Second generation immediately without data changes
      const twin2 = await generateCareerTwin(userId, { withNarrative: true });
      assert.ok(twin2.narrative);
      assert.equal(twin2.narrative.text, twin1.narrative.text);
      assert.equal(providerCallCount, 1, 'Second generation must reuse narrative and NOT call AI provider again');

      // 4. Data changes (profile updated with new skill)
      await new Promise((r) => setTimeout(r, 10)); // ensure timestamp advancement
      await StudentProfile.updateOne(
        { user: userId },
        {
          $set: {
            skills: [
              { name: 'Node.js', level: 'intermediate' },
              { name: 'React', level: 'beginner' },
            ],
            updatedAt: new Date(),
          },
        },
      );

      // 5. Third generation with narrative after data change
      const twin3 = await generateCareerTwin(userId, { withNarrative: true });
      assert.ok(twin3.narrative);
      assert.equal(providerCallCount, 2, 'Stale twin must trigger fresh narrative generation');
    });
  });
});
