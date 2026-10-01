import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import {
  startTestServer,
  clearResumes,
  clearUsers,
  postJson,
  sendJsonWithToken,
  getWithToken,
} from './helpers/testServer.js';
import {
  normalizeSkills,
  normalizeDegree,
  normalizeBranch,
  normalizeCollegeName,
  normalizeProjectTechnologies,
  normalizeCareerPreferences,
  calculateProfileCompleteness,
  generateAuditDiff,
} from '../src/domain/profile/profileNormalizer.js';
import {
  reconcileProfileWithResume,
  assertAiMutationBoundary,
  RECONCILIATION_STATUS,
} from '../src/domain/profile/profileResumeReconciler.js';
import { updateProfile, getProfile } from '../src/services/profile.service.js';
import { createResume } from '../src/services/resume.service.js';
import { StudentProfile, Resume } from '../src/models/index.js';
import { PROVENANCE_TIER } from '../src/domain/student/canonicalStudent.js';

const PASSWORD = 'Password123!';

describe('Task 06 — Profile Intelligence, Normalization & Conflict Resolution Suite', () => {
  let server;
  let counter = 0;

  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.close();
  });

  beforeEach(async () => {
    await clearResumes();
    await clearUsers();
  });

  async function registerAndLogin(prefix = 'prof') {
    counter += 1;
    const email = `${prefix}.${Date.now()}.${counter}@example.com`;
    await postJson(server.baseUrl, '/api/auth/register', {
      name: 'Gaurav Profile',
      email,
      password: PASSWORD,
    });
    const loginRes = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password: PASSWORD,
    });
    return {
      userId: loginRes.body.data.user.id,
      token: loginRes.body.data.token,
      email,
    };
  }

  // -------------------------------------------------------------------------
  // 1. Normalization & Taxonomy Alignment
  // -------------------------------------------------------------------------
  describe('1. Normalization & Taxonomy Alignment', () => {
    it('normalizes skill names, deduplicates aliases, and preserves highest level', () => {
      const rawSkills = [
        { name: 'nodejs', level: 'beginner' },
        { name: 'Node.js', level: 'advanced' },
        { name: 'NODE JS', level: 'intermediate' },
        { name: 'reactjs', level: 'intermediate' },
        { name: 'Docker', level: 'expert' },
      ];

      const normalized = normalizeSkills(rawSkills);

      // Should collapse nodejs variants into a single canonical 'Node.js' with 'advanced' level
      const nodeSkill = normalized.find((s) => s.name === 'Node.js');
      assert.ok(nodeSkill, 'Node.js must exist');
      assert.equal(nodeSkill.level, 'advanced', 'Highest level rank must be preserved');
      assert.equal(nodeSkill.canonicalSkillId, 'sk_nodejs');
      assert.equal(nodeSkill.evidenceTier, 'claimed');

      const reactSkill = normalized.find((s) => s.name === 'React');
      assert.ok(reactSkill);
      assert.equal(reactSkill.canonicalSkillId, 'sk_react');

      assert.equal(normalized.length, 3, 'Duplicate aliases must be de-duplicated');
    });

    it('standardizes academic degrees, engineering branches, and college acronyms', () => {
      assert.equal(normalizeDegree('b.tech'), 'Bachelor of Technology');
      assert.equal(normalizeDegree('BTech'), 'Bachelor of Technology');
      assert.equal(normalizeDegree('m.tech'), 'Master of Technology');
      assert.equal(normalizeDegree('bca'), 'Bachelor of Computer Applications');
      assert.equal(normalizeDegree('Custom Diploma in AI'), 'Custom Diploma in AI');

      assert.equal(normalizeBranch('cse'), 'Computer Science & Engineering');
      assert.equal(normalizeBranch('computer science'), 'Computer Science & Engineering');
      assert.equal(normalizeBranch('it'), 'Information Technology');
      assert.equal(normalizeBranch('ece'), 'Electronics & Communication Engineering');

      assert.equal(normalizeCollegeName('nit bhopal'), 'NIT bhopal');
      assert.equal(normalizeCollegeName('iit bombay'), 'IIT bombay');
    });

    it('normalizes project technologies against canonical taxonomy and deduplicates', () => {
      const rawTechs = ['reactjs', 'React', 'nodejs', 'Docker', 'docker', 'custom-lib'];
      const normalized = normalizeProjectTechnologies(rawTechs);

      assert.deepEqual(normalized, ['React', 'Node.js', 'Docker', 'custom-lib']);
    });

    it('cleans and sanitizes career preferences and interests', () => {
      const rawCareer = {
        targetRole: '  Full Stack Developer   ',
        careerInterests: ['Frontend', 'frontend', ' Backend  ', ''],
      };

      const normalized = normalizeCareerPreferences(rawCareer);
      assert.equal(normalized.targetRole, 'Full Stack Developer');
      assert.deepEqual(normalized.careerInterests, ['Frontend', 'Backend']);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Profile Completeness & Freshness Calculation
  // -------------------------------------------------------------------------
  describe('2. Profile Completeness & Freshness', () => {
    it('evaluates profile completeness across sections and returns missing sections', () => {
      const incomplete = calculateProfileCompleteness({});
      assert.equal(incomplete.percentage, 0);
      assert.equal(incomplete.status, 'incomplete');
      assert.ok(incomplete.missingSections.includes('personal'));
      assert.ok(incomplete.missingSections.includes('academic'));

      const detailedProfile = {
        personal: { phone: '+91 98765 43210', city: 'Bhopal', state: 'MP' },
        academic: { collegeName: 'MANIT', degree: 'B.Tech', branch: 'CSE', graduationYear: 2025 },
        career: { targetRole: 'Backend Developer', careerInterests: ['Distributed Systems'] },
        skills: [{ name: 'Node.js', level: 'advanced' }, { name: 'MongoDB', level: 'intermediate' }, { name: 'Docker', level: 'beginner' }],
        projects: [{ title: 'Nexora' }],
        updatedAt: new Date(),
      };

      const complete = calculateProfileCompleteness(detailedProfile);
      assert.equal(complete.percentage, 100);
      assert.equal(complete.status, 'comprehensive');
      assert.equal(complete.missingSections.length, 0);
      assert.equal(complete.isStale, false);
    });

    it('detects staleness when profile has not been updated within 180 days', () => {
      const halfYearAgo = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
      const staleProfile = {
        personal: { phone: '+91 98765 43210' },
        updatedAt: halfYearAgo,
      };

      const result = calculateProfileCompleteness(staleProfile);
      assert.equal(result.isStale, true);
      assert.ok(result.daysSinceUpdate >= 199);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Precedence Invariants & AI Boundary Protection
  // -------------------------------------------------------------------------
  describe('3. Precedence Invariants & AI Boundary Protection', () => {
    it('blocks AI hints from directly mutating user-entered profile fields without confirmation', () => {
      const proposedMutation = {
        'academic.graduationYear': 2024,
        'career.targetRole': 'DevOps Engineer',
      };

      assert.throws(
        () => {
          assertAiMutationBoundary('ai_hint', {}, proposedMutation);
        },
        /AI hints cannot overwrite user-entered field/,
      );
    });

    it('permits authorized user-direct profile updates', () => {
      const proposedMutation = {
        'academic.graduationYear': 2025,
      };

      assert.doesNotThrow(() => {
        assertAiMutationBoundary(PROVENANCE_TIER.USER_ENTERED, {}, proposedMutation);
      });
    });
  });

  // -------------------------------------------------------------------------
  // 4. Cross-Artifact Profile & Resume Reconciliation
  // -------------------------------------------------------------------------
  describe('4. Cross-Artifact Profile & Resume Reconciliation', () => {
    it('detects graduation year, college, and degree discrepancies between profile and resume', () => {
      const profile = {
        academic: {
          collegeName: 'National Institute of Technology Bhopal',
          degree: 'Bachelor of Technology',
          graduationYear: 2026,
        },
        skills: [{ name: 'React', level: 'intermediate' }],
      };

      const mockResume = {
        parsed: {
          education: [
            {
              institution: 'Indian Institute of Technology Bombay',
              degree: 'Master of Science',
              endYear: 2025,
            },
          ],
          skills: [{ name: 'React' }, { name: 'Kubernetes' }],
        },
      };

      const reconciliation = reconcileProfileWithResume(profile, mockResume);

      assert.equal(reconciliation.reconciliationStatus, RECONCILIATION_STATUS.CONFLICTS_DETECTED);
      assert.equal(reconciliation.requiresConfirmation, true);

      const gradConflict = reconciliation.conflicts.find((c) => c.field === 'academic.graduationYear');
      assert.ok(gradConflict);
      assert.equal(gradConflict.profileValue, 2026);
      assert.equal(gradConflict.resumeValue, 2025);

      const collegeConflict = reconciliation.conflicts.find((c) => c.field === 'academic.collegeName');
      assert.ok(collegeConflict);

      const degreeConflict = reconciliation.conflicts.find((c) => c.field === 'academic.degree');
      assert.ok(degreeConflict);

      // Verify suggested sync items identifies missing skill 'Kubernetes'
      const skillSync = reconciliation.suggestedSyncItems.find((s) => s.name === 'Kubernetes');
      assert.ok(skillSync);
      assert.equal(skillSync.type, 'skill_missing_in_profile');
      assert.equal(skillSync.requiresConfirmation, true);
    });
  });

  // -------------------------------------------------------------------------
  // 5. End-to-End API, Audit Trail & Versioning Integration
  // -------------------------------------------------------------------------
  describe('5. End-to-End API, Audit Trail & Versioning Integration', () => {
    it('increments version and appends auditTrail on updates, and exposes reconcile endpoint', async () => {
      const { userId, token } = await registerAndLogin('audit.user');

      // 1. Initial save
      const res1 = await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          personal: { city: 'Bhopal' },
          academic: { collegeName: 'NIT Bhopal', graduationYear: 2026, degree: 'B.Tech' },
          skills: [{ name: 'React', level: 'intermediate' }],
        },
      });
      assert.equal(res1.status, 200);
      assert.equal(res1.body.data.profile.version, 1);
      assert.ok(res1.body.data.profile.completeness.percentage > 0);

      // 2. Second update
      const res2 = await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          personal: { city: 'Indore' },
        },
      });
      assert.equal(res2.status, 200);
      assert.equal(res2.body.data.profile.version, 2);

      // Verify auditTrail stored on MongoDB document
      const stored = await StudentProfile.findOne({ user: userId });
      assert.ok(stored.auditTrail.length > 0);
      const cityAudit = stored.auditTrail.findLast((a) => a.field === 'personal.city');
      assert.ok(cityAudit);
      assert.equal(cityAudit.previousValue, 'Bhopal');
      assert.equal(cityAudit.newValue, 'Indore');

      // 3. Upload resume to trigger reconciliation
      await createResume(userId, {
        text: 'Education: IIT Delhi, 2025. Skills: React, Docker.',
        label: 'My Resume',
      });
      // Attach parsed data to the resume
      await Resume.updateOne(
        { user: userId },
        {
          $set: {
            parsed: {
              education: [{ institution: 'IIT Delhi', endYear: 2025 }],
              skills: [{ name: 'React' }, { name: 'Docker' }],
            },
          },
        },
      );

      // 4. Test GET /api/profile/reconcile
      const reconcileRes = await getWithToken(server.baseUrl, '/api/profile/reconcile', token);
      assert.equal(reconcileRes.status, 200);
      assert.ok(reconcileRes.body.data.conflicts.length > 0);
      assert.equal(reconcileRes.body.data.reconciliationStatus, RECONCILIATION_STATUS.CONFLICTS_DETECTED);

      // 5. Test POST /api/profile/confirm-field
      const confirmRes = await sendJsonWithToken(server.baseUrl, '/api/profile/confirm-field', {
        method: 'POST',
        token,
        payload: {
          field: 'academic.graduationYear',
          value: 2025,
          source: 'user_confirmed',
        },
      });
      assert.equal(confirmRes.status, 200);
      assert.equal(confirmRes.body.data.profile.academic.graduationYear, 2025);
      assert.equal(confirmRes.body.data.profile.version, 3);
    });
  });
});
