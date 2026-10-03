import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  parsePagination,
  formatPagination,
  paginateArray,
} from '../src/utils/pagination.js';
import {
  InterviewSession,
  AssessmentAttempt,
  Resume,
} from '../src/models/index.js';
import {
  clearCareerTwins,
  clearProfiles,
  clearResumes,
  clearUsers,
  getWithToken,
  postJson,
  resetRateLimiters,
  sendJsonWithToken,
  sendWithToken,
  startTestServer,
} from './helpers/testServer.js';
import { fakePassword } from './helpers/fakeSecrets.js';

let server;
let counter = 0;
const TEST_PASSWORD = fakePassword('Task42PerfP@ss1');

describe('Task 42 — Performance, Pagination & Caching Architecture', () => {
  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.close();
  });

  beforeEach(async () => {
    await clearCareerTwins();
    await clearResumes();
    await clearProfiles();
    await clearUsers();
    resetRateLimiters();
  });

  async function registerAndLogin() {
    counter += 1;
    const email = `perf.task42.${Date.now()}.${counter}@example.com`;
    await postJson(server.baseUrl, '/api/auth/register', {
      name: 'Perf Student',
      email,
      password: TEST_PASSWORD,
    });
    const res = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password: TEST_PASSWORD,
    });
    return { user: res.body.data.user, token: res.body.data.token };
  }

  describe('1. Pagination Utility (parsePagination, formatPagination, paginateArray)', () => {
    it('provides sensible defaults when query params are absent', () => {
      const parsed = parsePagination({});
      assert.equal(parsed.page, 1);
      assert.equal(parsed.limit, 20);
      assert.equal(parsed.skip, 0);
    });

    it('enforces bounds and limits on query parameters', () => {
      const parsedNegative = parsePagination({ page: '-5', limit: '0' });
      assert.equal(parsedNegative.page, 1);
      assert.equal(parsedNegative.limit, 20);

      const parsedCapped = parsePagination({ page: '3', limit: '500' }, 20, 100);
      assert.equal(parsedCapped.page, 3);
      assert.equal(parsedCapped.limit, 100);
      assert.equal(parsedCapped.skip, 200);
    });

    it('calculates totalPages, hasNextPage, and hasPrevPage correctly', () => {
      const empty = formatPagination({ page: 1, limit: 10, total: 0 });
      assert.equal(empty.totalPages, 0);
      assert.equal(empty.hasNextPage, false);
      assert.equal(empty.hasPrevPage, false);

      const firstPage = formatPagination({ page: 1, limit: 10, total: 25 });
      assert.equal(firstPage.totalPages, 3);
      assert.equal(firstPage.hasNextPage, true);
      assert.equal(firstPage.hasPrevPage, false);

      const midPage = formatPagination({ page: 2, limit: 10, total: 25 });
      assert.equal(midPage.hasNextPage, true);
      assert.equal(midPage.hasPrevPage, true);

      const lastPage = formatPagination({ page: 3, limit: 10, total: 25 });
      assert.equal(lastPage.hasNextPage, false);
      assert.equal(lastPage.hasPrevPage, true);
    });

    it('correctly slices in-memory array via paginateArray', () => {
      const items = Array.from({ length: 55 }, (_, i) => `item_${i + 1}`);
      const paginated = paginateArray(items, { page: 2, limit: 20 });
      assert.equal(paginated.data.length, 20);
      assert.equal(paginated.data[0], 'item_21');
      assert.equal(paginated.data[19], 'item_40');
      assert.equal(paginated.pagination.page, 2);
      assert.equal(paginated.pagination.totalPages, 3);
      assert.equal(paginated.pagination.hasNextPage, true);
      assert.equal(paginated.pagination.hasPrevPage, true);
    });
  });

  describe('2. List Endpoint Pagination Integration', () => {
    it('paginates GET /api/assessments with query params', async () => {
      const { token } = await registerAndLogin();
      const res = await getWithToken(server.baseUrl, '/api/assessments?page=1&limit=3', token);

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.data.assessments));
      assert.ok(res.body.data.assessments.length <= 3);
      assert.ok(res.body.data.pagination);
      assert.equal(res.body.data.pagination.page, 1);
      assert.equal(res.body.data.pagination.limit, 3);
      assert.ok(res.body.data.pagination.total >= 0);
    });

    it('paginates GET /api/resumes with query params', async () => {
      const { token } = await registerAndLogin();

      // Seed 3 resumes
      for (let i = 1; i <= 3; i++) {
        await sendJsonWithToken(server.baseUrl, '/api/resumes', {
          method: 'POST',
          token,
          payload: {
            text: `Professional software developer resume ${i} with experience in Node, React, and MongoDB architecture.`,
            label: `CV #${i}`,
          },
        });
      }

      // Query page 1 with limit 2
      const page1 = await getWithToken(server.baseUrl, '/api/resumes?page=1&limit=2', token);
      assert.equal(page1.status, 200);
      assert.equal(page1.body.data.resumes.length, 2);
      assert.equal(page1.body.data.count, 2);
      assert.equal(page1.body.data.pagination.total, 3);
      assert.equal(page1.body.data.pagination.totalPages, 2);
      assert.equal(page1.body.data.pagination.hasNextPage, true);
      assert.equal(page1.body.data.pagination.hasPrevPage, false);

      // Query page 2 with limit 2
      const page2 = await getWithToken(server.baseUrl, '/api/resumes?page=2&limit=2', token);
      assert.equal(page2.status, 200);
      assert.equal(page2.body.data.resumes.length, 1);
      assert.equal(page2.body.data.count, 1);
      assert.equal(page2.body.data.pagination.page, 2);
      assert.equal(page2.body.data.pagination.hasNextPage, false);
      assert.equal(page2.body.data.pagination.hasPrevPage, true);
    });

    it('paginates GET /api/interviews/sessions with query params', async () => {
      const { token } = await registerAndLogin();

      // Seed 2 sessions
      for (let i = 1; i <= 2; i++) {
        await sendJsonWithToken(server.baseUrl, '/api/interviews/sessions', {
          method: 'POST',
          token,
          payload: {
            targetRole: 'Backend Developer',
            targetSkills: ['Node.js'],
          },
        });
      }

      const res = await getWithToken(server.baseUrl, '/api/interviews/sessions?page=1&limit=1', token);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.sessions.length, 1);
      assert.equal(res.body.data.count, 1);
      assert.equal(res.body.data.pagination.total, 2);
      assert.equal(res.body.data.pagination.totalPages, 2);
      assert.equal(res.body.data.pagination.hasNextPage, true);
    });
  });

  describe('3. Cache-Control Headers on Read-Only Computation Endpoints', () => {
    it('sets Cache-Control: private, max-age=60 on skill-gap, readiness, and roadmap', async () => {
      const { token } = await registerAndLogin();

      // Set target role on profile and create CareerTwin
      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          career: { targetRole: 'Backend Developer' },
          skills: [{ name: 'Node.js', level: 'intermediate' }],
        },
      });
      await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

      // 1. Skill Gap
      const gapRes = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/skill-gap',
        token,
      );
      assert.equal(gapRes.status, 200);
      assert.equal(gapRes.headers.get('cache-control'), 'private, max-age=60');

      // 2. Readiness
      const readinessRes = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        token,
      );
      assert.equal(readinessRes.status, 200);
      assert.equal(readinessRes.headers.get('cache-control'), 'private, max-age=60');

      // 3. Roadmap
      const roadmapRes = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/roadmap',
        token,
      );
      assert.equal(roadmapRes.status, 200);
      assert.equal(roadmapRes.headers.get('cache-control'), 'private, max-age=60');

      // 4. Readiness History
      const historyRes = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness/history',
        token,
      );
      assert.equal(historyRes.status, 200);
      assert.equal(historyRes.headers.get('cache-control'), 'private, max-age=60');
    });
  });

  describe('4. Database Compound Indexes Coverage', () => {
    it('verifies compound indexes on InterviewSession, AssessmentAttempt, and Resume', async () => {
      const resumeIndexes = await Resume.collection.indexes();
      assert.ok(
        resumeIndexes.some((idx) => idx.key.user === 1 && idx.key.createdAt === -1),
        'Resume must have compound index on { user: 1, createdAt: -1 }',
      );

      const attemptIndexes = await AssessmentAttempt.collection.indexes();
      assert.ok(
        attemptIndexes.some((idx) => idx.key.user === 1 && idx.key.createdAt === -1),
        'AssessmentAttempt must have compound index on { user: 1, createdAt: -1 }',
      );

      const sessionIndexes = await InterviewSession.collection.indexes();
      assert.ok(
        sessionIndexes.some((idx) => idx.key.user === 1 && idx.key.createdAt === -1),
        'InterviewSession must have compound index on { user: 1, createdAt: -1 }',
      );
    });
  });
});
