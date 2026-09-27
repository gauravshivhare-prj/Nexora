import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import mongoose from 'mongoose';

import {
  Assessment,
  AssessmentAttempt,
  CareerTwin,
  InterviewSession,
  Resume,
  SkillEvidenceCheck,
  StudentProfile,
  User,
  ensureModelIndexes,
} from '../src/models/index.js';
import { startTestServer } from './helpers/testServer.js';

let server;

describe('G05 — Mongo Indexes & Query Audit Suite', () => {
  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.close();
  });

  it('successfully initializes all registered model indexes via ensureModelIndexes()', async () => {
    await ensureModelIndexes();
    assert.ok(true, 'ensureModelIndexes succeeded');
  });

  it('verifies Resume collection compound indexes cover listing and careerTwin queries', async () => {
    const indexes = await Resume.collection.indexes();
    const indexNames = indexes.map((idx) => Object.keys(idx.key).join('_'));

    // Check user_1_createdAt_-1
    const hasUserCreatedAt = indexes.some(
      (idx) => idx.key.user === 1 && idx.key.createdAt === -1,
    );
    assert.ok(hasUserCreatedAt, 'Resume must have compound index on { user: 1, createdAt: -1 }');

    // Check user_1_analysis.status_1_createdAt_-1
    const hasUserAnalysisStatus = indexes.some(
      (idx) => idx.key.user === 1 && idx.key['analysis.status'] === 1 && idx.key.createdAt === -1,
    );
    assert.ok(
      hasUserAnalysisStatus,
      'Resume must have compound index on { user: 1, "analysis.status": 1, createdAt: -1 }',
    );
  });

  it('verifies AssessmentAttempt collection indexes for attempt deduplication and latest query', async () => {
    const indexes = await AssessmentAttempt.collection.indexes();

    const uniqueAttemptIndex = indexes.find(
      (idx) =>
        idx.key.user === 1 &&
        idx.key.assessmentId === 1 &&
        idx.key.attemptNumber === 1 &&
        idx.unique === true,
    );
    assert.ok(
      uniqueAttemptIndex,
      'AssessmentAttempt must have unique index on { user: 1, assessmentId: 1, attemptNumber: 1 }',
    );

    const hasStatusAttemptIndex = indexes.some(
      (idx) =>
        idx.key.user === 1 &&
        idx.key.assessmentId === 1 &&
        idx.key.status === 1 &&
        idx.key.attemptNumber === -1,
    );
    assert.ok(
      hasStatusAttemptIndex,
      'AssessmentAttempt must have index covering latest result query { user: 1, assessmentId: 1, status: 1, attemptNumber: -1 }',
    );
  });

  it('verifies InterviewSession collection indexes for user sessions and lifecycle cleanup', async () => {
    const indexes = await InterviewSession.collection.indexes();

    const hasUserCreatedAt = indexes.some(
      (idx) => idx.key.user === 1 && idx.key.createdAt === -1,
    );
    assert.ok(hasUserCreatedAt, 'InterviewSession must have index on { user: 1, createdAt: -1 }');

    const hasUserStatus = indexes.some(
      (idx) => idx.key.user === 1 && idx.key.status === 1,
    );
    assert.ok(hasUserStatus, 'InterviewSession must have index on { user: 1, status: 1 }');

    const hasStatusExpiresAt = indexes.some(
      (idx) => idx.key.status === 1 && idx.key.expiresAt === 1,
    );
    assert.ok(hasStatusExpiresAt, 'InterviewSession must have index on { status: 1, expiresAt: 1 }');
  });

  it('verifies SkillEvidenceCheck collection indexes for user and verification eligibility', async () => {
    const indexes = await SkillEvidenceCheck.collection.indexes();

    const hasUserCompletedAt = indexes.some(
      (idx) => idx.key.user === 1 && idx.key.completedAt === -1,
    );
    assert.ok(hasUserCompletedAt, 'SkillEvidenceCheck must have index on { user: 1, completedAt: -1 }');

    const hasEligibleIndex = indexes.some(
      (idx) => idx.key.user === 1 && idx.key.eligibleForVerified === 1 && idx.key.completedAt === -1,
    );
    assert.ok(
      hasEligibleIndex,
      'SkillEvidenceCheck must have index on { user: 1, eligibleForVerified: 1, completedAt: -1 }',
    );
  });

  it('verifies unique user constraints on single-document profiles and career twins', async () => {
    const profileIndexes = await StudentProfile.collection.indexes();
    const twinIndexes = await CareerTwin.collection.indexes();
    const userIndexes = await User.collection.indexes();

    const profileUserUnique = profileIndexes.find((idx) => idx.key.user === 1 && idx.unique === true);
    assert.ok(profileUserUnique, 'StudentProfile must enforce unique user index');

    const twinUserUnique = twinIndexes.find((idx) => idx.key.user === 1 && idx.unique === true);
    assert.ok(twinUserUnique, 'CareerTwin must enforce unique user index');

    const userEmailUnique = userIndexes.find((idx) => idx.key.email === 1 && idx.unique === true);
    assert.ok(userEmailUnique, 'User must enforce unique email index');
  });
});
