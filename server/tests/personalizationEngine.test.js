import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { ERROR_CODES } from '../src/constants/errorCodes.js';
import { LEARNING_STYLES, PREFERRED_DIFFICULTIES } from '../src/constants/profilePolicy.js';
import { suggestInterviewDifficulty } from '../src/domain/interview/suggestInterviewDifficulty.js';
import { prioritizeDashboardSections } from '../src/domain/student/personalizeDashboardOrder.js';
import { buildRoadmap } from '../src/domain/roadmap/buildRoadmap.js';
import { resourcesFor } from '../src/domain/roadmap/resourceReferences.js';
import { findRole } from '../src/domain/careers/roleCatalogue.js';
import { computeSkillGap } from '../src/domain/skillGap/computeSkillGap.js';
import {
  clearCareerTwins,
  clearInterviewSessions,
  clearProfiles,
  clearUsers,
  getWithToken,
  postJson,
  resetRateLimiters,
  sendJsonWithToken,
  startTestServer,
} from './helpers/testServer.js';
import { fakePassword } from './helpers/fakeSecrets.js';

describe('TASK 29 — Personalization Engine Across the Entire Product', () => {
  let server;

  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.close();
  });

  beforeEach(async () => {
    resetRateLimiters();
    await clearInterviewSessions();
    await clearCareerTwins();
    await clearProfiles();
    await clearUsers();
  });

  async function registerAndLogin(email = 'personalized.student@example.com') {
    const password = fakePassword();
    await postJson(server.baseUrl, '/api/auth/register', {
      name: 'Personalized Student',
      email,
      password,
    });
    const { body } = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password,
    });
    return body.data.token;
  }

  // =========================================================================
  // Phase 1: Preferences Model & Validation
  // =========================================================================

  describe('Phase 1 — Preferences Model, Defaults & Validation in StudentProfile', () => {
    it('returns default preferences for a newly registered student', async () => {
      const token = await registerAndLogin('defaults@example.com');
      const { status, body } = await getWithToken(server.baseUrl, '/api/profile', token);

      assert.equal(status, 200);
      assert.equal(body.success, true);
      const prefs = body.data.profile.preferences;
      assert.ok(prefs, 'preferences object should be present');
      assert.equal(prefs.learningStyle, 'mixed');
      assert.equal(prefs.availableHoursPerWeek, 15);
      assert.deepEqual(prefs.priorityGoals, []);
      assert.equal(prefs.preferredDifficulty, 'intermediate');
    });

    it('persists and updates preferences via PATCH /api/profile', async () => {
      const token = await registerAndLogin('updater@example.com');
      const updatePayload = {
        preferences: {
          learningStyle: 'hands_on',
          availableHoursPerWeek: 25,
          priorityGoals: ['interview_prep', 'backend_systems'],
          preferredDifficulty: 'advanced',
        },
      };

      const { status, body } = await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: updatePayload,
      });

      assert.equal(status, 200);
      const savedPrefs = body.data.profile.preferences;
      assert.equal(savedPrefs.learningStyle, 'hands_on');
      assert.equal(savedPrefs.availableHoursPerWeek, 25);
      assert.deepEqual(savedPrefs.priorityGoals, ['interview_prep', 'backend_systems']);
      assert.equal(savedPrefs.preferredDifficulty, 'advanced');

      // Verify read-back persistence
      const { body: readBack } = await getWithToken(server.baseUrl, '/api/profile', token);
      assert.deepEqual(readBack.data.profile.preferences, savedPrefs);
    });

    it('rejects invalid preference values with 400 VALIDATION_ERROR', async () => {
      const token = await registerAndLogin('invalid@example.com');

      // Invalid learning style
      const res1 = await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: { preferences: { learningStyle: 'osmosis' } },
      });
      assert.equal(res1.status, 400);
      assert.equal(res1.body.errorCode, ERROR_CODES.VALIDATION_ERROR);

      // Excessive hours per week (> 80)
      const res2 = await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: { preferences: { availableHoursPerWeek: 120 } },
      });
      assert.equal(res2.status, 400);
      assert.equal(res2.body.errorCode, ERROR_CODES.VALIDATION_ERROR);

      // Invalid difficulty
      const res3 = await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: { preferences: { preferredDifficulty: 'impossible' } },
      });
      assert.equal(res3.status, 400);
      assert.equal(res3.body.errorCode, ERROR_CODES.VALIDATION_ERROR);
    });

    it('preserves preferences across unrelated partial profile saves', async () => {
      const token = await registerAndLogin('mergeprefs@example.com');

      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          personal: { city: 'Bhopal' },
          preferences: { learningStyle: 'reading', availableHoursPerWeek: 10 },
        },
      });

      // Update personal state only
      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: { personal: { state: 'Madhya Pradesh' } },
      });

      const { body } = await getWithToken(server.baseUrl, '/api/profile', token);
      assert.equal(body.data.profile.personal.city, 'Bhopal');
      assert.equal(body.data.profile.personal.state, 'Madhya Pradesh');
      assert.equal(body.data.profile.preferences.learningStyle, 'reading');
      assert.equal(body.data.profile.preferences.availableHoursPerWeek, 10);
    });
  });

  // =========================================================================
  // Phase 2: Preference-Aware Roadmap Engine
  // =========================================================================

  describe('Phase 2 — Preference-Aware Roadmap Pacing & Resource Ordering', () => {
    it('orders resources by learningStyle affinity in resourcesFor', () => {
      const handsOn = resourcesFor('Docker', { learningStyle: 'hands_on' });
      assert.equal(handsOn[0].type, 'practice_project');
      assert.equal(handsOn[0].learningStyleAffinity, 'hands_on');

      const reading = resourcesFor('Docker', { learningStyle: 'reading' });
      assert.equal(reading[0].type, 'documentation');
      assert.equal(reading[0].learningStyleAffinity, 'reading');

      const visual = resourcesFor('Docker', { learningStyle: 'visual' });
      assert.equal(visual[0].type, 'course');
      assert.equal(visual[0].learningStyleAffinity, 'visual');

      const mixed = resourcesFor('Docker', { learningStyle: 'mixed' });
      assert.equal(mixed[0].type, 'documentation');
    });

    it('buildRoadmap includes learningStyle in method.personalization and respects forbidden words', () => {
      const role = findRole('backend-developer');
      const gap = computeSkillGap({ skills: [], targetRoles: [] }, role);

      const roadmap = buildRoadmap(gap, {
        maxItems: 5,
        availableHoursPerWeek: 20,
        studentGoals: ['docker', 'kubernetes'],
        learningStyle: 'hands_on',
      });

      assert.equal(roadmap.method.personalization.learningStyle, 'hands_on');
      assert.equal(roadmap.method.personalization.weeklyPace, 20);
      assert.deepEqual(roadmap.method.personalization.studentGoals, ['docker', 'kubernetes']);

      // First resource of items should be practice project due to hands_on
      if (roadmap.items.length > 0) {
        assert.equal(roadmap.items[0].resources[0].type, 'practice_project');
      }

      // Strict check: No forbidden words in serialized output
      const serialised = JSON.stringify(roadmap).toLowerCase();
      for (const forbidden of ['hours', 'weeks to', 'days to complete', 'minutes']) {
        assert.ok(!serialised.includes(forbidden), `Forbidden word "${forbidden}" found in roadmap output`);
      }
    });

    it('getRoadmap API falls back to student preferences when query params are absent', async () => {
      const token = await registerAndLogin('roadmap_prefs@example.com');

      // Save preferences in profile
      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          personal: { city: 'Bengaluru' },
          skills: [{ name: 'JavaScript', level: 'beginner' }],
          preferences: {
            learningStyle: 'reading',
            availableHoursPerWeek: 30,
            priorityGoals: ['distributed_systems'],
          },
        },
      });

      // Build CareerTwin
      await sendJsonWithToken(server.baseUrl, '/api/career-twin', {
        method: 'POST',
        token,
        payload: {},
      });

      // Call roadmap API without availableHoursPerWeek or studentGoals query params
      const { status, body } = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/roadmap',
        token,
      );

      assert.equal(status, 200);
      assert.equal(body.data.roadmap.method.personalization.weeklyPace, 30);
      assert.deepEqual(body.data.roadmap.method.personalization.studentGoals, ['distributed_systems']);
      assert.equal(body.data.roadmap.method.personalization.learningStyle, 'reading');
    });
  });

  // =========================================================================
  // Phase 3: Interview Starting Difficulty Suggestion Engine
  // =========================================================================

  describe('Phase 3 — Interview Difficulty Suggestion based on CareerTwin Evidence', () => {
    it('suggests beginner difficulty when twin has no verified or supported evidence', () => {
      const twin = {
        skills: [{ name: 'Node.js', key: 'nodejs', strength: 'claimed' }],
      };
      const result = suggestInterviewDifficulty({
        targetSkills: ['Node.js', 'Express.js'],
        twin,
        preferredDifficulty: null,
      });

      assert.equal(result.suggestedDifficulty, 'beginner');
      assert.equal(result.recommendedDifficulty, 'beginner');
      assert.ok(result.rationale.includes('beginner'));
    });

    it('suggests intermediate difficulty when twin has supported evidence', () => {
      const twin = {
        skills: [
          { name: 'Node.js', key: 'nodejs', strength: 'supported' },
          { name: 'Express.js', key: 'expressjs', strength: 'supported' },
        ],
      };
      const result = suggestInterviewDifficulty({
        targetSkills: ['Node.js', 'Express.js'],
        twin,
        preferredDifficulty: null,
      });

      assert.equal(result.suggestedDifficulty, 'intermediate');
      assert.equal(result.recommendedDifficulty, 'intermediate');
    });

    it('suggests advanced difficulty when twin has verified evidence', () => {
      const twin = {
        skills: [
          { name: 'Node.js', key: 'nodejs', strength: 'verified' },
          { name: 'Express.js', key: 'expressjs', strength: 'verified' },
        ],
      };
      const result = suggestInterviewDifficulty({
        targetSkills: ['Node.js', 'Express.js'],
        twin,
        preferredDifficulty: null,
      });

      assert.equal(result.suggestedDifficulty, 'advanced');
      assert.equal(result.recommendedDifficulty, 'advanced');
    });

    it('reconciles extreme gap between student preference and twin evidence with an intermediate step', () => {
      // Student wants advanced, but has only missing/claimed skills
      const twin = { skills: [] };
      const result = suggestInterviewDifficulty({
        targetSkills: ['Node.js'],
        twin,
        preferredDifficulty: 'advanced',
      });

      assert.equal(result.suggestedDifficulty, 'intermediate');
      assert.equal(result.recommendedDifficulty, 'beginner');
      assert.ok(result.rationale.includes('intermediate provides a progressive challenge'));
    });

    it('GET /api/interviews/suggest-difficulty returns structured suggestion', async () => {
      const token = await registerAndLogin('diff_api@example.com');

      const { status, body } = await getWithToken(
        server.baseUrl,
        '/api/interviews/suggest-difficulty?skills=Node.js,MongoDB',
        token,
      );

      assert.equal(status, 200);
      assert.equal(body.success, true);
      assert.ok(body.data.suggestedDifficulty);
      assert.ok(body.data.rationale);
      assert.ok(Array.isArray(body.data.skillBreakdown));
    });

    it('POST /api/interviews/sessions auto-resolves difficulty when omitted or set to auto', async () => {
      const token = await registerAndLogin('auto_diff@example.com');

      const { status, body } = await sendJsonWithToken(server.baseUrl, '/api/interviews/sessions', {
        method: 'POST',
        token,
        payload: {
          targetRole: 'backend-developer',
          targetSkills: ['Node.js'],
          difficulty: 'auto',
          questionCount: 3,
        },
      });

      assert.equal(status, 201);
      assert.ok(['beginner', 'intermediate', 'advanced'].includes(body.data.session.difficulty));
    });
  });

  // =========================================================================
  // Phase 4: Dashboard Section Prioritization
  // =========================================================================

  describe('Phase 4 — Dashboard Personalization & Section Ordering', () => {
    it('prioritizes profile when student profile has no skills or projects', () => {
      const summary = {
        profile: { exists: true, skillCount: 0, projectCount: 0 },
        careerTwin: { exists: false },
      };
      const result = prioritizeDashboardSections(summary, {});
      assert.equal(result.primaryFocus, 'profile');
      assert.equal(result.orderedSections[0], 'profile');
      assert.equal(result.prioritizedBy, 'pipeline_blocker');
    });

    it('prioritizes careerTwin when twin is missing or stale', () => {
      const summary = {
        profile: { exists: true, skillCount: 3, projectCount: 1 },
        careerTwin: { exists: true, isStale: true },
      };
      const result = prioritizeDashboardSections(summary, {});
      assert.equal(result.primaryFocus, 'careerTwin');
      assert.equal(result.orderedSections[0], 'careerTwin');
      assert.equal(result.prioritizedBy, 'staleness_refresh');
    });

    it('prioritizes interviews when student has interview_prep in priorityGoals', () => {
      const summary = {
        profile: { exists: true, skillCount: 4, projectCount: 2 },
        careerTwin: { exists: true, isStale: false },
      };
      const prefs = { priorityGoals: ['mock_interview_prep', 'backend'] };
      const result = prioritizeDashboardSections(summary, prefs);
      assert.equal(result.primaryFocus, 'interviews');
      assert.equal(result.orderedSections[0], 'interviews');
      assert.equal(result.prioritizedBy, 'student_priority_goals');
    });

    it('prioritizes assessments when student has assessment goals', () => {
      const summary = {
        profile: { exists: true, skillCount: 4, projectCount: 2 },
        careerTwin: { exists: true, isStale: false },
      };
      const prefs = { priorityGoals: ['skill_assessment', 'certification'] };
      const result = prioritizeDashboardSections(summary, prefs);
      assert.equal(result.primaryFocus, 'assessments');
      assert.equal(result.orderedSections[0], 'assessments');
    });

    it('prioritizes opportunities when student has job placement goals', () => {
      const summary = {
        profile: { exists: true, skillCount: 4, projectCount: 2 },
        careerTwin: { exists: true, isStale: false },
      };
      const prefs = { priorityGoals: ['summer_internship', 'entry_job'] };
      const result = prioritizeDashboardSections(summary, prefs);
      assert.equal(result.primaryFocus, 'opportunities');
      assert.equal(result.orderedSections[0], 'opportunities');
    });

    it('GET /api/summary returns sectionPriority and respects forbidden words invariant', async () => {
      const token = await registerAndLogin('summary_prio@example.com');

      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          skills: [{ name: 'Node.js', level: 'intermediate' }],
          projects: [{ title: 'Nexora Core', technologies: ['Node.js'] }],
          preferences: { priorityGoals: ['interview_prep'] },
        },
      });

      await sendJsonWithToken(server.baseUrl, '/api/career-twin', {
        method: 'POST',
        token,
        payload: {},
      });

      const { status, body } = await getWithToken(server.baseUrl, '/api/summary', token);

      assert.equal(status, 200);
      assert.ok(body.data.sectionPriority, 'sectionPriority should be in summary');
      assert.equal(body.data.sectionPriority.primaryFocus, 'interviews');
      assert.ok(Array.isArray(body.data.sectionPriority.orderedSections));
      assert.ok(body.data.preferences);
      assert.deepEqual(body.data.preferences.priorityGoals, ['interview_prep']);

      // Crucial invariant check: no forbidden words in summary serialized output
      const serialised = JSON.stringify(body.data).toLowerCase();
      for (const forbidden of ['readiness', 'completionpercent', 'percentcomplete', 'overallscore']) {
        assert.ok(!serialised.includes(forbidden), `Forbidden word "${forbidden}" leaked into summary`);
      }
    });
  });
});
