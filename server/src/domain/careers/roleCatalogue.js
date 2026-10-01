/**
 * The career roles Nexora can match a student against (Task 08).
 *
 * ## What this is, and is not
 *
 * This is a **controlled, curated internal reference knowledge base**, written by hand
 * and vetted by curriculum engineers. It is not derived from a job-board scrape, a
 * labour-market dataset or a survey, and nothing here is presented as a market statistic.
 * There are no salary figures, no demand or growth numbers and no hiring rates.
 *
 * What it contains is an authoritative, structured answer to:
 * - "Which skills are required vs preferred for this role?"
 * - "What proficiency levels and evidence strengths are expected?"
 * - "What prerequisite competencies and evidence must be demonstrated?"
 * - "What are the competency relationships that define this role?"
 *
 * ## Required vs preferred
 *
 * `required` means a role is not really that role without it. Keep these lists short.
 * `preferred` strengthens a candidacy without being fundamental.
 */

import {
  ROLE_STATUS,
  ROLE_PROVENANCE,
  isEligibleForRecommendation,
} from './roleQualityGate.js';

export { ROLE_STATUS, ROLE_PROVENANCE, isEligibleForRecommendation } from './roleQualityGate.js';

/**
 * Version of this catalogue.
 */
export const CATALOGUE_VERSION = 2;

/** Where the content came from, recorded honestly on every recommendation. */
export const CATALOGUE_SOURCE = {
  type: 'curated',
  description:
    'Hand-written, structured internal reference catalogue of common entry-level technology roles with competency dependency graphs and evidence expectations.',
  version: CATALOGUE_VERSION,
};

export const ROLE_CATEGORIES = {
  ENGINEERING: 'engineering',
  DATA: 'data',
  INFRASTRUCTURE: 'infrastructure',
  DESIGN: 'design',
  QUALITY: 'quality',
};

const COMPUTING_BACKGROUNDS = [
  'computer science',
  'computer science and engineering',
  'information technology',
  'software engineering',
  'computer engineering',
];

/**
 * Master Controlled Career Role Catalogue.
 */
export const CAREER_ROLES = [
  {
    canonicalId: 'role_backend_developer',
    id: 'backend-developer',
    title: 'Backend Developer',
    category: ROLE_CATEGORIES.ENGINEERING,
    summary: 'Builds the server-side logic, APIs and data access behind an application.',
    requiredSkills: ['JavaScript', 'Node.js', 'REST APIs', 'SQL'],
    preferredSkills: ['Express.js', 'MongoDB', 'PostgreSQL', 'Docker', 'Redis', 'Git'],
    relatedTechnologies: ['Nginx', 'GraphQL', 'RabbitMQ', 'Kubernetes'],
    commonBackgrounds: COMPUTING_BACKGROUNDS,
    prerequisites: ['sk_programming_fundamentals'],
    proficiencyExpectations: {
      overallMinimum: 'intermediate',
      skills: {
        sk_nodejs: 'intermediate',
        sk_sql: 'intermediate',
        sk_rest_apis: 'intermediate',
        sk_javascript: 'intermediate',
      },
    },
    evidenceExpectations: {
      minimumSupportedProjects: 1,
      minimumVerifiedSkills: 1,
      acceptableEvidenceTypes: ['project_evidence', 'assessment_code', 'assessment_mcq', 'human_interview'],
      portfolioGuidance: 'At least one deployed backend service or API with unit tests, schema validation, and persistence.',
    },
    competencyRelationships: [
      { sourceSkill: 'sk_nodejs', targetSkill: 'sk_rest_apis', relationshipType: 'implements', detail: 'Node.js runtime hosts RESTful HTTP APIs' },
      { sourceSkill: 'sk_sql', targetSkill: 'sk_nodejs', relationshipType: 'data_access', detail: 'Backend service interfaces with relational databases' },
    ],
    metadata: {
      version: '2.0.0',
      status: ROLE_STATUS.ACTIVE,
      provenance: ROLE_PROVENANCE.CURATED,
      lastReviewedAt: '2026-09-15',
      reviewedBy: 'Nexora Curriculum Committee',
      changeLog: ['Standardized schema with canonical skillIds, competency relationships, and quality gate gating.'],
    },
  },
  {
    canonicalId: 'role_frontend_developer',
    id: 'frontend-developer',
    title: 'Frontend Developer',
    category: ROLE_CATEGORIES.ENGINEERING,
    summary: 'Builds the interface users interact with, in the browser.',
    requiredSkills: ['HTML', 'CSS', 'JavaScript', 'React'],
    preferredSkills: ['TypeScript', 'Next.js', 'Tailwind CSS', 'Git', 'Accessibility'],
    relatedTechnologies: ['Vue.js', 'Webpack', 'Vite', 'Figma'],
    commonBackgrounds: COMPUTING_BACKGROUNDS,
    prerequisites: ['sk_programming_fundamentals'],
    proficiencyExpectations: {
      overallMinimum: 'intermediate',
      skills: {
        sk_javascript: 'intermediate',
        sk_react: 'intermediate',
        sk_html: 'intermediate',
        sk_css: 'intermediate',
      },
    },
    evidenceExpectations: {
      minimumSupportedProjects: 1,
      minimumVerifiedSkills: 1,
      acceptableEvidenceTypes: ['project_evidence', 'assessment_code', 'assessment_mcq'],
      portfolioGuidance: 'Responsive web application with component state management and clean accessibility.',
    },
    competencyRelationships: [
      { sourceSkill: 'sk_javascript', targetSkill: 'sk_react', relationshipType: 'foundation', detail: 'React is built on modern ES6+ JavaScript concepts' },
      { sourceSkill: 'sk_html', targetSkill: 'sk_css', relationshipType: 'styling', detail: 'CSS styles semantic HTML markup' },
    ],
    metadata: {
      version: '2.0.0',
      status: ROLE_STATUS.ACTIVE,
      provenance: ROLE_PROVENANCE.CURATED,
      lastReviewedAt: '2026-09-15',
      reviewedBy: 'Nexora Curriculum Committee',
      changeLog: ['Standardized schema with canonical skillIds, competency relationships, and quality gate gating.'],
    },
  },
  {
    canonicalId: 'role_full_stack_developer',
    id: 'full-stack-developer',
    title: 'Full Stack Developer',
    category: ROLE_CATEGORIES.ENGINEERING,
    summary: 'Works across both the interface and the server side of an application.',
    requiredSkills: ['JavaScript', 'React', 'Node.js', 'SQL'],
    preferredSkills: ['TypeScript', 'Express.js', 'MongoDB', 'REST APIs', 'Git', 'Docker'],
    relatedTechnologies: ['Next.js', 'GraphQL', 'AWS'],
    commonBackgrounds: COMPUTING_BACKGROUNDS,
    prerequisites: ['sk_programming_fundamentals'],
    proficiencyExpectations: {
      overallMinimum: 'intermediate',
      skills: {
        sk_javascript: 'intermediate',
        sk_react: 'intermediate',
        sk_nodejs: 'intermediate',
        sk_sql: 'intermediate',
      },
    },
    evidenceExpectations: {
      minimumSupportedProjects: 2,
      minimumVerifiedSkills: 1,
      acceptableEvidenceTypes: ['project_evidence', 'assessment_code', 'human_interview'],
      portfolioGuidance: 'Full stack system with authenticated client, decoupled API, and persistent database.',
    },
    competencyRelationships: [
      { sourceSkill: 'sk_react', targetSkill: 'sk_nodejs', relationshipType: 'client_server', detail: 'React client consumes Node.js backend services' },
    ],
    metadata: {
      version: '2.0.0',
      status: ROLE_STATUS.ACTIVE,
      provenance: ROLE_PROVENANCE.CURATED,
      lastReviewedAt: '2026-09-15',
      reviewedBy: 'Nexora Curriculum Committee',
      changeLog: ['Standardized schema with canonical skillIds, competency relationships, and quality gate gating.'],
    },
  },
  {
    canonicalId: 'role_data_analyst',
    id: 'data-analyst',
    title: 'Data Analyst',
    category: ROLE_CATEGORIES.DATA,
    summary: 'Turns data into answers that someone can act on.',
    requiredSkills: ['SQL', 'Excel', 'Data Visualisation'],
    preferredSkills: ['Python', 'Power BI', 'Tableau', 'Statistics'],
    relatedTechnologies: ['Pandas', 'Looker', 'BigQuery'],
    commonBackgrounds: [...COMPUTING_BACKGROUNDS, 'statistics', 'mathematics', 'economics'],
    prerequisites: ['sk_programming_fundamentals'],
    proficiencyExpectations: {
      overallMinimum: 'intermediate',
      skills: {
        sk_sql: 'intermediate',
      },
    },
    evidenceExpectations: {
      minimumSupportedProjects: 1,
      minimumVerifiedSkills: 0,
      acceptableEvidenceTypes: ['project_evidence', 'assessment_mcq'],
      portfolioGuidance: 'Structured analytical report or dashboard answering concrete business questions from tabular data.',
    },
    competencyRelationships: [
      { sourceSkill: 'sk_sql', targetSkill: 'sk_data_structures', relationshipType: 'querying', detail: 'Extracts relational datasets for analysis' },
    ],
    metadata: {
      version: '2.0.0',
      status: ROLE_STATUS.ACTIVE,
      provenance: ROLE_PROVENANCE.CURATED,
      lastReviewedAt: '2026-09-15',
      reviewedBy: 'Nexora Curriculum Committee',
      changeLog: ['Standardized schema with canonical skillIds, competency relationships, and quality gate gating.'],
    },
  },
  {
    canonicalId: 'role_data_scientist',
    id: 'data-scientist',
    title: 'Data Scientist',
    category: ROLE_CATEGORIES.DATA,
    summary: 'Builds statistical and machine-learning models to answer harder questions.',
    requiredSkills: ['Python', 'Statistics', 'Machine Learning', 'SQL'],
    preferredSkills: ['Pandas', 'NumPy', 'scikit-learn', 'Data Visualisation', 'Deep Learning'],
    relatedTechnologies: ['TensorFlow', 'PyTorch', 'Jupyter'],
    commonBackgrounds: [...COMPUTING_BACKGROUNDS, 'statistics', 'mathematics'],
    prerequisites: ['sk_programming_fundamentals', 'sk_python'],
    proficiencyExpectations: {
      overallMinimum: 'intermediate',
      skills: {
        sk_python: 'intermediate',
        sk_sql: 'intermediate',
      },
    },
    evidenceExpectations: {
      minimumSupportedProjects: 1,
      minimumVerifiedSkills: 1,
      acceptableEvidenceTypes: ['project_evidence', 'assessment_code'],
      portfolioGuidance: 'Jupyter notebook or reproducible ML model with exploratory data analysis, feature engineering, and evaluation metrics.',
    },
    competencyRelationships: [
      { sourceSkill: 'sk_python', targetSkill: 'sk_data_structures', relationshipType: 'data_processing', detail: 'Python packages implement core statistical algorithms' },
    ],
    metadata: {
      version: '2.0.0',
      status: ROLE_STATUS.ACTIVE,
      provenance: ROLE_PROVENANCE.CURATED,
      lastReviewedAt: '2026-09-15',
      reviewedBy: 'Nexora Curriculum Committee',
      changeLog: ['Standardized schema with canonical skillIds, competency relationships, and quality gate gating.'],
    },
  },
  {
    canonicalId: 'role_devops_engineer',
    id: 'devops-engineer',
    title: 'DevOps Engineer',
    category: ROLE_CATEGORIES.INFRASTRUCTURE,
    summary: 'Builds and runs the systems that ship and operate software.',
    requiredSkills: ['Linux', 'Docker', 'CI/CD', 'Git'],
    preferredSkills: ['Kubernetes', 'AWS', 'Terraform', 'Bash', 'Python'],
    relatedTechnologies: ['Jenkins', 'Prometheus', 'Ansible'],
    commonBackgrounds: COMPUTING_BACKGROUNDS,
    prerequisites: ['sk_programming_fundamentals'],
    proficiencyExpectations: {
      overallMinimum: 'intermediate',
      skills: {
        sk_docker: 'intermediate',
        sk_git: 'intermediate',
      },
    },
    evidenceExpectations: {
      minimumSupportedProjects: 1,
      minimumVerifiedSkills: 1,
      acceptableEvidenceTypes: ['project_evidence', 'assessment_code'],
      portfolioGuidance: 'Automated CI/CD pipeline building, testing, and containerizing a multi-tier application.',
    },
    competencyRelationships: [
      { sourceSkill: 'sk_docker', targetSkill: 'sk_kubernetes', relationshipType: 'orchestration', detail: 'Containers provide execution units for container orchestration' },
    ],
    metadata: {
      version: '2.0.0',
      status: ROLE_STATUS.ACTIVE,
      provenance: ROLE_PROVENANCE.CURATED,
      lastReviewedAt: '2026-09-15',
      reviewedBy: 'Nexora Curriculum Committee',
      changeLog: ['Standardized schema with canonical skillIds, competency relationships, and quality gate gating.'],
    },
  },
  {
    canonicalId: 'role_mobile_developer',
    id: 'mobile-developer',
    title: 'Mobile Application Developer',
    category: ROLE_CATEGORIES.ENGINEERING,
    summary: 'Builds applications that run on phones and tablets.',
    requiredSkills: ['Mobile Development', 'REST APIs'],
    preferredSkills: ['React Native', 'Flutter', 'Kotlin', 'Swift', 'Git'],
    relatedTechnologies: ['Firebase', 'Android Studio', 'Xcode'],
    commonBackgrounds: COMPUTING_BACKGROUNDS,
    prerequisites: ['sk_programming_fundamentals'],
    proficiencyExpectations: {
      overallMinimum: 'intermediate',
      skills: {},
    },
    evidenceExpectations: {
      minimumSupportedProjects: 1,
      minimumVerifiedSkills: 0,
      acceptableEvidenceTypes: ['project_evidence', 'assessment_code'],
      portfolioGuidance: 'Functional mobile application with local caching and backend API integration.',
    },
    competencyRelationships: [],
    metadata: {
      version: '2.0.0',
      status: ROLE_STATUS.ACTIVE,
      provenance: ROLE_PROVENANCE.CURATED,
      lastReviewedAt: '2026-09-15',
      reviewedBy: 'Nexora Curriculum Committee',
      changeLog: ['Standardized schema with canonical skillIds, competency relationships, and quality gate gating.'],
    },
  },
  {
    canonicalId: 'role_qa_engineer',
    id: 'qa-engineer',
    title: 'QA / Test Engineer',
    category: ROLE_CATEGORIES.QUALITY,
    summary: 'Finds out whether software actually works, and automates the finding out.',
    requiredSkills: ['Testing', 'Test Automation'],
    preferredSkills: ['Selenium', 'JavaScript', 'Python', 'CI/CD', 'SQL'],
    relatedTechnologies: ['Cypress', 'Playwright', 'JUnit', 'Postman'],
    commonBackgrounds: COMPUTING_BACKGROUNDS,
    prerequisites: ['sk_programming_fundamentals'],
    proficiencyExpectations: {
      overallMinimum: 'intermediate',
      skills: {},
    },
    evidenceExpectations: {
      minimumSupportedProjects: 1,
      minimumVerifiedSkills: 0,
      acceptableEvidenceTypes: ['project_evidence', 'assessment_code'],
      portfolioGuidance: 'Automated test suite with regression, integration, and end-to-end assertions.',
    },
    competencyRelationships: [],
    metadata: {
      version: '2.0.0',
      status: ROLE_STATUS.ACTIVE,
      provenance: ROLE_PROVENANCE.CURATED,
      lastReviewedAt: '2026-09-15',
      reviewedBy: 'Nexora Curriculum Committee',
      changeLog: ['Standardized schema with canonical skillIds, competency relationships, and quality gate gating.'],
    },
  },
  {
    canonicalId: 'role_ui_ux_designer',
    id: 'ui-ux-designer',
    title: 'UI/UX Designer',
    category: ROLE_CATEGORIES.DESIGN,
    summary: 'Designs how a product looks and how it is used.',
    requiredSkills: ['UI Design', 'UX Research', 'Figma'],
    preferredSkills: ['Prototyping', 'Accessibility', 'Design Systems', 'HTML', 'CSS'],
    relatedTechnologies: ['Adobe XD', 'Sketch', 'Framer'],
    commonBackgrounds: [...COMPUTING_BACKGROUNDS, 'design', 'human-computer interaction'],
    prerequisites: [],
    proficiencyExpectations: {
      overallMinimum: 'intermediate',
      skills: {},
    },
    evidenceExpectations: {
      minimumSupportedProjects: 1,
      minimumVerifiedSkills: 0,
      acceptableEvidenceTypes: ['project_evidence'],
      portfolioGuidance: 'Case study demonstrating user research, wireframing, high-fidelity mockups, and clickable prototypes.',
    },
    competencyRelationships: [],
    metadata: {
      version: '2.0.0',
      status: ROLE_STATUS.ACTIVE,
      provenance: ROLE_PROVENANCE.CURATED,
      lastReviewedAt: '2026-09-15',
      reviewedBy: 'Nexora Curriculum Committee',
      changeLog: ['Standardized schema with canonical skillIds, competency relationships, and quality gate gating.'],
    },
  },
  {
    canonicalId: 'role_cloud_engineer',
    id: 'cloud-engineer',
    title: 'Cloud Engineer',
    category: ROLE_CATEGORIES.INFRASTRUCTURE,
    summary: 'Designs and runs systems on cloud platforms.',
    requiredSkills: ['Cloud Computing', 'Linux', 'Networking'],
    preferredSkills: ['AWS', 'Docker', 'Kubernetes', 'Terraform', 'Python'],
    relatedTechnologies: ['Google Cloud', 'Azure', 'CloudFormation'],
    commonBackgrounds: COMPUTING_BACKGROUNDS,
    prerequisites: ['sk_programming_fundamentals'],
    proficiencyExpectations: {
      overallMinimum: 'intermediate',
      skills: {},
    },
    evidenceExpectations: {
      minimumSupportedProjects: 1,
      minimumVerifiedSkills: 1,
      acceptableEvidenceTypes: ['project_evidence', 'assessment_code'],
      portfolioGuidance: 'Terraform or CloudFormation scripts provisioning cloud infrastructure with security and IAM policies.',
    },
    competencyRelationships: [],
    metadata: {
      version: '2.0.0',
      status: ROLE_STATUS.ACTIVE,
      provenance: ROLE_PROVENANCE.CURATED,
      lastReviewedAt: '2026-09-15',
      reviewedBy: 'Nexora Curriculum Committee',
      changeLog: ['Standardized schema with canonical skillIds, competency relationships, and quality gate gating.'],
    },
  },
];

const ROLES_BY_ID = new Map();
for (const role of CAREER_ROLES) {
  ROLES_BY_ID.set(role.id, role);
  if (role.canonicalId) {
    ROLES_BY_ID.set(role.canonicalId, role);
  }
}

const CATALOGUE_SKILL_NAMES = Object.freeze([
  ...new Set(
    CAREER_ROLES.flatMap((role) => [
      ...role.requiredSkills,
      ...role.preferredSkills,
      ...role.relatedTechnologies,
    ]),
  ),
]);

/**
 * Looks up one role by slug id (e.g. "backend-developer") or canonical id ("role_backend_developer").
 */
export function findRole(roleId) {
  if (!roleId || typeof roleId !== 'string') return null;
  return ROLES_BY_ID.get(roleId) ?? null;
}

/**
 * Returns only authoritative, quality-gate passed active roles eligible for recommendation logic.
 */
export function getAuthoritativeRoles() {
  return CAREER_ROLES.filter(isEligibleForRecommendation);
}

/**
 * Every skill name the catalogue mentions.
 */
export function catalogueSkillNames() {
  return [...CATALOGUE_SKILL_NAMES];
}
