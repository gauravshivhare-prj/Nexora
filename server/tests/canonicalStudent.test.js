import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CANONICAL_MODEL_VERSION,
  PROVENANCE_TIER,
  PROVENANCE_WEIGHT,
  assembleCanonicalStudentState,
  shouldIncomingFactSupersede,
} from '../src/domain/student/canonicalStudent.js';
import { EVIDENCE_STRENGTH } from '../src/domain/evidence/evidence.js';

describe('Task 02: Canonical Student Data Model & Source-of-Truth Suite', () => {
  const mockUser = {
    _id: '507f1f77bcf86cd799439011',
    name: 'Gaurav Student',
    email: 'gaurav@nexora.test',
    role: 'student',
    createdAt: new Date('2026-01-01'),
  };

  describe('1. Provenance Precedence and Conflict Resolution Rules', () => {
    it('ranks EXTERNALLY_VERIFIED above all other tiers', () => {
      const claimedFact = {
        provenanceTier: PROVENANCE_TIER.USER_ENTERED,
        strength: EVIDENCE_STRENGTH.CLAIMED,
        timestamp: '2026-03-01T10:00:00Z',
      };
      const verifiedFact = {
        provenanceTier: PROVENANCE_TIER.EXTERNALLY_VERIFIED,
        strength: EVIDENCE_STRENGTH.VERIFIED,
        timestamp: '2026-02-01T10:00:00Z', // older timestamp
      };

      assert.equal(
        shouldIncomingFactSupersede(claimedFact, verifiedFact),
        true,
        'Verified fact must supersede user claimed fact regardless of older timestamp',
      );

      assert.equal(
        shouldIncomingFactSupersede(verifiedFact, claimedFact),
        false,
        'Claimed fact can never supersede verified fact',
      );
    });

    it('enforces non-downgrade of evidence strength within the same tier', () => {
      const supportedFact = {
        provenanceTier: PROVENANCE_TIER.SYSTEM_DERIVED,
        strength: EVIDENCE_STRENGTH.SUPPORTED,
        timestamp: '2026-03-01T10:00:00Z',
      };
      const weakerFact = {
        provenanceTier: PROVENANCE_TIER.SYSTEM_DERIVED,
        strength: EVIDENCE_STRENGTH.CLAIMED,
        timestamp: '2026-03-02T10:00:00Z', // newer timestamp
      };

      assert.equal(
        shouldIncomingFactSupersede(supportedFact, weakerFact),
        false,
        'Weaker fact must not supersede stronger fact in same tier',
      );
    });

    it('uses latest timestamp when tier and strength are identical', () => {
      const olderFact = {
        provenanceTier: PROVENANCE_TIER.USER_ENTERED,
        strength: EVIDENCE_STRENGTH.CLAIMED,
        timestamp: '2026-01-01T00:00:00Z',
      };
      const newerFact = {
        provenanceTier: PROVENANCE_TIER.USER_ENTERED,
        strength: EVIDENCE_STRENGTH.CLAIMED,
        timestamp: '2026-02-01T00:00:00Z',
      };

      assert.equal(shouldIncomingFactSupersede(olderFact, newerFact), true);
      assert.equal(shouldIncomingFactSupersede(newerFact, olderFact), false);
    });
  });

  describe('2. Canonical State Assembly from Profile and Resume', () => {
    it('correctly assembles student state from profile alone', () => {
      const profile = {
        _id: 'prof_001',
        academic: { collegeName: 'Apex Institute', degree: 'B.Tech', cgpa: 8.5 },
        skills: [
          { name: 'JavaScript', level: 'intermediate' },
          { name: 'React', level: 'beginner' },
        ],
        projects: [
          {
            title: 'Nexora Core',
            description: 'AI career platform',
            technologies: ['React', 'Node.js'],
          },
        ],
        updatedAt: new Date('2026-03-01T12:00:00Z'),
      };

      const canonical = assembleCanonicalStudentState({ user: mockUser, profile });

      assert.equal(canonical.version, CANONICAL_MODEL_VERSION);
      assert.equal(canonical.studentId, mockUser._id);
      assert.equal(canonical.academic.collegeName, 'Apex Institute');
      assert.equal(canonical.academic.cgpa, 8.5);

      // React is used in project -> promoted to SUPPORTED
      const reactSkill = canonical.skills.find((s) => s.key === 'react');
      assert.ok(reactSkill);
      assert.equal(reactSkill.strength, EVIDENCE_STRENGTH.SUPPORTED);
      assert.equal(reactSkill.selfDeclaredLevel, 'beginner');
      assert.ok(reactSkill.sources.includes('profile'));
      assert.ok(reactSkill.sources.includes('project'));

      // JavaScript not in project -> stays CLAIMED
      const jsSkill = canonical.skills.find((s) => s.key === 'javascript');
      assert.ok(jsSkill);
      assert.equal(jsSkill.strength, EVIDENCE_STRENGTH.CLAIMED);

      // Node.js was only in project -> created as SUPPORTED
      const nodeSkill = canonical.skills.find((s) => s.key === 'nodejs');
      assert.ok(nodeSkill);
      assert.equal(nodeSkill.strength, EVIDENCE_STRENGTH.SUPPORTED);
      assert.equal(nodeSkill.selfDeclaredLevel, null);
    });

    it('merges resume grounded facts without overwriting verified profile facts', () => {
      const profile = {
        _id: 'prof_002',
        skills: [{ name: 'Python', level: 'beginner' }],
        updatedAt: new Date('2026-03-01T12:00:00Z'),
      };

      const resumes = [
        {
          _id: 'res_001',
          fileName: 'Resume_2026.pdf',
          status: 'completed',
          analysis: {
            analyzedAt: new Date('2026-03-02T12:00:00Z'),
            parsed: {
              skills: ['Python', 'Docker'],
              projects: [{ title: 'Docker Orchestration', technologies: ['Docker'] }],
            },
          },
        },
      ];

      const canonical = assembleCanonicalStudentState({ user: mockUser, profile, resumes });

      const pythonSkill = canonical.skills.find((s) => s.key === 'python');
      assert.ok(pythonSkill);
      assert.ok(pythonSkill.sources.includes('profile'));
      assert.ok(pythonSkill.sources.includes('resume'));
      assert.equal(pythonSkill.selfDeclaredLevel, 'beginner');

      const dockerSkill = canonical.skills.find((s) => s.key === 'docker');
      assert.ok(dockerSkill);
      assert.equal(dockerSkill.provenanceTier, PROVENANCE_TIER.AI_EXTRACTED);
      assert.ok(dockerSkill.sources.includes('resume'));
    });
  });

  describe('3. Institutional Verification and Non-Downgrade Invariants', () => {
    it('promotes skill to EXTERNALLY_VERIFIED upon passing institutional check', () => {
      const profile = {
        _id: 'prof_003',
        skills: [{ name: 'TypeScript', level: 'beginner' }],
      };

      const evidenceChecks = [
        {
          _id: 'chk_ts_001',
          skill: 'TypeScript',
          sourceType: 'assessment',
          score: 0.92,
          passed: true,
          eligibleForVerified: true,
          createdAt: new Date('2026-03-10'),
        },
      ];

      const canonical = assembleCanonicalStudentState({
        user: mockUser,
        profile,
        evidenceChecks,
      });

      const tsSkill = canonical.skills.find((s) => s.key === 'typescript');
      assert.ok(tsSkill);
      assert.equal(tsSkill.strength, EVIDENCE_STRENGTH.VERIFIED);
      assert.equal(tsSkill.provenanceTier, PROVENANCE_TIER.EXTERNALLY_VERIFIED);
      assert.equal(tsSkill.selfDeclaredLevel, 'beginner');
      assert.ok(tsSkill.sources.includes('assessment'));
    });

    it('ignores ineligible or failed evidence checks from elevating skill to verified', () => {
      const profile = {
        _id: 'prof_004',
        skills: [{ name: 'MongoDB', level: 'beginner' }],
      };

      const evidenceChecks = [
        {
          _id: 'chk_mongo_fail',
          skill: 'MongoDB',
          sourceType: 'assessment',
          score: 0.45,
          passed: false,
          eligibleForVerified: false,
        },
        {
          _id: 'chk_mongo_ai_only',
          skill: 'MongoDB',
          sourceType: 'interview',
          score: 0.95,
          passed: true,
          eligibleForVerified: false, // AI evaluation cannot verify
        },
      ];

      const canonical = assembleCanonicalStudentState({
        user: mockUser,
        profile,
        evidenceChecks,
      });

      const mongoSkill = canonical.skills.find((s) => s.key === 'mongodb');
      assert.ok(mongoSkill);
      assert.equal(mongoSkill.strength, EVIDENCE_STRENGTH.CLAIMED);
      assert.notEqual(mongoSkill.provenanceTier, PROVENANCE_TIER.EXTERNALLY_VERIFIED);
    });

    it('populates a comprehensive audit provenance ledger', () => {
      const profile = {
        _id: 'prof_005',
        skills: [{ name: 'Go', level: 'expert' }],
        projects: [{ title: 'Microservice', technologies: ['Go'] }],
      };

      const canonical = assembleCanonicalStudentState({ user: mockUser, profile });

      assert.ok(Array.isArray(canonical.provenanceLedger));
      assert.ok(canonical.provenanceLedger.length > 0);

      const goFact = canonical.provenanceLedger.find(
        (f) => f.entityKey === 'go' && f.entityType === 'skill',
      );
      assert.ok(goFact);
      assert.equal(goFact.provenanceTier, PROVENANCE_TIER.USER_ENTERED);
      assert.equal(goFact.confidence, PROVENANCE_WEIGHT[PROVENANCE_TIER.USER_ENTERED]);
    });
  });
});
