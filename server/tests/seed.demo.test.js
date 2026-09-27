import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
  Assessment,
  AssessmentAttempt,
  CareerTwin,
  SkillEvidenceCheck,
  StudentProfile,
  User,
  ensureModelIndexes,
} from '../src/models/index.js';
import { DEMO_EMAILS, DEMO_USERS, seedDemo } from '../src/scripts/seedDemo.js';
import { getWithToken, sendJsonWithToken, startTestServer } from './helpers/testServer.js';

describe('G27 — Safe Demo/Seed Strategy Test Suite', () => {
  let server;
  let nonDemoUser;

  before(async () => {
    server = await startTestServer();
    await ensureModelIndexes();

    // Create a real/non-demo user to verify safety and non-destructive properties
    const res = await fetch(`${server.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Real Production User',
        email: `real.user.${Date.now()}@example.com`,
        password: 'RealPassword123!Safe',
      }),
    });
    const body = await res.json();
    nonDemoUser = body.data.user;
  });

  after(async () => {
    await server.close();
  });

  describe('1. Production Safeguards', () => {
    it('blocks execution in production environment without explicit allowProduction flag', async () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';

        await assert.rejects(
          async () => {
            await seedDemo({ allowProduction: false, silent: true });
          },
          {
            name: 'Error',
            message: /Production seeding is blocked/,
          },
        );
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('permits execution in production when allowProduction is explicitly granted', async () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        const result = await seedDemo({ allowProduction: true, silent: true });
        assert.ok(result.studentUser);
        assert.ok(result.adminUser);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  describe('2. Non-Destructive Protection for Real Users', () => {
    it('never removes or modifies non-demo user data during seed or force reset', async () => {
      // Run seed with forceReset: true
      await seedDemo({ forceReset: true, silent: true });

      // Verify non-demo user still exists untouched in DB
      const foundNonDemoUser = await User.findById(nonDemoUser.id);
      assert.ok(foundNonDemoUser, 'Non-demo user must NOT be deleted by demo seed reset');
      assert.equal(foundNonDemoUser.email, nonDemoUser.email);
    });
  });

  describe('3. Evaluator Credentials and Profile Verification', () => {
    it('authenticates demo student with documented credentials and provides rich profile', async () => {
      const loginRes = await fetch(`${server.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: DEMO_USERS.STUDENT.email,
          password: DEMO_USERS.STUDENT.password,
        }),
      });

      assert.equal(loginRes.status, 200);
      const loginBody = await loginRes.json();
      assert.equal(loginBody.success, true);
      assert.equal(loginBody.data.user.email, DEMO_USERS.STUDENT.email);
      assert.equal(loginBody.data.user.role, 'student');

      const token = loginBody.data.token;

      // Verify student profile API responds with populated profile
      const { status: profStatus, body: profBody } = await getWithToken(
        server.baseUrl,
        '/api/profile',
        token,
      );
      assert.equal(profStatus, 200);
      assert.equal(profBody.success, true);
      assert.equal(profBody.data.profile.academic.collegeName, 'National Institute of Technology');
      assert.equal(profBody.data.profile.career.targetRole, 'Backend Developer');
      assert.ok(profBody.data.profile.skills.length >= 5);
    });

    it('authenticates demo admin with documented credentials and admin role', async () => {
      const loginRes = await fetch(`${server.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: DEMO_USERS.ADMIN.email,
          password: DEMO_USERS.ADMIN.password,
        }),
      });

      assert.equal(loginRes.status, 200);
      const loginBody = await loginRes.json();
      assert.equal(loginBody.success, true);
      assert.equal(loginBody.data.user.email, DEMO_USERS.ADMIN.email);
      assert.equal(loginBody.data.user.role, 'admin');
    });

    it('pre-populates verified evidence, assessment attempt, and career twin for demo student', async () => {
      const studentUser = await User.findOne({ email: DEMO_USERS.STUDENT.email });
      assert.ok(studentUser);

      // Verify assessment attempt exists and is evaluated
      const attempt = await AssessmentAttempt.findOne({ user: studentUser._id });
      assert.ok(attempt);
      assert.equal(attempt.status, 'evaluated');
      assert.equal(attempt.passed, true);

      // Verify verified skill evidence check
      const evidence = await SkillEvidenceCheck.findOne({
        user: studentUser._id,
        eligibleForVerified: true,
      });
      assert.ok(evidence);
      assert.equal(evidence.skillName, 'Node.js');
      assert.equal(evidence.outcome, 'pass');

      // Verify CareerTwin exists
      const twin = await CareerTwin.findOne({ user: studentUser._id });
      assert.ok(twin);
      assert.ok(twin.skills.length > 0);
    });
  });

  describe('4. Idempotency and Re-seed Consistency', () => {
    it('executes multiple successive seed operations without duplicating records or failing', async () => {
      // First seed
      await seedDemo({ silent: true });

      const studentCountAfterFirst = await User.countDocuments({ email: DEMO_USERS.STUDENT.email });
      const adminCountAfterFirst = await User.countDocuments({ email: DEMO_USERS.ADMIN.email });
      assert.equal(studentCountAfterFirst, 1);
      assert.equal(adminCountAfterFirst, 1);

      // Second seed (idempotency check)
      await seedDemo({ silent: true });

      const studentCountAfterSecond = await User.countDocuments({ email: DEMO_USERS.STUDENT.email });
      const adminCountAfterSecond = await User.countDocuments({ email: DEMO_USERS.ADMIN.email });
      assert.equal(studentCountAfterSecond, 1);
      assert.equal(adminCountAfterSecond, 1);

      // Third seed with cleanDemo
      await seedDemo({ cleanDemo: true, silent: true });

      const studentCountAfterThird = await User.countDocuments({ email: DEMO_USERS.STUDENT.email });
      const adminCountAfterThird = await User.countDocuments({ email: DEMO_USERS.ADMIN.email });
      assert.equal(studentCountAfterThird, 1);
      assert.equal(adminCountAfterThird, 1);
    });
  });
});
