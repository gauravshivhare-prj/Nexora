import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CROSS_FEATURE_EVIDENCE_MATRIX,
  evaluateCrossFeaturePipeline,
} from './fixtures/crossFeatureEvidenceMatrix.js';
import { buildCareerTwin } from '../src/domain/careerTwin/buildCareerTwin.js';
import { computeSkillGap, GAP_STATUS, GAP_IMPORTANCE } from '../src/domain/skillGap/computeSkillGap.js';
import { buildRoadmap, PRIORITY, EFFORT } from '../src/domain/roadmap/buildRoadmap.js';
import { computeReadiness } from '../src/domain/readiness/computeReadiness.js';
import { READINESS_EVIDENCE_STATUS } from '../src/domain/readiness/readinessContract.js';
import { findRole } from '../src/domain/careers/roleCatalogue.js';
import { EVIDENCE_SOURCES, EVIDENCE_STRENGTH } from '../src/domain/evidence/evidence.js';

describe('TASK A22 — Cross-Feature Evidence Regression Matrix Suite', () => {
  describe('1. Single-Source Evidence Flow Matrix (Profile, Resume, Assessment, Interview)', () => {
    it('Row 1 [Profile Skill]: flows Claimed evidence through Twin -> Gap -> Roadmap -> Readiness', () => {
      const row = CROSS_FEATURE_EVIDENCE_MATRIX.profileSkillOnly;
      const { target, gap, readiness } = evaluateCrossFeaturePipeline(row);

      // 1. CareerTwin Verification
      assert.ok(target.twinSkill, 'Skill must exist in CareerTwin');
      assert.equal(target.twinSkill.strength, row.expectedTwin.strength);
      assert.equal(target.twinSkill.evidence[0].source, row.expectedTwin.primarySource);
      assert.equal(target.twinSkill.sourceCount, row.expectedTwin.sourceCount);
      assert.equal(target.twinSkill.evidence.length, row.expectedTwin.totalEvidenceItems);

      // 2. SkillGap Verification
      assert.ok(target.gapSkill, 'Skill must exist in SkillGap');
      assert.equal(target.gapSkill.status, row.expectedGap.status);
      assert.equal(target.gapSkill.importance, row.expectedGap.importance);
      assert.ok(target.gapSkill.reason.includes('You have listed JavaScript'));
      assert.equal(
        target.gapSkill.suggestedEvidence.some((s) => s.type === 'project' && s.available),
        row.expectedGap.hasProjectSuggestion,
      );

      // 3. Roadmap Verification
      assert.ok(target.roadmapItem, 'Roadmap must generate an actionable item for claimed skill');
      assert.equal(target.roadmapItem.priority, row.expectedRoadmap.priority);
      assert.equal(target.roadmapItem.estimatedEffort, row.expectedRoadmap.estimatedEffort);
      assert.equal(target.roadmapItem.because.currentStatus, GAP_STATUS.CLAIMED);

      // 4. Readiness Verification
      assert.ok(target.blocker, 'Claimed skill must be a blocker in Readiness');
      assert.equal(target.blocker.status, row.expectedReadiness.blockerStatus);
      assert.equal(readiness.evidenceStatus, READINESS_EVIDENCE_STATUS.PARTIAL);
    });

    it('Row 2 [Resume Skill]: flows Resume text skill through Twin -> Gap -> Roadmap -> Readiness', () => {
      const row = CROSS_FEATURE_EVIDENCE_MATRIX.resumeSkillOnly;
      const { target, gap, readiness } = evaluateCrossFeaturePipeline(row);

      // 1. CareerTwin
      assert.ok(target.twinSkill);
      assert.equal(target.twinSkill.strength, EVIDENCE_STRENGTH.CLAIMED);
      assert.equal(target.twinSkill.evidence[0].source, EVIDENCE_SOURCES.RESUME);
      assert.equal(target.twinSkill.evidence[0].reference, 'res-matrix-001');

      // 2. SkillGap
      assert.ok(target.gapSkill);
      assert.equal(target.gapSkill.status, GAP_STATUS.CLAIMED);

      // 3. Roadmap
      assert.ok(target.roadmapItem);
      assert.equal(target.roadmapItem.priority, PRIORITY.HIGH);

      // 4. Readiness
      assert.ok(target.blocker);
      assert.equal(target.blocker.status, GAP_STATUS.CLAIMED);
      assert.equal(readiness.evidenceStatus, READINESS_EVIDENCE_STATUS.PARTIAL);
    });

    it('Row 3 [Profile Project]: flows Supported evidence, satisfying Roadmap while tracking Readiness blocker', () => {
      const row = CROSS_FEATURE_EVIDENCE_MATRIX.profileProjectOnly;
      const { target, gap, readiness } = evaluateCrossFeaturePipeline(row);

      // 1. CareerTwin
      assert.ok(target.twinSkill);
      assert.equal(target.twinSkill.strength, EVIDENCE_STRENGTH.SUPPORTED);
      assert.equal(target.twinSkill.evidence[0].source, EVIDENCE_SOURCES.PROJECT);
      assert.equal(target.twinSkill.evidence[0].reference, 'REST Microservice');

      // 2. SkillGap
      assert.ok(target.gapSkill);
      assert.equal(target.gapSkill.status, GAP_STATUS.SUPPORTED);
      assert.ok(target.gapSkill.reason.includes('concrete work involving Node.js'));
      // Only assessment is suggested, which is marked available: false
      assert.equal(
        target.gapSkill.suggestedEvidence.some((s) => s.type === 'project' && s.available),
        false,
      );

      // 3. Roadmap: Supported skill has already satisfied project learning requirement
      assert.equal(target.roadmapItem, undefined, 'Supported skill must not generate a project task on roadmap');

      // 4. Readiness: Still a blocker until verified, but recognized as supported
      assert.ok(target.blocker);
      assert.equal(target.blocker.status, GAP_STATUS.SUPPORTED);
    });

    it('Row 4 [Resume Project]: flows Resume parsed project technology into Supported evidence', () => {
      const row = CROSS_FEATURE_EVIDENCE_MATRIX.resumeProjectOnly;
      const { target } = evaluateCrossFeaturePipeline(row);

      assert.ok(target.twinSkill);
      assert.equal(target.twinSkill.strength, EVIDENCE_STRENGTH.SUPPORTED);
      assert.equal(target.twinSkill.evidence[0].source, EVIDENCE_SOURCES.PROJECT);
      assert.equal(target.twinSkill.evidence[0].reference, 'res-matrix-002');
      assert.equal(target.gapSkill.status, GAP_STATUS.SUPPORTED);
      assert.equal(target.roadmapItem, undefined);
      assert.ok(target.blocker);
    });

    it('Row 5 [Assessment Check]: flows Verified evidence, clearing Roadmap and unblocking Readiness', () => {
      const row = CROSS_FEATURE_EVIDENCE_MATRIX.assessmentCheckOnly;
      const { target, gap } = evaluateCrossFeaturePipeline(row);

      // 1. CareerTwin
      assert.ok(target.twinSkill);
      assert.equal(target.twinSkill.strength, EVIDENCE_STRENGTH.VERIFIED);
      assert.equal(target.twinSkill.evidence[0].source, EVIDENCE_SOURCES.ASSESSMENT);
      assert.equal(target.twinSkill.evidence[0].reference, 'chk-assess-matrix-001');

      // 2. SkillGap
      assert.ok(target.gapSkill);
      assert.equal(target.gapSkill.status, GAP_STATUS.VERIFIED);
      assert.ok(target.gapSkill.reason.includes('independently checked'));
      assert.deepEqual(target.gapSkill.suggestedEvidence, []);

      // 3. Roadmap: Verified skill generates 0 roadmap tasks
      assert.equal(target.roadmapItem, undefined);

      // 4. Readiness: Verified skill is NOT a blocker
      assert.equal(target.blocker, undefined, 'Verified skill must not appear in blockingSkills');
    });

    it('Row 6 [Interview Check]: flows Interview Verified evidence, clearing Roadmap and unblocking Readiness', () => {
      const row = CROSS_FEATURE_EVIDENCE_MATRIX.interviewCheckOnly;
      const { target } = evaluateCrossFeaturePipeline(row);

      assert.ok(target.twinSkill);
      assert.equal(target.twinSkill.strength, EVIDENCE_STRENGTH.VERIFIED);
      assert.equal(target.twinSkill.evidence[0].source, EVIDENCE_SOURCES.INTERVIEW);
      assert.equal(target.twinSkill.evidence[0].reference, 'chk-interview-matrix-001');
      assert.equal(target.gapSkill.status, GAP_STATUS.VERIFIED);
      assert.equal(target.roadmapItem, undefined);
      assert.equal(target.blocker, undefined);
    });
  });

  describe('2. Multi-Source Evidence Precedence & Strength Upgrade Matrix', () => {
    it('Row 7 [Profile + Resume]: retains Claimed strength while increasing source corroboration', () => {
      const row = CROSS_FEATURE_EVIDENCE_MATRIX.profileAndResumeClaimed;
      const { target } = evaluateCrossFeaturePipeline(row);

      assert.equal(target.twinSkill.strength, EVIDENCE_STRENGTH.CLAIMED);
      assert.equal(target.twinSkill.sourceCount, 2);
      assert.equal(target.twinSkill.evidence.length, 2);
      const sources = target.twinSkill.evidence.map((e) => e.source);
      assert.ok(sources.includes(EVIDENCE_SOURCES.SELF_DECLARED));
      assert.ok(sources.includes(EVIDENCE_SOURCES.RESUME));

      assert.equal(target.gapSkill.status, GAP_STATUS.CLAIMED);
      assert.ok(target.roadmapItem);
      assert.ok(target.blocker);
    });

    it('Row 8 [Claimed + Supported]: upgrades skill strength to Supported and orders project evidence first', () => {
      const row = CROSS_FEATURE_EVIDENCE_MATRIX.profileClaimedAndProjectSupported;
      const { target } = evaluateCrossFeaturePipeline(row);

      assert.equal(target.twinSkill.strength, EVIDENCE_STRENGTH.SUPPORTED);
      assert.equal(target.twinSkill.sourceCount, 2);
      // Strongest evidence sorted first
      assert.equal(target.twinSkill.evidence[0].source, EVIDENCE_SOURCES.PROJECT);
      assert.equal(target.twinSkill.evidence[0].strength, EVIDENCE_STRENGTH.SUPPORTED);
      assert.equal(target.twinSkill.evidence[1].source, EVIDENCE_SOURCES.SELF_DECLARED);
      assert.equal(target.twinSkill.evidence[1].strength, EVIDENCE_STRENGTH.CLAIMED);

      assert.equal(target.gapSkill.status, GAP_STATUS.SUPPORTED);
      assert.equal(target.roadmapItem, undefined);
      assert.ok(target.blocker);
    });

    it('Row 9 [Supported + Assessment]: upgrades to Verified and retains both corroborating records', () => {
      const row = CROSS_FEATURE_EVIDENCE_MATRIX.projectSupportedAndAssessmentVerified;
      const { target } = evaluateCrossFeaturePipeline(row);

      assert.equal(target.twinSkill.strength, EVIDENCE_STRENGTH.VERIFIED);
      assert.equal(target.twinSkill.sourceCount, 2);
      // Verified evidence sorted first
      assert.equal(target.twinSkill.evidence[0].source, EVIDENCE_SOURCES.ASSESSMENT);
      assert.equal(target.twinSkill.evidence[0].strength, EVIDENCE_STRENGTH.VERIFIED);
      assert.equal(target.twinSkill.evidence[1].source, EVIDENCE_SOURCES.PROJECT);
      assert.equal(target.twinSkill.evidence[1].strength, EVIDENCE_STRENGTH.SUPPORTED);

      assert.equal(target.gapSkill.status, GAP_STATUS.VERIFIED);
      assert.equal(target.roadmapItem, undefined);
      assert.equal(target.blocker, undefined);
    });

    it('Row 10 [Supported + Interview]: upgrades to Verified via independent technical interview', () => {
      const row = CROSS_FEATURE_EVIDENCE_MATRIX.projectSupportedAndInterviewVerified;
      const { target } = evaluateCrossFeaturePipeline(row);

      assert.equal(target.twinSkill.strength, EVIDENCE_STRENGTH.VERIFIED);
      assert.equal(target.twinSkill.evidence[0].source, EVIDENCE_SOURCES.INTERVIEW);
      assert.equal(target.twinSkill.evidence[1].source, EVIDENCE_SOURCES.PROJECT);

      assert.equal(target.gapSkill.status, GAP_STATUS.VERIFIED);
      assert.equal(target.roadmapItem, undefined);
      assert.equal(target.blocker, undefined);
    });

    it('Row 11 [All Four Sources Converged]: aggregates 5 distinct corroborating evidence records', () => {
      const row = CROSS_FEATURE_EVIDENCE_MATRIX.allFourSourcesConverged;
      const { target } = evaluateCrossFeaturePipeline(row);

      assert.equal(target.twinSkill.strength, EVIDENCE_STRENGTH.VERIFIED);
      assert.equal(target.twinSkill.sourceCount, 5);

      const sources = target.twinSkill.evidence.map((e) => e.source);
      assert.ok(sources.includes(EVIDENCE_SOURCES.ASSESSMENT));
      assert.ok(sources.includes(EVIDENCE_SOURCES.INTERVIEW));
      assert.ok(sources.includes(EVIDENCE_SOURCES.PROJECT));
      assert.ok(sources.includes(EVIDENCE_SOURCES.RESUME));
      assert.ok(sources.includes(EVIDENCE_SOURCES.SELF_DECLARED));

      assert.equal(target.gapSkill.status, GAP_STATUS.VERIFIED);
      assert.equal(target.roadmapItem, undefined);
      assert.equal(target.blocker, undefined);
    });
  });

  describe('3. Cross-Feature Cumulative Lifecycle Progression (The Student Journey)', () => {
    const backendRole = findRole('backend-developer');
    const skillName = 'Node.js';

    it('proves the complete 5-stage lifecycle for Node.js from Missing to Interview Verified', () => {
      // -----------------------------------------------------------------------
      // Stage 0: Blank candidate — 0 evidence
      // -----------------------------------------------------------------------
      const stage0Twin = buildCareerTwin({ profile: null, resumes: [], verifiedEvidence: [] });
      const stage0Gap = computeSkillGap(stage0Twin, backendRole);
      const stage0Roadmap = buildRoadmap(stage0Gap);
      const stage0Readiness = computeReadiness(stage0Gap);

      const stage0NodeGap = stage0Gap.skills.find((s) => s.name === skillName);
      const stage0NodeRoadmap = stage0Roadmap.items.find((item) => item.skill.name === skillName);
      const stage0NodeBlocker = stage0Readiness.blockingSkills.find((s) => s.name === skillName);

      assert.equal(stage0NodeGap.status, GAP_STATUS.MISSING);
      assert.ok(stage0NodeRoadmap);
      assert.equal(stage0NodeRoadmap.priority, PRIORITY.CRITICAL);
      assert.equal(stage0NodeRoadmap.estimatedEffort, EFFORT.SUBSTANTIAL);
      assert.ok(stage0NodeBlocker);
      assert.equal(stage0NodeBlocker.status, GAP_STATUS.MISSING);
      assert.equal(stage0Readiness.evidenceStatus, READINESS_EVIDENCE_STATUS.PARTIAL);

      // -----------------------------------------------------------------------
      // Stage 1: Student adds Node.js to profile skills (Claimed)
      // -----------------------------------------------------------------------
      const stage1Profile = {
        skills: [{ name: skillName, level: 'intermediate' }],
        projects: [],
        career: { targetRole: 'Backend Developer' },
      };
      const stage1Twin = buildCareerTwin({ profile: stage1Profile, resumes: [], verifiedEvidence: [] });
      const stage1Gap = computeSkillGap(stage1Twin, backendRole);
      const stage1Roadmap = buildRoadmap(stage1Gap);
      const stage1Readiness = computeReadiness(stage1Gap);

      const stage1NodeTwin = stage1Twin.skills.find((s) => s.name === skillName);
      const stage1NodeGap = stage1Gap.skills.find((s) => s.name === skillName);
      const stage1NodeRoadmap = stage1Roadmap.items.find((item) => item.skill.name === skillName);
      const stage1NodeBlocker = stage1Readiness.blockingSkills.find((s) => s.name === skillName);

      assert.equal(stage1NodeTwin.strength, EVIDENCE_STRENGTH.CLAIMED);
      assert.equal(stage1NodeGap.status, GAP_STATUS.CLAIMED);
      assert.ok(stage1NodeRoadmap);
      assert.equal(stage1NodeRoadmap.priority, PRIORITY.HIGH); // Lowered from critical to high
      assert.equal(stage1NodeRoadmap.estimatedEffort, EFFORT.MODERATE); // Lowered from substantial to moderate
      assert.ok(stage1NodeBlocker);
      assert.equal(stage1NodeBlocker.status, GAP_STATUS.CLAIMED);

      // -----------------------------------------------------------------------
      // Stage 2: Student builds and uploads project with Node.js (Supported)
      // -----------------------------------------------------------------------
      const stage2Profile = {
        ...stage1Profile,
        projects: [{ title: 'Backend REST API', technologies: [skillName] }],
      };
      const stage2Twin = buildCareerTwin({ profile: stage2Profile, resumes: [], verifiedEvidence: [] });
      const stage2Gap = computeSkillGap(stage2Twin, backendRole);
      const stage2Roadmap = buildRoadmap(stage2Gap);
      const stage2Readiness = computeReadiness(stage2Gap);

      const stage2NodeTwin = stage2Twin.skills.find((s) => s.name === skillName);
      const stage2NodeGap = stage2Gap.skills.find((s) => s.name === skillName);
      const stage2NodeRoadmap = stage2Roadmap.items.find((item) => item.skill.name === skillName);
      const stage2NodeBlocker = stage2Readiness.blockingSkills.find((s) => s.name === skillName);

      assert.equal(stage2NodeTwin.strength, EVIDENCE_STRENGTH.SUPPORTED);
      assert.equal(stage2NodeTwin.sourceCount, 2);
      assert.equal(stage2NodeGap.status, GAP_STATUS.SUPPORTED);
      assert.equal(stage2NodeRoadmap, undefined, 'Project task is closed on roadmap once supported');
      assert.ok(stage2NodeBlocker);
      assert.equal(stage2NodeBlocker.status, GAP_STATUS.SUPPORTED);

      // -----------------------------------------------------------------------
      // Stage 3: Student passes independent Assessment (Verified)
      // -----------------------------------------------------------------------
      const stage3VerifiedEvidence = [
        {
          skill: skillName,
          evidence: {
            source: EVIDENCE_SOURCES.ASSESSMENT,
            strength: EVIDENCE_STRENGTH.VERIFIED,
            detail: 'Passed assessment with 92.',
            reference: 'assess-node-001',
          },
          completedAt: new Date(),
        },
      ];
      const stage3Twin = buildCareerTwin({
        profile: stage2Profile,
        resumes: [],
        verifiedEvidence: stage3VerifiedEvidence,
      });
      const stage3Gap = computeSkillGap(stage3Twin, backendRole);
      const stage3Roadmap = buildRoadmap(stage3Gap);
      const stage3Readiness = computeReadiness(stage3Gap);

      const stage3NodeTwin = stage3Twin.skills.find((s) => s.name === skillName);
      const stage3NodeGap = stage3Gap.skills.find((s) => s.name === skillName);
      const stage3NodeRoadmap = stage3Roadmap.items.find((item) => item.skill.name === skillName);
      const stage3NodeBlocker = stage3Readiness.blockingSkills.find((s) => s.name === skillName);

      assert.equal(stage3NodeTwin.strength, EVIDENCE_STRENGTH.VERIFIED);
      assert.equal(stage3NodeGap.status, GAP_STATUS.VERIFIED);
      assert.equal(stage3NodeRoadmap, undefined);
      assert.equal(stage3NodeBlocker, undefined, 'Node.js is completely unblocked in Readiness!');

      // -----------------------------------------------------------------------
      // Stage 4: Student also completes technical Interview (Corroborated Verified)
      // -----------------------------------------------------------------------
      const stage4VerifiedEvidence = [
        ...stage3VerifiedEvidence,
        {
          skill: skillName,
          evidence: {
            source: EVIDENCE_SOURCES.INTERVIEW,
            strength: EVIDENCE_STRENGTH.VERIFIED,
            detail: 'Passed interview with 95.',
            reference: 'interview-node-001',
          },
          completedAt: new Date(),
        },
      ];
      const stage4Twin = buildCareerTwin({
        profile: stage2Profile,
        resumes: [],
        verifiedEvidence: stage4VerifiedEvidence,
      });
      const stage4NodeTwin = stage4Twin.skills.find((s) => s.name === skillName);

      assert.equal(stage4NodeTwin.strength, EVIDENCE_STRENGTH.VERIFIED);
      assert.equal(stage4NodeTwin.sourceCount, 4); // self_declared + project + assessment + interview
      assert.equal(stage4NodeTwin.evidence[0].strength, EVIDENCE_STRENGTH.VERIFIED);
      assert.equal(stage4NodeTwin.evidence[1].strength, EVIDENCE_STRENGTH.VERIFIED);
      assert.equal(stage4NodeTwin.evidence[2].strength, EVIDENCE_STRENGTH.SUPPORTED);
      assert.equal(stage4NodeTwin.evidence[3].strength, EVIDENCE_STRENGTH.CLAIMED);
    });
  });

  describe('4. Cross-Feature Invariant Checks', () => {
    it('preserves provenance references throughout every transformation without loss', () => {
      const resumeRef = 'resume-inv-ref-001';
      const assessRef = 'assess-inv-ref-002';
      const interviewRef = 'interview-inv-ref-003';

      const twin = buildCareerTwin({
        profile: {
          skills: [{ name: 'JavaScript', level: 'intermediate' }],
          projects: [{ title: 'Frontend App', technologies: ['HTML'] }],
        },
        resumes: [
          {
            id: resumeRef,
            label: 'Candidate Resume',
            parsed: {
              skills: [{ name: 'CSS' }],
              projects: [{ title: 'Resume Project', technologies: ['CSS'] }],
            },
          },
        ],
        verifiedEvidence: [
          {
            skill: 'Node.js',
            evidence: {
              source: EVIDENCE_SOURCES.ASSESSMENT,
              strength: EVIDENCE_STRENGTH.VERIFIED,
              detail: 'Passed assessment',
              reference: assessRef,
            },
          },
          {
            skill: 'SQL',
            evidence: {
              source: EVIDENCE_SOURCES.INTERVIEW,
              strength: EVIDENCE_STRENGTH.VERIFIED,
              detail: 'Passed interview',
              reference: interviewRef,
            },
          },
        ],
      });

      // Verify every reference survives in CareerTwin
      const cssSkill = twin.skills.find((s) => s.name === 'CSS');
      assert.ok(cssSkill.evidence.some((e) => e.reference === resumeRef));

      const nodeSkill = twin.skills.find((s) => s.name === 'Node.js');
      assert.ok(nodeSkill.evidence.some((e) => e.reference === assessRef));

      const sqlSkill = twin.skills.find((s) => s.name === 'SQL');
      assert.ok(sqlSkill.evidence.some((e) => e.reference === interviewRef));

      // Verify references survive in SkillGap
      const backendRole = findRole('backend-developer');
      const gap = computeSkillGap(twin, backendRole);
      const gapNode = gap.skills.find((s) => s.name === 'Node.js');
      assert.ok(gapNode.evidence.some((e) => e.reference === assessRef));

      // Verify references survive in Readiness blocking skills for unverified skills
      const readiness = computeReadiness(gap);
      const jsBlocker = readiness.blockingSkills.find((s) => s.name === 'JavaScript');
      assert.ok(jsBlocker);
      assert.equal(jsBlocker.evidence[0].source, EVIDENCE_SOURCES.SELF_DECLARED);
    });

    it('enforces that verified skills from assessment/interview are strictly excluded from readiness blockingSkills', () => {
      const backendRole = findRole('backend-developer');
      // Create twin where all 4 required backend skills are verified
      const allVerifiedEvidence = backendRole.requiredSkills.map((name, i) => ({
        skill: name,
        evidence: {
          source: i % 2 === 0 ? EVIDENCE_SOURCES.ASSESSMENT : EVIDENCE_SOURCES.INTERVIEW,
          strength: EVIDENCE_STRENGTH.VERIFIED,
          detail: `Verified ${name}`,
          reference: `ref-${i}`,
        },
      }));

      const twin = buildCareerTwin({
        profile: null,
        resumes: [],
        verifiedEvidence: allVerifiedEvidence,
      });

      const gap = computeSkillGap(twin, backendRole);
      const readiness = computeReadiness(gap);

      assert.equal(readiness.evidenceStatus, READINESS_EVIDENCE_STATUS.VERIFIED);
      assert.equal(readiness.blockingSkills.length, 0);
      assert.equal(readiness.required.verified, 4);
      assert.equal(readiness.required.missing, 0);
      assert.equal(readiness.required.claimed, 0);
      assert.equal(readiness.required.supported, 0);
    });
  });
});
