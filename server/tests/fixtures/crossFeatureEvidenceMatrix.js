import { buildCareerTwin } from '../../src/domain/careerTwin/buildCareerTwin.js';
import { computeSkillGap, GAP_STATUS, GAP_IMPORTANCE } from '../../src/domain/skillGap/computeSkillGap.js';
import { buildRoadmap, PRIORITY, EFFORT } from '../../src/domain/roadmap/buildRoadmap.js';
import { computeReadiness } from '../../src/domain/readiness/computeReadiness.js';
import { READINESS_EVIDENCE_STATUS } from '../../src/domain/readiness/readinessContract.js';
import { findRole } from '../../src/domain/careers/roleCatalogue.js';
import { EVIDENCE_SOURCES, EVIDENCE_STRENGTH } from '../../src/domain/evidence/evidence.js';

/**
 * Deep freezes an object recursively to ensure immutability in tests.
 */
function deepFreeze(obj) {
  if (!obj || typeof obj !== 'object' || Object.isFrozen(obj)) {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    deepFreeze(obj[key]);
  }
  return obj;
}

/**
 * Cross-Feature Evidence Matrix Rows.
 *
 * Each row defines a concrete evidence scenario across:
 * - Inputs: profile, resume, assessment, interview
 * - Expected CareerTwin representation
 * - Expected SkillGap representation
 * - Expected Roadmap actionability
 * - Expected Readiness projection
 */
export const CROSS_FEATURE_EVIDENCE_MATRIX = deepFreeze({
  // ---------------------------------------------------------------------------
  // 1. Single-Source Isolation
  // ---------------------------------------------------------------------------
  profileSkillOnly: {
    id: 'matrix-profile-skill-only',
    description: 'Profile self-declared skill without project or assessment corroboration',
    sourceCategory: 'profile',
    targetSkill: 'JavaScript',
    targetRole: 'backend-developer',
    input: {
      profile: {
        skills: [{ name: 'JavaScript', level: 'intermediate' }],
        projects: [],
        certifications: [],
        career: { targetRole: 'Backend Developer' },
      },
      resumes: [],
      verifiedEvidence: [],
    },
    expectedTwin: {
      strength: EVIDENCE_STRENGTH.CLAIMED,
      primarySource: EVIDENCE_SOURCES.SELF_DECLARED,
      sourceCount: 1,
      totalEvidenceItems: 1,
    },
    expectedGap: {
      status: GAP_STATUS.CLAIMED,
      importance: GAP_IMPORTANCE.REQUIRED,
      hasProjectSuggestion: true,
      hasAssessmentSuggestion: false,
    },
    expectedRoadmap: {
      hasItem: true,
      priority: PRIORITY.HIGH,
      estimatedEffort: EFFORT.MODERATE,
    },
    expectedReadiness: {
      isBlocker: true,
      blockerStatus: GAP_STATUS.CLAIMED,
    },
  },

  resumeSkillOnly: {
    id: 'matrix-resume-skill-only',
    description: 'Skill parsed exclusively from resume text',
    sourceCategory: 'resume',
    targetSkill: 'JavaScript',
    targetRole: 'backend-developer',
    input: {
      profile: {
        skills: [],
        projects: [],
        certifications: [],
        career: { targetRole: 'Backend Developer' },
      },
      resumes: [
        {
          id: 'res-matrix-001',
          label: 'Student Resume',
          parsed: {
            skills: [{ name: 'JavaScript' }],
            projects: [],
            certifications: [],
          },
        },
      ],
      verifiedEvidence: [],
    },
    expectedTwin: {
      strength: EVIDENCE_STRENGTH.CLAIMED,
      primarySource: EVIDENCE_SOURCES.RESUME,
      sourceCount: 1,
      totalEvidenceItems: 1,
    },
    expectedGap: {
      status: GAP_STATUS.CLAIMED,
      importance: GAP_IMPORTANCE.REQUIRED,
      hasProjectSuggestion: true,
      hasAssessmentSuggestion: false,
    },
    expectedRoadmap: {
      hasItem: true,
      priority: PRIORITY.HIGH,
      estimatedEffort: EFFORT.MODERATE,
    },
    expectedReadiness: {
      isBlocker: true,
      blockerStatus: GAP_STATUS.CLAIMED,
    },
  },

  profileProjectOnly: {
    id: 'matrix-profile-project-only',
    description: 'Skill evidenced via profile project technology',
    sourceCategory: 'profile',
    targetSkill: 'Node.js',
    targetRole: 'backend-developer',
    input: {
      profile: {
        skills: [],
        projects: [
          {
            title: 'REST Microservice',
            technologies: ['Node.js'],
          },
        ],
        certifications: [],
        career: { targetRole: 'Backend Developer' },
      },
      resumes: [],
      verifiedEvidence: [],
    },
    expectedTwin: {
      strength: EVIDENCE_STRENGTH.SUPPORTED,
      primarySource: EVIDENCE_SOURCES.PROJECT,
      sourceCount: 1,
      totalEvidenceItems: 1,
    },
    expectedGap: {
      status: GAP_STATUS.SUPPORTED,
      importance: GAP_IMPORTANCE.REQUIRED,
      hasProjectSuggestion: false,
      hasAssessmentSuggestion: true,
    },
    expectedRoadmap: {
      // Supported skill has already satisfied project learning; assessment action is not actionable today
      hasItem: false,
    },
    expectedReadiness: {
      isBlocker: true,
      blockerStatus: GAP_STATUS.SUPPORTED,
    },
  },

  resumeProjectOnly: {
    id: 'matrix-resume-project-only',
    description: 'Skill evidenced via resume parsed project technology',
    sourceCategory: 'resume',
    targetSkill: 'SQL',
    targetRole: 'backend-developer',
    input: {
      profile: {
        skills: [],
        projects: [],
        certifications: [],
        career: { targetRole: 'Backend Developer' },
      },
      resumes: [
        {
          id: 'res-matrix-002',
          label: 'Engineering Resume',
          parsed: {
            skills: [],
            projects: [
              {
                title: 'Data Ingestion Pipeline',
                technologies: ['SQL'],
              },
            ],
            certifications: [],
          },
        },
      ],
      verifiedEvidence: [],
    },
    expectedTwin: {
      strength: EVIDENCE_STRENGTH.SUPPORTED,
      primarySource: EVIDENCE_SOURCES.PROJECT,
      sourceCount: 1,
      totalEvidenceItems: 1,
    },
    expectedGap: {
      status: GAP_STATUS.SUPPORTED,
      importance: GAP_IMPORTANCE.REQUIRED,
      hasProjectSuggestion: false,
      hasAssessmentSuggestion: true,
    },
    expectedRoadmap: {
      hasItem: false,
    },
    expectedReadiness: {
      isBlocker: true,
      blockerStatus: GAP_STATUS.SUPPORTED,
    },
  },

  assessmentCheckOnly: {
    id: 'matrix-assessment-check-only',
    description: 'Skill verified via independently evaluated technical assessment',
    sourceCategory: 'assessment',
    targetSkill: 'JavaScript',
    targetRole: 'backend-developer',
    input: {
      profile: {
        skills: [],
        projects: [],
        certifications: [],
        career: { targetRole: 'Backend Developer' },
      },
      resumes: [],
      verifiedEvidence: [
        {
          skill: 'JavaScript',
          evidence: {
            source: EVIDENCE_SOURCES.ASSESSMENT,
            strength: EVIDENCE_STRENGTH.VERIFIED,
            detail: 'Passed assessment for JavaScript with score 88.',
            reference: 'chk-assess-matrix-001',
          },
          completedAt: new Date('2026-09-15T10:00:00.000Z'),
        },
      ],
    },
    expectedTwin: {
      strength: EVIDENCE_STRENGTH.VERIFIED,
      primarySource: EVIDENCE_SOURCES.ASSESSMENT,
      sourceCount: 1,
      totalEvidenceItems: 1,
    },
    expectedGap: {
      status: GAP_STATUS.VERIFIED,
      importance: GAP_IMPORTANCE.REQUIRED,
      hasProjectSuggestion: false,
      hasAssessmentSuggestion: false,
    },
    expectedRoadmap: {
      hasItem: false, // Verified skills are not on roadmap
    },
    expectedReadiness: {
      isBlocker: false, // Verified skills never block readiness
    },
  },

  interviewCheckOnly: {
    id: 'matrix-interview-check-only',
    description: 'Skill verified via independently evaluated technical interview',
    sourceCategory: 'interview',
    targetSkill: 'REST APIs',
    targetRole: 'backend-developer',
    input: {
      profile: {
        skills: [],
        projects: [],
        certifications: [],
        career: { targetRole: 'Backend Developer' },
      },
      resumes: [],
      verifiedEvidence: [
        {
          skill: 'REST APIs',
          evidence: {
            source: EVIDENCE_SOURCES.INTERVIEW,
            strength: EVIDENCE_STRENGTH.VERIFIED,
            detail: 'Passed interview for REST APIs with score 86.',
            reference: 'chk-interview-matrix-001',
          },
          completedAt: new Date('2026-09-18T10:00:00.000Z'),
        },
      ],
    },
    expectedTwin: {
      strength: EVIDENCE_STRENGTH.VERIFIED,
      primarySource: EVIDENCE_SOURCES.INTERVIEW,
      sourceCount: 1,
      totalEvidenceItems: 1,
    },
    expectedGap: {
      status: GAP_STATUS.VERIFIED,
      importance: GAP_IMPORTANCE.REQUIRED,
      hasProjectSuggestion: false,
      hasAssessmentSuggestion: false,
    },
    expectedRoadmap: {
      hasItem: false,
    },
    expectedReadiness: {
      isBlocker: false,
    },
  },

  // ---------------------------------------------------------------------------
  // 2. Multi-Source Corroboration & Strength Upgrades
  // ---------------------------------------------------------------------------
  profileAndResumeClaimed: {
    id: 'matrix-profile-and-resume-claimed',
    description: 'Skill claimed in both profile and resume (corroborated, remains claimed)',
    sourceCategory: 'profile+resume',
    targetSkill: 'JavaScript',
    targetRole: 'backend-developer',
    input: {
      profile: {
        skills: [{ name: 'JavaScript', level: 'intermediate' }],
        projects: [],
        certifications: [],
      },
      resumes: [
        {
          id: 'res-matrix-003',
          label: 'Corroborating Resume',
          parsed: {
            skills: [{ name: 'JavaScript' }],
            projects: [],
            certifications: [],
          },
        },
      ],
      verifiedEvidence: [],
    },
    expectedTwin: {
      strength: EVIDENCE_STRENGTH.CLAIMED,
      sourceCount: 2, // self_declared + resume
      totalEvidenceItems: 2,
    },
    expectedGap: {
      status: GAP_STATUS.CLAIMED,
      hasProjectSuggestion: true,
    },
    expectedRoadmap: {
      hasItem: true,
      priority: PRIORITY.HIGH,
    },
    expectedReadiness: {
      isBlocker: true,
    },
  },

  profileClaimedAndProjectSupported: {
    id: 'matrix-claimed-and-supported',
    description: 'Skill claimed in profile and supported in project (upgrades to supported)',
    sourceCategory: 'profile+project',
    targetSkill: 'Node.js',
    targetRole: 'backend-developer',
    input: {
      profile: {
        skills: [{ name: 'Node.js', level: 'intermediate' }],
        projects: [
          {
            title: 'Backend Gateway',
            technologies: ['Node.js'],
          },
        ],
        certifications: [],
      },
      resumes: [],
      verifiedEvidence: [],
    },
    expectedTwin: {
      strength: EVIDENCE_STRENGTH.SUPPORTED,
      primarySource: EVIDENCE_SOURCES.PROJECT, // project evidence ranks higher than self_declared
      sourceCount: 2,
      totalEvidenceItems: 2,
    },
    expectedGap: {
      status: GAP_STATUS.SUPPORTED,
      hasProjectSuggestion: false,
    },
    expectedRoadmap: {
      hasItem: false, // project requirement is met
    },
    expectedReadiness: {
      isBlocker: true,
      blockerStatus: GAP_STATUS.SUPPORTED,
    },
  },

  projectSupportedAndAssessmentVerified: {
    id: 'matrix-supported-and-verified-assessment',
    description: 'Skill supported in project and verified via assessment (upgrades to verified)',
    sourceCategory: 'project+assessment',
    targetSkill: 'SQL',
    targetRole: 'backend-developer',
    input: {
      profile: {
        skills: [],
        projects: [
          {
            title: 'Inventory DB',
            technologies: ['SQL'],
          },
        ],
        certifications: [],
      },
      resumes: [],
      verifiedEvidence: [
        {
          skill: 'SQL',
          evidence: {
            source: EVIDENCE_SOURCES.ASSESSMENT,
            strength: EVIDENCE_STRENGTH.VERIFIED,
            detail: 'Passed assessment for SQL with score 94.',
            reference: 'chk-assess-matrix-002',
          },
          completedAt: new Date('2026-09-20T10:00:00.000Z'),
        },
      ],
    },
    expectedTwin: {
      strength: EVIDENCE_STRENGTH.VERIFIED,
      primarySource: EVIDENCE_SOURCES.ASSESSMENT,
      sourceCount: 2, // project + assessment
      totalEvidenceItems: 2,
    },
    expectedGap: {
      status: GAP_STATUS.VERIFIED,
      hasProjectSuggestion: false,
      hasAssessmentSuggestion: false,
    },
    expectedRoadmap: {
      hasItem: false,
    },
    expectedReadiness: {
      isBlocker: false,
    },
  },

  projectSupportedAndInterviewVerified: {
    id: 'matrix-supported-and-verified-interview',
    description: 'Skill supported in project and verified via interview (upgrades to verified)',
    sourceCategory: 'project+interview',
    targetSkill: 'REST APIs',
    targetRole: 'backend-developer',
    input: {
      profile: {
        skills: [],
        projects: [
          {
            title: 'API Gateway',
            technologies: ['REST APIs'],
          },
        ],
        certifications: [],
      },
      resumes: [],
      verifiedEvidence: [
        {
          skill: 'REST APIs',
          evidence: {
            source: EVIDENCE_SOURCES.INTERVIEW,
            strength: EVIDENCE_STRENGTH.VERIFIED,
            detail: 'Passed interview for REST APIs with score 92.',
            reference: 'chk-interview-matrix-002',
          },
          completedAt: new Date('2026-09-22T10:00:00.000Z'),
        },
      ],
    },
    expectedTwin: {
      strength: EVIDENCE_STRENGTH.VERIFIED,
      primarySource: EVIDENCE_SOURCES.INTERVIEW,
      sourceCount: 2,
      totalEvidenceItems: 2,
    },
    expectedGap: {
      status: GAP_STATUS.VERIFIED,
      hasProjectSuggestion: false,
    },
    expectedRoadmap: {
      hasItem: false,
    },
    expectedReadiness: {
      isBlocker: false,
    },
  },

  allFourSourcesConverged: {
    id: 'matrix-all-four-sources-converged',
    description: 'Skill evidenced across Profile + Resume + Project + Assessment + Interview',
    sourceCategory: 'all_sources',
    targetSkill: 'JavaScript',
    targetRole: 'backend-developer',
    input: {
      profile: {
        skills: [{ name: 'JavaScript', level: 'advanced' }],
        projects: [{ title: 'Fullstack App', technologies: ['JavaScript'] }],
        certifications: [],
      },
      resumes: [
        {
          id: 'res-matrix-all',
          label: 'Master Resume',
          parsed: {
            skills: [{ name: 'JavaScript' }],
            projects: [{ title: 'Fullstack App', technologies: ['JavaScript'] }],
            certifications: [],
          },
        },
      ],
      verifiedEvidence: [
        {
          skill: 'JavaScript',
          evidence: {
            source: EVIDENCE_SOURCES.ASSESSMENT,
            strength: EVIDENCE_STRENGTH.VERIFIED,
            detail: 'Passed assessment for JavaScript with score 98.',
            reference: 'chk-assess-matrix-all',
          },
          completedAt: new Date('2026-09-20T10:00:00.000Z'),
        },
        {
          skill: 'JavaScript',
          evidence: {
            source: EVIDENCE_SOURCES.INTERVIEW,
            strength: EVIDENCE_STRENGTH.VERIFIED,
            detail: 'Passed interview for JavaScript with score 95.',
            reference: 'chk-interview-matrix-all',
          },
          completedAt: new Date('2026-09-22T10:00:00.000Z'),
        },
      ],
    },
    expectedTwin: {
      strength: EVIDENCE_STRENGTH.VERIFIED,
      sourceCount: 5, // self_declared, resume, project, assessment, interview
      totalEvidenceItems: 5, // profile skill, profile project, resume skill, assessment, interview (resume project merges by source)
    },
    expectedGap: {
      status: GAP_STATUS.VERIFIED,
    },
    expectedRoadmap: {
      hasItem: false,
    },
    expectedReadiness: {
      isBlocker: false,
    },
  },
});

/**
 * Pure evaluation function running the full cross-feature pipeline for a matrix row.
 */
export function evaluateCrossFeaturePipeline(row) {
  const role = findRole(row.targetRole);
  if (!role) {
    throw new Error(`Target role "${row.targetRole}" not found in catalogue`);
  }

  const twin = buildCareerTwin({
    profile: row.input.profile,
    resumes: row.input.resumes,
    verifiedEvidence: row.input.verifiedEvidence,
  });

  const gap = computeSkillGap(twin, role);
  const roadmap = buildRoadmap(gap);
  const readiness = computeReadiness(gap);

  const twinSkill = twin.skills.find((s) => s.name === row.targetSkill);
  const gapSkill = gap.skills.find((s) => s.name === row.targetSkill);
  const roadmapItem = roadmap.items.find((item) => item.skill.name === row.targetSkill);
  const blocker = readiness.blockingSkills.find((s) => s.name === row.targetSkill);

  return {
    twin,
    gap,
    roadmap,
    readiness,
    target: {
      twinSkill,
      gapSkill,
      roadmapItem,
      blocker,
    },
  };
}
