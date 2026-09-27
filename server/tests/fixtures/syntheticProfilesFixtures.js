import { buildCareerTwin } from '../../src/domain/careerTwin/buildCareerTwin.js';
import { skillKey, canonicalSkill } from '../../src/domain/skills/skillKey.js';
import { READINESS_EVIDENCE_STATUS } from '../../src/domain/readiness/readinessContract.js';
import { GAP_STATUS, GAP_IMPORTANCE } from '../../src/domain/skillGap/computeSkillGap.js';
import { EVIDENCE_STRENGTH, EVIDENCE_SOURCES } from '../../src/domain/evidence/evidence.js';

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
 * Ensures synthetic fixtures are never evaluated or loaded in production.
 */
export function assertNonProductionEnvironment() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Synthetic intelligence fixtures are strictly for deterministic regression testing and MUST NEVER be loaded in production.',
    );
  }
}

/**
 * Checks whether an object or profile is a synthetic test fixture.
 */
export function isSyntheticProfile(candidate) {
  if (!candidate || typeof candidate !== 'object') return false;
  return (
    candidate.metadata?.isSynthetic === true ||
    (typeof candidate.id === 'string' && candidate.id.startsWith('synthetic-'))
  );
}

export const SYNTHETIC_FIXTURE_METADATA = deepFreeze({
  isSynthetic: true,
  purpose: 'deterministic_regression_only',
  environment: 'test',
  productionUsable: false,
  version: 1,
});

// -----------------------------------------------------------------------------
// 1. Beginner Synthetic Profile (Backend Track)
// -----------------------------------------------------------------------------
const beginnerProfileData = {
  id: 'synthetic-beginner-backend',
  tier: 'beginner',
  track: 'backend-developer',
  personal: {
    phone: '9876543210',
    dateOfBirth: '2005-06-15',
    gender: 'male',
    city: 'Bhopal',
    state: 'Madhya Pradesh',
  },
  academic: {
    collegeName: 'State Technical Institute',
    degree: 'B.Tech',
    branch: 'Computer Science and Engineering',
    currentSemester: 2,
    graduationYear: 2028,
    cgpa: 7.2,
  },
  career: {
    targetRole: 'Backend Developer',
    preferredLocation: 'Remote',
    careerInterests: ['Backend Development', 'Web Development'],
    bio: 'First year engineering student learning core web fundamentals.',
  },
  skills: [
    { name: 'JavaScript', level: 'beginner' },
    { name: 'HTML', level: 'beginner' },
  ],
  projects: [
    {
      title: 'Personal Portfolio Page',
      description: 'Introductory HTML profile page',
      technologies: ['HTML'],
      projectUrl: null,
      githubUrl: null,
    },
  ],
  certifications: [],
  resumes: [],
  verifiedEvidence: [],
};

// -----------------------------------------------------------------------------
// 2. Intermediate Synthetic Profile (Backend Track)
// -----------------------------------------------------------------------------
const intermediateProfileData = {
  id: 'synthetic-intermediate-backend',
  tier: 'intermediate',
  track: 'backend-developer',
  personal: {
    phone: '9876543211',
    dateOfBirth: '2004-03-22',
    gender: 'female',
    city: 'Pune',
    state: 'Maharashtra',
  },
  academic: {
    collegeName: 'National Institute of Technology',
    degree: 'B.Tech',
    branch: 'Computer Science and Engineering',
    currentSemester: 6,
    graduationYear: 2026,
    cgpa: 8.4,
  },
  career: {
    targetRole: 'Backend Developer',
    preferredLocation: 'Bengaluru',
    careerInterests: ['Backend Development', 'Databases', 'Cloud Computing'],
    bio: 'Pre-final year student with project experience in Node.js and SQL.',
  },
  skills: [
    { name: 'JavaScript', level: 'intermediate' },
    { name: 'Node.js', level: 'intermediate' },
    { name: 'SQL', level: 'intermediate' },
    { name: 'REST APIs', level: 'intermediate' },
    { name: 'Git', level: 'intermediate' },
    { name: 'MongoDB', level: 'intermediate' },
  ],
  projects: [
    {
      title: 'E-Commerce REST API',
      description: 'RESTful API with Node.js and MongoDB',
      technologies: ['JavaScript', 'Node.js', 'REST APIs', 'MongoDB'],
      projectUrl: null,
      githubUrl: 'https://github.com/synthetic/ecommerce-api',
    },
    {
      title: 'Database Reporting Tool',
      description: 'SQL query profiling and analysis scripts',
      technologies: ['SQL', 'Git'],
      projectUrl: null,
      githubUrl: 'https://github.com/synthetic/db-reports',
    },
  ],
  certifications: [
    {
      name: 'Node.js Application Development',
      issuer: 'OpenJS Foundation',
      issueDate: '2026-01-15',
      credentialUrl: null,
    },
  ],
  resumes: [
    {
      id: 'resume-synthetic-int-001',
      label: 'Intermediate Resume',
      parsed: {
        skills: [{ name: 'JavaScript' }, { name: 'Node.js' }, { name: 'SQL' }, { name: 'REST APIs' }],
        projects: [
          {
            title: 'E-Commerce REST API',
            technologies: ['JavaScript', 'Node.js', 'REST APIs'],
          },
        ],
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
        detail: 'Passed assessment for JavaScript with score 85.',
        reference: 'assessment-js-synthetic-001',
      },
      completedAt: new Date('2026-09-01T10:00:00.000Z'),
    },
  ],
};

// -----------------------------------------------------------------------------
// 3. Advanced Synthetic Profile (Backend Track)
// -----------------------------------------------------------------------------
const advancedProfileData = {
  id: 'synthetic-advanced-backend',
  tier: 'advanced',
  track: 'backend-developer',
  personal: {
    phone: '9876543212',
    dateOfBirth: '2003-08-10',
    gender: 'non-binary',
    city: 'Bengaluru',
    state: 'Karnataka',
  },
  academic: {
    collegeName: 'Indian Institute of Information Technology',
    degree: 'B.Tech',
    branch: 'Computer Science and Engineering',
    currentSemester: 8,
    graduationYear: 2025,
    cgpa: 9.3,
  },
  career: {
    targetRole: 'Backend Developer',
    preferredLocation: 'Bengaluru',
    careerInterests: ['Distributed Systems', 'Backend Architecture', 'Cloud Infrastructure'],
    bio: 'Graduating senior with verified competence across backend systems and databases.',
  },
  skills: [
    { name: 'JavaScript', level: 'advanced' },
    { name: 'Node.js', level: 'advanced' },
    { name: 'SQL', level: 'advanced' },
    { name: 'REST APIs', level: 'advanced' },
    { name: 'Docker', level: 'advanced' },
    { name: 'Redis', level: 'advanced' },
    { name: 'Git', level: 'advanced' },
    { name: 'PostgreSQL', level: 'advanced' },
  ],
  projects: [
    {
      title: 'High-Throughput Order Engine',
      description: 'Distributed microservice cluster with Node.js, Redis and PostgreSQL',
      technologies: ['JavaScript', 'Node.js', 'REST APIs', 'SQL', 'Docker', 'Redis', 'PostgreSQL', 'Git'],
      projectUrl: null,
      githubUrl: 'https://github.com/synthetic/order-engine',
    },
  ],
  certifications: [
    {
      name: 'AWS Certified Cloud Practitioner',
      issuer: 'Amazon Web Services',
      issueDate: '2026-02-10',
      credentialUrl: null,
    },
  ],
  resumes: [
    {
      id: 'resume-synthetic-adv-001',
      label: 'Advanced Resume',
      parsed: {
        skills: [
          { name: 'JavaScript' },
          { name: 'Node.js' },
          { name: 'SQL' },
          { name: 'REST APIs' },
          { name: 'Docker' },
          { name: 'Redis' },
        ],
        projects: [
          {
            title: 'High-Throughput Order Engine',
            technologies: ['Node.js', 'SQL', 'Docker', 'Redis'],
          },
        ],
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
        detail: 'Passed assessment for JavaScript with score 95.',
        reference: 'assessment-js-synthetic-adv',
      },
      completedAt: new Date('2026-09-10T10:00:00.000Z'),
    },
    {
      skill: 'Node.js',
      evidence: {
        source: EVIDENCE_SOURCES.INTERVIEW,
        strength: EVIDENCE_STRENGTH.VERIFIED,
        detail: 'Passed interview for Node.js with score 90.',
        reference: 'interview-node-synthetic-adv',
      },
      completedAt: new Date('2026-09-12T10:00:00.000Z'),
    },
    {
      skill: 'SQL',
      evidence: {
        source: EVIDENCE_SOURCES.ASSESSMENT,
        strength: EVIDENCE_STRENGTH.VERIFIED,
        detail: 'Passed assessment for SQL with score 92.',
        reference: 'assessment-sql-synthetic-adv',
      },
      completedAt: new Date('2026-09-15T10:00:00.000Z'),
    },
    {
      skill: 'REST APIs',
      evidence: {
        source: EVIDENCE_SOURCES.INTERVIEW,
        strength: EVIDENCE_STRENGTH.VERIFIED,
        detail: 'Passed interview for REST APIs with score 88.',
        reference: 'interview-rest-synthetic-adv',
      },
      completedAt: new Date('2026-09-18T10:00:00.000Z'),
    },
  ],
};

// -----------------------------------------------------------------------------
// 4. Frontend Synthetic Profiles Trio (Optional Multi-Track Regression)
// -----------------------------------------------------------------------------
const beginnerFrontendData = {
  id: 'synthetic-beginner-frontend',
  tier: 'beginner',
  track: 'frontend-developer',
  personal: {
    phone: '9876543213',
    dateOfBirth: '2005-04-18',
    gender: 'female',
    city: 'Indore',
    state: 'Madhya Pradesh',
  },
  academic: {
    collegeName: 'State Technical Institute',
    degree: 'B.Tech',
    branch: 'Information Technology',
    currentSemester: 2,
    graduationYear: 2028,
    cgpa: 7.5,
  },
  career: {
    targetRole: 'Frontend Developer',
    preferredLocation: 'Remote',
    careerInterests: ['Frontend Development', 'Web Design'],
    bio: 'First year IT student exploring HTML and styling.',
  },
  skills: [
    { name: 'HTML', level: 'beginner' },
    { name: 'CSS', level: 'beginner' },
  ],
  projects: [],
  certifications: [],
  resumes: [],
  verifiedEvidence: [],
};

const intermediateFrontendData = {
  id: 'synthetic-intermediate-frontend',
  tier: 'intermediate',
  track: 'frontend-developer',
  personal: {
    phone: '9876543214',
    dateOfBirth: '2004-09-11',
    gender: 'male',
    city: 'Hyderabad',
    state: 'Telangana',
  },
  academic: {
    collegeName: 'Hyderabad Engineering College',
    degree: 'B.Tech',
    branch: 'Computer Science and Engineering',
    currentSemester: 6,
    graduationYear: 2026,
    cgpa: 8.2,
  },
  career: {
    targetRole: 'Frontend Developer',
    preferredLocation: 'Hyderabad',
    careerInterests: ['Frontend Development', 'React', 'UI Design'],
    bio: 'Junior year engineer building reactive frontend applications.',
  },
  skills: [
    { name: 'HTML', level: 'intermediate' },
    { name: 'CSS', level: 'intermediate' },
    { name: 'JavaScript', level: 'intermediate' },
    { name: 'React', level: 'intermediate' },
    { name: 'TypeScript', level: 'intermediate' },
  ],
  projects: [
    {
      title: 'Interactive Dashboard App',
      description: 'React SPA with dynamic charts and component architecture',
      technologies: ['HTML', 'CSS', 'JavaScript', 'React', 'TypeScript'],
      projectUrl: null,
      githubUrl: 'https://github.com/synthetic/react-dashboard',
    },
  ],
  certifications: [],
  resumes: [],
  verifiedEvidence: [
    {
      skill: 'HTML',
      evidence: {
        source: EVIDENCE_SOURCES.ASSESSMENT,
        strength: EVIDENCE_STRENGTH.VERIFIED,
        detail: 'Passed assessment for HTML with score 90.',
        reference: 'assessment-html-int',
      },
      completedAt: new Date('2026-09-02T10:00:00.000Z'),
    },
  ],
};

const advancedFrontendData = {
  id: 'synthetic-advanced-frontend',
  tier: 'advanced',
  track: 'frontend-developer',
  personal: {
    phone: '9876543215',
    dateOfBirth: '2003-12-05',
    gender: 'female',
    city: 'Hyderabad',
    state: 'Telangana',
  },
  academic: {
    collegeName: 'International Institute of Information Technology',
    degree: 'B.Tech',
    branch: 'Computer Science and Engineering',
    currentSemester: 8,
    graduationYear: 2025,
    cgpa: 9.1,
  },
  career: {
    targetRole: 'Frontend Developer',
    preferredLocation: 'Hyderabad',
    careerInterests: ['Frontend Architecture', 'Web Performance', 'Design Systems'],
    bio: 'Graduating senior with verified expertise across modern frontend frameworks and performance.',
  },
  skills: [
    { name: 'HTML', level: 'advanced' },
    { name: 'CSS', level: 'advanced' },
    { name: 'JavaScript', level: 'advanced' },
    { name: 'React', level: 'advanced' },
    { name: 'TypeScript', level: 'advanced' },
    { name: 'Next.js', level: 'advanced' },
    { name: 'Tailwind CSS', level: 'advanced' },
  ],
  projects: [
    {
      title: 'Enterprise Design System',
      description: 'Accessible component library and Next.js microfrontend portal',
      technologies: ['HTML', 'CSS', 'JavaScript', 'React', 'TypeScript', 'Next.js', 'Tailwind CSS'],
      projectUrl: null,
      githubUrl: 'https://github.com/synthetic/design-system',
    },
  ],
  certifications: [],
  resumes: [
    {
      id: 'resume-synthetic-fe-adv',
      label: 'Advanced Frontend Resume',
      parsed: {
        skills: [{ name: 'HTML' }, { name: 'CSS' }, { name: 'JavaScript' }, { name: 'React' }, { name: 'TypeScript' }],
        projects: [{ title: 'Enterprise Design System', technologies: ['React', 'TypeScript'] }],
        certifications: [],
      },
    },
  ],
  verifiedEvidence: [
    {
      skill: 'HTML',
      evidence: {
        source: EVIDENCE_SOURCES.ASSESSMENT,
        strength: EVIDENCE_STRENGTH.VERIFIED,
        detail: 'Passed assessment for HTML with score 94.',
        reference: 'assessment-html-adv',
      },
      completedAt: new Date('2026-09-05T10:00:00.000Z'),
    },
    {
      skill: 'CSS',
      evidence: {
        source: EVIDENCE_SOURCES.ASSESSMENT,
        strength: EVIDENCE_STRENGTH.VERIFIED,
        detail: 'Passed assessment for CSS with score 91.',
        reference: 'assessment-css-adv',
      },
      completedAt: new Date('2026-09-07T10:00:00.000Z'),
    },
    {
      skill: 'JavaScript',
      evidence: {
        source: EVIDENCE_SOURCES.INTERVIEW,
        strength: EVIDENCE_STRENGTH.VERIFIED,
        detail: 'Passed interview for JavaScript with score 92.',
        reference: 'interview-js-fe-adv',
      },
      completedAt: new Date('2026-09-10T10:00:00.000Z'),
    },
    {
      skill: 'React',
      evidence: {
        source: EVIDENCE_SOURCES.ASSESSMENT,
        strength: EVIDENCE_STRENGTH.VERIFIED,
        detail: 'Passed assessment for React with score 90.',
        reference: 'assessment-react-adv',
      },
      completedAt: new Date('2026-09-12T10:00:00.000Z'),
    },
  ],
};

/**
 * Builds a reproducible, frozen synthetic profile package with precomputed twin and expected regression benchmarks.
 */
function assembleFixture(data, expectedBenchmarks) {
  const twin = buildCareerTwin({
    profile: {
      personal: data.personal,
      academic: data.academic,
      career: data.career,
      skills: data.skills,
      projects: data.projects,
      certifications: data.certifications,
      updatedAt: '2026-09-20T00:00:00.000Z',
    },
    resumes: data.resumes,
    verifiedEvidence: data.verifiedEvidence,
  });

  return deepFreeze({
    id: data.id,
    tier: data.tier,
    track: data.track,
    metadata: SYNTHETIC_FIXTURE_METADATA,
    profile: {
      personal: data.personal,
      academic: data.academic,
      career: data.career,
      skills: data.skills,
      projects: data.projects,
      certifications: data.certifications,
      updatedAt: '2026-09-20T00:00:00.000Z',
    },
    resumes: data.resumes,
    verifiedEvidence: data.verifiedEvidence,
    twin,
    expectedBenchmarks,
  });
}

// -----------------------------------------------------------------------------
// Assembled Synthetic Profiles Export
// -----------------------------------------------------------------------------
export const SYNTHETIC_PROFILES = deepFreeze({
  beginner: assembleFixture(beginnerProfileData, {
    targetRoleId: 'backend-developer',
    rankRoles: {
      maxScore: 35,
      expectedBand: 'early',
      matchedRequiredCount: 1,
      missingRequiredCount: 3,
    },
    skillGap: {
      required: {
        total: 4,
        missing: 3,
        claimed: 1,
        supported: 0,
        verified: 0,
      },
    },
    readiness: {
      expectedEvidenceStatus: READINESS_EVIDENCE_STATUS.PARTIAL,
      expectedBlockingSkillsCount: 4,
    },
    opportunities: {
      expectedMatchCount: 0,
    },
  }),

  intermediate: assembleFixture(intermediateProfileData, {
    targetRoleId: 'backend-developer',
    rankRoles: {
      minScore: 65,
      maxScore: 85,
      expectedBand: 'strong',
      matchedRequiredCount: 4,
      missingRequiredCount: 0,
    },
    skillGap: {
      required: {
        total: 4,
        missing: 0,
        claimed: 0,
        supported: 3,
        verified: 1,
      },
    },
    readiness: {
      expectedEvidenceStatus: READINESS_EVIDENCE_STATUS.SUPPORTED,
      expectedBlockingSkillsCount: 3,
    },
    opportunities: {
      expectedMatchCount: 0,
    },
  }),

  advanced: assembleFixture(advancedProfileData, {
    targetRoleId: 'backend-developer',
    rankRoles: {
      minScore: 85,
      maxScore: 100,
      expectedBand: 'strong',
      matchedRequiredCount: 4,
      missingRequiredCount: 0,
    },
    skillGap: {
      required: {
        total: 4,
        missing: 0,
        claimed: 0,
        supported: 0,
        verified: 4,
      },
    },
    readiness: {
      expectedEvidenceStatus: READINESS_EVIDENCE_STATUS.VERIFIED,
      expectedBlockingSkillsCount: 0,
    },
    opportunities: {
      expectedMatchCount: 1,
      expectedOpportunityId: 'curated_internal:backend-apprenticeship',
    },
  }),

  beginnerFrontend: assembleFixture(beginnerFrontendData, {
    targetRoleId: 'frontend-developer',
    rankRoles: {
      maxScore: 35,
      expectedBand: 'early',
      matchedRequiredCount: 2,
      missingRequiredCount: 2,
    },
    readiness: {
      expectedEvidenceStatus: READINESS_EVIDENCE_STATUS.PARTIAL,
      expectedBlockingSkillsCount: 4,
    },
    opportunities: {
      expectedMatchCount: 0,
    },
  }),

  intermediateFrontend: assembleFixture(intermediateFrontendData, {
    targetRoleId: 'frontend-developer',
    rankRoles: {
      minScore: 65,
      maxScore: 85,
      expectedBand: 'strong',
      matchedRequiredCount: 4,
      missingRequiredCount: 0,
    },
    readiness: {
      expectedEvidenceStatus: READINESS_EVIDENCE_STATUS.SUPPORTED,
      expectedBlockingSkillsCount: 3,
    },
    opportunities: {
      expectedMatchCount: 0,
    },
  }),

  advancedFrontend: assembleFixture(advancedFrontendData, {
    targetRoleId: 'frontend-developer',
    rankRoles: {
      minScore: 85,
      maxScore: 100,
      expectedBand: 'strong',
      matchedRequiredCount: 4,
      missingRequiredCount: 0,
    },
    readiness: {
      expectedEvidenceStatus: READINESS_EVIDENCE_STATUS.VERIFIED,
      expectedBlockingSkillsCount: 0,
    },
    opportunities: {
      expectedMatchCount: 1,
      expectedOpportunityId: 'curated_internal:frontend-apprenticeship',
    },
  }),
});

/**
 * Accessor by tier and optional track for test suites.
 */
export function getSyntheticProfile(tier, track = 'backend') {
  assertNonProductionEnvironment();

  if (track === 'backend') {
    const fixture = SYNTHETIC_PROFILES[tier];
    if (!fixture) {
      throw new Error(`Unknown synthetic profile tier: ${tier}`);
    }
    return fixture;
  }

  if (track === 'frontend') {
    const key = `${tier}Frontend`;
    const fixture = SYNTHETIC_PROFILES[key];
    if (!fixture) {
      throw new Error(`Unknown synthetic frontend profile tier: ${tier}`);
    }
    return fixture;
  }

  throw new Error(`Unsupported synthetic track: ${track}`);
}
