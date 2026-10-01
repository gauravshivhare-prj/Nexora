/**
 * Complete Skill Taxonomy, Ontology & Dependency Graph System (Task 03)
 *
 * Provides a structured, controlled knowledge model for technical competencies,
 * prerequisite directed acyclic graphs (DAGs), alias resolution, and career
 * relevance mappings across Nexora.
 */

import { skillKey, skillDisplayName } from './skillKey.js';

export const ONTOLOGY_VERSION = '3.0.0';

/**
 * Standard Competency Domains.
 */
export const SKILL_CATEGORY = Object.freeze({
  CORE_CS: 'core_cs',
  FRONTEND: 'frontend',
  BACKEND: 'backend',
  DATABASE: 'database',
  DEVOPS: 'devops',
  CLOUD: 'cloud',
  SECURITY: 'security',
  DATA_AI: 'data_ai',
});

/**
 * Standard Evidence Types acceptable for skill verification.
 */
export const VALID_EVIDENCE_TYPE = Object.freeze({
  PROFILE_CLAIM: 'profile_claim',
  RESUME_MENTION: 'resume_mention',
  PROJECT_EVIDENCE: 'project_evidence',
  ASSESSMENT_MCQ: 'assessment_mcq',
  ASSESSMENT_CODE: 'assessment_code',
  HUMAN_INTERVIEW: 'human_interview',
  AI_INTERVIEW_ADVISORY: 'ai_interview_advisory',
});

/**
 * The Master Controlled Skill Catalogue.
 *
 * Each record defines:
 * - id: Unique canonical skill identifier (sk_*)
 * - key: Normalized alphanumeric comparison key
 * - name: Official display spelling
 * - category: Domain category
 * - aliases: Array of known alternate spellings or abbreviations
 * - prerequisites: Array of prerequisite canonical skill IDs (Must form an acyclic DAG)
 * - subSkills: Granular sub-competencies under this skill
 * - relatedSkills: Associated complementary skill IDs
 * - difficulty: 1 (Novice) to 5 (Mastery)
 * - validEvidenceTypes: Acceptable evidence channels
 * - roleRelevance: Relevance weight per role (0.0 to 1.0)
 */
export const CANONICAL_SKILL_CATALOG = Object.freeze([
  // --- CORE CS ---
  {
    id: 'sk_programming_fundamentals',
    key: 'programmingfundamentals',
    name: 'Programming Fundamentals',
    category: SKILL_CATEGORY.CORE_CS,
    aliases: ['coding basics', 'intro to programming', 'computer programming'],
    prerequisites: [],
    subSkills: ['variables', 'control_flow', 'functions', 'loops'],
    relatedSkills: ['sk_data_structures'],
    difficulty: 1,
    validEvidenceTypes: [
      VALID_EVIDENCE_TYPE.PROFILE_CLAIM,
      VALID_EVIDENCE_TYPE.PROJECT_EVIDENCE,
      VALID_EVIDENCE_TYPE.ASSESSMENT_MCQ,
      VALID_EVIDENCE_TYPE.ASSESSMENT_CODE,
      VALID_EVIDENCE_TYPE.HUMAN_INTERVIEW,
    ],
    roleRelevance: {
      'frontend-developer': 1.0,
      'backend-developer': 1.0,
      'full-stack-developer': 1.0,
      'devops-engineer': 0.8,
      'data-engineer': 1.0,
    },
  },
  {
    id: 'sk_data_structures',
    key: 'datastructures',
    name: 'Data Structures & Algorithms',
    category: SKILL_CATEGORY.CORE_CS,
    aliases: ['dsa', 'data structures and algorithms', 'algorithms and data structures'],
    prerequisites: ['sk_programming_fundamentals'],
    subSkills: ['arrays', 'linked_lists', 'trees', 'graphs', 'sorting_searching'],
    relatedSkills: ['sk_system_design'],
    difficulty: 3,
    validEvidenceTypes: [
      VALID_EVIDENCE_TYPE.ASSESSMENT_MCQ,
      VALID_EVIDENCE_TYPE.ASSESSMENT_CODE,
      VALID_EVIDENCE_TYPE.HUMAN_INTERVIEW,
      VALID_EVIDENCE_TYPE.PROJECT_EVIDENCE,
    ],
    roleRelevance: {
      'frontend-developer': 0.8,
      'backend-developer': 1.0,
      'full-stack-developer': 0.9,
      'devops-engineer': 0.6,
      'data-engineer': 0.9,
    },
  },
  {
    id: 'sk_git',
    key: 'git',
    name: 'Git',
    category: SKILL_CATEGORY.CORE_CS,
    aliases: ['version control', 'gitlab', 'git version control'],
    prerequisites: ['sk_programming_fundamentals'],
    subSkills: ['branching', 'merging', 'rebasing', 'commit_hygiene'],
    relatedSkills: ['sk_ci_cd'],
    difficulty: 2,
    validEvidenceTypes: [
      VALID_EVIDENCE_TYPE.PROFILE_CLAIM,
      VALID_EVIDENCE_TYPE.PROJECT_EVIDENCE,
      VALID_EVIDENCE_TYPE.ASSESSMENT_MCQ,
      VALID_EVIDENCE_TYPE.HUMAN_INTERVIEW,
    ],
    roleRelevance: {
      'frontend-developer': 0.9,
      'backend-developer': 0.9,
      'full-stack-developer': 1.0,
      'devops-engineer': 1.0,
      'data-engineer': 0.8,
    },
  },

  // --- FRONTEND ---
  {
    id: 'sk_html_css',
    key: 'htmlcss',
    name: 'HTML & CSS',
    category: SKILL_CATEGORY.FRONTEND,
    aliases: ['html', 'css', 'html5', 'css3', 'web markup', 'responsive design'],
    prerequisites: [],
    subSkills: ['semantic_html', 'flexbox', 'css_grid', 'responsive_design', 'accessibility'],
    relatedSkills: ['sk_javascript', 'sk_tailwind'],
    difficulty: 1,
    validEvidenceTypes: [
      VALID_EVIDENCE_TYPE.PROFILE_CLAIM,
      VALID_EVIDENCE_TYPE.PROJECT_EVIDENCE,
      VALID_EVIDENCE_TYPE.ASSESSMENT_MCQ,
      VALID_EVIDENCE_TYPE.HUMAN_INTERVIEW,
    ],
    roleRelevance: {
      'frontend-developer': 1.0,
      'full-stack-developer': 0.9,
      'backend-developer': 0.3,
      'devops-engineer': 0.1,
    },
  },
  {
    id: 'sk_javascript',
    key: 'javascript',
    name: 'JavaScript',
    category: SKILL_CATEGORY.FRONTEND,
    aliases: ['js', 'ecmascript', 'es6', 'es2020', 'modern javascript'],
    prerequisites: ['sk_programming_fundamentals', 'sk_html_css'],
    subSkills: ['closures', 'promises', 'async_await', 'dom_api', 'event_loop'],
    relatedSkills: ['sk_typescript', 'sk_react', 'sk_nodejs'],
    difficulty: 2,
    validEvidenceTypes: [
      VALID_EVIDENCE_TYPE.PROFILE_CLAIM,
      VALID_EVIDENCE_TYPE.PROJECT_EVIDENCE,
      VALID_EVIDENCE_TYPE.ASSESSMENT_MCQ,
      VALID_EVIDENCE_TYPE.ASSESSMENT_CODE,
      VALID_EVIDENCE_TYPE.HUMAN_INTERVIEW,
    ],
    roleRelevance: {
      'frontend-developer': 1.0,
      'full-stack-developer': 1.0,
      'backend-developer': 0.8,
      'devops-engineer': 0.3,
    },
  },
  {
    id: 'sk_typescript',
    key: 'typescript',
    name: 'TypeScript',
    category: SKILL_CATEGORY.FRONTEND,
    aliases: ['ts', 'typed javascript'],
    prerequisites: ['sk_javascript'],
    subSkills: ['generics', 'type_inference', 'interfaces', 'utility_types'],
    relatedSkills: ['sk_react', 'sk_nodejs'],
    difficulty: 3,
    validEvidenceTypes: [
      VALID_EVIDENCE_TYPE.PROFILE_CLAIM,
      VALID_EVIDENCE_TYPE.PROJECT_EVIDENCE,
      VALID_EVIDENCE_TYPE.ASSESSMENT_MCQ,
      VALID_EVIDENCE_TYPE.ASSESSMENT_CODE,
      VALID_EVIDENCE_TYPE.HUMAN_INTERVIEW,
    ],
    roleRelevance: {
      'frontend-developer': 0.9,
      'full-stack-developer': 0.9,
      'backend-developer': 0.8,
      'devops-engineer': 0.2,
    },
  },
  {
    id: 'sk_react',
    key: 'react',
    name: 'React',
    category: SKILL_CATEGORY.FRONTEND,
    aliases: ['reactjs', 'react.js', 'react framework'],
    prerequisites: ['sk_javascript'],
    subSkills: ['hooks', 'jsx', 'component_lifecycle', 'state_management', 'custom_hooks'],
    relatedSkills: ['sk_typescript', 'sk_tailwind', 'sk_nextjs'],
    difficulty: 3,
    validEvidenceTypes: [
      VALID_EVIDENCE_TYPE.PROFILE_CLAIM,
      VALID_EVIDENCE_TYPE.PROJECT_EVIDENCE,
      VALID_EVIDENCE_TYPE.ASSESSMENT_MCQ,
      VALID_EVIDENCE_TYPE.ASSESSMENT_CODE,
      VALID_EVIDENCE_TYPE.HUMAN_INTERVIEW,
    ],
    roleRelevance: {
      'frontend-developer': 1.0,
      'full-stack-developer': 0.9,
      'backend-developer': 0.2,
    },
  },
  {
    id: 'sk_nextjs',
    key: 'nextjs',
    name: 'Next.js',
    category: SKILL_CATEGORY.FRONTEND,
    aliases: ['next', 'next.js', 'nextjs framework'],
    prerequisites: ['sk_react'],
    subSkills: ['server_components', 'app_router', 'ssr_ssg', 'api_routes'],
    relatedSkills: ['sk_react', 'sk_typescript'],
    difficulty: 3,
    validEvidenceTypes: [
      VALID_EVIDENCE_TYPE.PROFILE_CLAIM,
      VALID_EVIDENCE_TYPE.PROJECT_EVIDENCE,
      VALID_EVIDENCE_TYPE.ASSESSMENT_MCQ,
      VALID_EVIDENCE_TYPE.HUMAN_INTERVIEW,
    ],
    roleRelevance: {
      'frontend-developer': 0.9,
      'full-stack-developer': 0.9,
    },
  },
  {
    id: 'sk_tailwind',
    key: 'tailwind',
    name: 'Tailwind CSS',
    category: SKILL_CATEGORY.FRONTEND,
    aliases: ['tailwindcss', 'tailwind styling'],
    prerequisites: ['sk_html_css'],
    subSkills: ['utility_classes', 'responsive_variants', 'theme_customization'],
    relatedSkills: ['sk_react'],
    difficulty: 2,
    validEvidenceTypes: [
      VALID_EVIDENCE_TYPE.PROFILE_CLAIM,
      VALID_EVIDENCE_TYPE.PROJECT_EVIDENCE,
      VALID_EVIDENCE_TYPE.ASSESSMENT_MCQ,
    ],
    roleRelevance: {
      'frontend-developer': 0.8,
      'full-stack-developer': 0.7,
      'backend-developer': 0.1,
    },
  },

  // --- BACKEND ---
  {
    id: 'sk_nodejs',
    key: 'nodejs',
    name: 'Node.js',
    category: SKILL_CATEGORY.BACKEND,
    aliases: ['node', 'node js', 'server-side javascript'],
    prerequisites: ['sk_javascript'],
    subSkills: ['event_loop', 'streams', 'buffers', 'fs_module', 'http_module'],
    relatedSkills: ['sk_express', 'sk_typescript'],
    difficulty: 3,
    validEvidenceTypes: [
      VALID_EVIDENCE_TYPE.PROFILE_CLAIM,
      VALID_EVIDENCE_TYPE.PROJECT_EVIDENCE,
      VALID_EVIDENCE_TYPE.ASSESSMENT_MCQ,
      VALID_EVIDENCE_TYPE.ASSESSMENT_CODE,
      VALID_EVIDENCE_TYPE.HUMAN_INTERVIEW,
    ],
    roleRelevance: {
      'backend-developer': 1.0,
      'full-stack-developer': 1.0,
      'frontend-developer': 0.5,
      'devops-engineer': 0.4,
    },
  },
  {
    id: 'sk_express',
    key: 'express',
    name: 'Express.js',
    category: SKILL_CATEGORY.BACKEND,
    aliases: ['express', 'expressjs', 'node express'],
    prerequisites: ['sk_nodejs'],
    subSkills: ['routing', 'middleware', 'error_handling', 'request_pipeline'],
    relatedSkills: ['sk_rest_api'],
    difficulty: 2,
    validEvidenceTypes: [
      VALID_EVIDENCE_TYPE.PROFILE_CLAIM,
      VALID_EVIDENCE_TYPE.PROJECT_EVIDENCE,
      VALID_EVIDENCE_TYPE.ASSESSMENT_MCQ,
      VALID_EVIDENCE_TYPE.HUMAN_INTERVIEW,
    ],
    roleRelevance: {
      'backend-developer': 0.9,
      'full-stack-developer': 0.9,
      'frontend-developer': 0.3,
    },
  },
  {
    id: 'sk_rest_api',
    key: 'restapi',
    name: 'REST APIs',
    category: SKILL_CATEGORY.BACKEND,
    aliases: ['rest', 'restful apis', 'api design', 'restful web services'],
    prerequisites: ['sk_programming_fundamentals'],
    subSkills: ['http_methods', 'status_codes', 'idempotency', 'api_versioning'],
    relatedSkills: ['sk_nodejs', 'sk_express'],
    difficulty: 2,
    validEvidenceTypes: [
      VALID_EVIDENCE_TYPE.PROFILE_CLAIM,
      VALID_EVIDENCE_TYPE.PROJECT_EVIDENCE,
      VALID_EVIDENCE_TYPE.ASSESSMENT_MCQ,
      VALID_EVIDENCE_TYPE.HUMAN_INTERVIEW,
    ],
    roleRelevance: {
      'backend-developer': 1.0,
      'full-stack-developer': 1.0,
      'frontend-developer': 0.8,
    },
  },
  {
    id: 'sk_python',
    key: 'python',
    name: 'Python',
    category: SKILL_CATEGORY.BACKEND,
    aliases: ['py', 'python3'],
    prerequisites: ['sk_programming_fundamentals'],
    subSkills: ['comprehensions', 'generators', 'decorators', 'virtualenv', 'type_hints'],
    relatedSkills: ['sk_sql', 'sk_data_structures'],
    difficulty: 2,
    validEvidenceTypes: [
      VALID_EVIDENCE_TYPE.PROFILE_CLAIM,
      VALID_EVIDENCE_TYPE.PROJECT_EVIDENCE,
      VALID_EVIDENCE_TYPE.ASSESSMENT_MCQ,
      VALID_EVIDENCE_TYPE.ASSESSMENT_CODE,
      VALID_EVIDENCE_TYPE.HUMAN_INTERVIEW,
    ],
    roleRelevance: {
      'backend-developer': 0.9,
      'data-engineer': 1.0,
      'devops-engineer': 0.8,
      'full-stack-developer': 0.6,
    },
  },
  {
    id: 'sk_system_design',
    key: 'systemdesign',
    name: 'System Design',
    category: SKILL_CATEGORY.BACKEND,
    aliases: ['distributed systems', 'scalability', 'system architecture', 'software architecture'],
    prerequisites: ['sk_data_structures', 'sk_rest_api', 'sk_sql'],
    subSkills: ['caching', 'load_balancing', 'sharding', 'cap_theorem', 'rate_limiting'],
    relatedSkills: ['sk_docker', 'sk_cloud_aws'],
    difficulty: 4,
    validEvidenceTypes: [
      VALID_EVIDENCE_TYPE.ASSESSMENT_MCQ,
      VALID_EVIDENCE_TYPE.HUMAN_INTERVIEW,
      VALID_EVIDENCE_TYPE.PROJECT_EVIDENCE,
    ],
    roleRelevance: {
      'backend-developer': 1.0,
      'full-stack-developer': 0.8,
      'devops-engineer': 0.9,
      'data-engineer': 0.9,
    },
  },

  // --- DATABASE ---
  {
    id: 'sk_sql',
    key: 'sql',
    name: 'SQL',
    category: SKILL_CATEGORY.DATABASE,
    aliases: ['structuredquerylanguage', 'relational databases', 'rdbms', 'postgresql', 'mysql'],
    prerequisites: ['sk_programming_fundamentals'],
    subSkills: ['joins', 'indexing', 'transactions', 'acid_properties', 'normalization'],
    relatedSkills: ['sk_mongodb', 'sk_nodejs', 'sk_rest_api'],
    difficulty: 2,
    validEvidenceTypes: [
      VALID_EVIDENCE_TYPE.PROFILE_CLAIM,
      VALID_EVIDENCE_TYPE.PROJECT_EVIDENCE,
      VALID_EVIDENCE_TYPE.ASSESSMENT_MCQ,
      VALID_EVIDENCE_TYPE.ASSESSMENT_CODE,
      VALID_EVIDENCE_TYPE.HUMAN_INTERVIEW,
    ],
    roleRelevance: {
      'backend-developer': 1.0,
      'full-stack-developer': 0.9,
      'data-engineer': 1.0,
      'frontend-developer': 0.4,
    },
  },
  {
    id: 'sk_mongodb',
    key: 'mongodb',
    name: 'MongoDB',
    category: SKILL_CATEGORY.DATABASE,
    aliases: ['mongo', 'nosql', 'document database'],
    prerequisites: ['sk_programming_fundamentals'],
    subSkills: ['aggregation_pipeline', 'indexing', 'document_validation', 'sharding'],
    relatedSkills: ['sk_sql', 'sk_nodejs'],
    difficulty: 2,
    validEvidenceTypes: [
      VALID_EVIDENCE_TYPE.PROFILE_CLAIM,
      VALID_EVIDENCE_TYPE.PROJECT_EVIDENCE,
      VALID_EVIDENCE_TYPE.ASSESSMENT_MCQ,
      VALID_EVIDENCE_TYPE.HUMAN_INTERVIEW,
    ],
    roleRelevance: {
      'backend-developer': 0.8,
      'full-stack-developer': 0.9,
      'frontend-developer': 0.3,
    },
  },

  // --- DEVOPS & CLOUD ---
  {
    id: 'sk_docker',
    key: 'docker',
    name: 'Docker',
    category: SKILL_CATEGORY.DEVOPS,
    aliases: ['containers', 'containerization'],
    prerequisites: ['sk_programming_fundamentals'],
    subSkills: ['dockerfiles', 'images_containers', 'multistage_builds', 'volumes_networks'],
    relatedSkills: ['sk_kubernetes', 'sk_ci_cd', 'sk_docker_compose'],
    difficulty: 3,
    validEvidenceTypes: [
      VALID_EVIDENCE_TYPE.PROFILE_CLAIM,
      VALID_EVIDENCE_TYPE.PROJECT_EVIDENCE,
      VALID_EVIDENCE_TYPE.ASSESSMENT_MCQ,
      VALID_EVIDENCE_TYPE.HUMAN_INTERVIEW,
    ],
    roleRelevance: {
      'devops-engineer': 1.0,
      'backend-developer': 0.9,
      'full-stack-developer': 0.8,
      'data-engineer': 0.8,
      'frontend-developer': 0.4,
    },
  },
  {
    id: 'sk_docker_compose',
    key: 'docker-compose',
    name: 'Docker Compose',
    category: SKILL_CATEGORY.DEVOPS,
    aliases: ['docker compose', 'docker-compose', 'compose'],
    prerequisites: ['sk_docker'],
    subSkills: ['compose_yaml', 'multi_container_services', 'environment_vars'],
    relatedSkills: ['sk_docker', 'sk_kubernetes'],
    difficulty: 2,
    validEvidenceTypes: [
      VALID_EVIDENCE_TYPE.PROFILE_CLAIM,
      VALID_EVIDENCE_TYPE.PROJECT_EVIDENCE,
      VALID_EVIDENCE_TYPE.ASSESSMENT_MCQ,
      VALID_EVIDENCE_TYPE.HUMAN_INTERVIEW,
    ],
    roleRelevance: {
      'devops-engineer': 0.9,
      'backend-developer': 0.8,
      'full-stack-developer': 0.8,
    },
  },
  {
    id: 'sk_kubernetes',
    key: 'kubernetes',
    name: 'Kubernetes',
    category: SKILL_CATEGORY.DEVOPS,
    aliases: ['k8s', 'container orchestration'],
    prerequisites: ['sk_docker'],
    subSkills: ['pods_deployments', 'services_ingress', 'configmaps_secrets', 'helm'],
    relatedSkills: ['sk_cloud_aws', 'sk_system_design'],
    difficulty: 4,
    validEvidenceTypes: [
      VALID_EVIDENCE_TYPE.PROJECT_EVIDENCE,
      VALID_EVIDENCE_TYPE.ASSESSMENT_MCQ,
      VALID_EVIDENCE_TYPE.HUMAN_INTERVIEW,
    ],
    roleRelevance: {
      'devops-engineer': 1.0,
      'backend-developer': 0.7,
      'data-engineer': 0.6,
    },
  },
  {
    id: 'sk_ci_cd',
    key: 'cicd',
    name: 'CI/CD Pipelines',
    category: SKILL_CATEGORY.DEVOPS,
    aliases: ['continuous integration', 'github actions', 'jenkins', 'gitlab ci'],
    prerequisites: ['sk_git'],
    subSkills: ['automated_testing', 'pipeline_stages', 'secrets_management', 'deployment_strategies'],
    relatedSkills: ['sk_docker'],
    difficulty: 3,
    validEvidenceTypes: [
      VALID_EVIDENCE_TYPE.PROJECT_EVIDENCE,
      VALID_EVIDENCE_TYPE.ASSESSMENT_MCQ,
      VALID_EVIDENCE_TYPE.HUMAN_INTERVIEW,
    ],
    roleRelevance: {
      'devops-engineer': 1.0,
      'backend-developer': 0.8,
      'full-stack-developer': 0.8,
    },
  },
  {
    id: 'sk_cloud_aws',
    key: 'aws',
    name: 'AWS',
    category: SKILL_CATEGORY.CLOUD,
    aliases: ['amazon web services', 'cloud computing', 'aws cloud'],
    prerequisites: ['sk_programming_fundamentals'],
    subSkills: ['ec2', 's3', 'lambda', 'iam', 'rds', 'vpc'],
    relatedSkills: ['sk_docker', 'sk_system_design'],
    difficulty: 3,
    validEvidenceTypes: [
      VALID_EVIDENCE_TYPE.PROFILE_CLAIM,
      VALID_EVIDENCE_TYPE.PROJECT_EVIDENCE,
      VALID_EVIDENCE_TYPE.ASSESSMENT_MCQ,
      VALID_EVIDENCE_TYPE.HUMAN_INTERVIEW,
    ],
    roleRelevance: {
      'devops-engineer': 1.0,
      'backend-developer': 0.8,
      'full-stack-developer': 0.7,
      'data-engineer': 0.8,
    },
  },
  {
    id: 'sk_github',
    key: 'github',
    name: 'GitHub',
    category: SKILL_CATEGORY.DEVOPS,
    aliases: ['github repo', 'github repository'],
    prerequisites: ['sk_git'],
    subSkills: ['pull_requests', 'code_reviews', 'forking', 'issues'],
    relatedSkills: ['sk_git', 'sk_ci_cd'],
    difficulty: 2,
    validEvidenceTypes: [
      VALID_EVIDENCE_TYPE.PROFILE_CLAIM,
      VALID_EVIDENCE_TYPE.PROJECT_EVIDENCE,
      VALID_EVIDENCE_TYPE.ASSESSMENT_MCQ,
      VALID_EVIDENCE_TYPE.HUMAN_INTERVIEW,
    ],
    roleRelevance: {
      'devops-engineer': 0.9,
      'backend-developer': 0.8,
      'full-stack-developer': 0.9,
      'frontend-developer': 0.8,
      'data-engineer': 0.7,
    },
  },
]);

// Build index maps for fast O(1) resolution
const SKILL_BY_ID = new Map(CANONICAL_SKILL_CATALOG.map((s) => [s.id, s]));
const SKILL_BY_KEY = new Map(CANONICAL_SKILL_CATALOG.map((s) => [s.key, s]));

// Index all aliases directly to their canonical record
const SKILL_BY_ALIAS = new Map();
for (const skill of CANONICAL_SKILL_CATALOG) {
  SKILL_BY_ALIAS.set(skill.key, skill);
  for (const alias of skill.aliases) {
    const norm = skillKey(alias);
    if (norm) {
      SKILL_BY_ALIAS.set(norm, skill);
    }
  }
}

/**
 * Resolves any raw skill name, alias, or ID into the canonical skill record.
 *
 * @param {string} rawInput
 * @returns {object|null} Canonical Skill Record or null if unrecognized
 */
export function resolveCanonicalSkill(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return null;
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  // Direct ID match (e.g. "sk_javascript")
  if (SKILL_BY_ID.has(trimmed)) {
    return SKILL_BY_ID.get(trimmed);
  }

  // Key / alias match via skillKey normalization
  const key = skillKey(trimmed);
  if (SKILL_BY_ALIAS.has(key)) {
    return SKILL_BY_ALIAS.get(key);
  }
  if (SKILL_BY_KEY.has(key)) {
    return SKILL_BY_KEY.get(key);
  }

  return null;
}

/**
 * Detects cycles in the prerequisite dependency graph using Depth-First Search.
 *
 * @returns {Array<Array<string>>} List of cycle paths found, or empty array if DAG is valid.
 */
export function detectGraphCycles() {
  const visited = new Set();
  const recursionStack = new Set();
  const cycles = [];

  function dfs(skillId, currentPath) {
    visited.add(skillId);
    recursionStack.add(skillId);
    currentPath.push(skillId);

    const skill = SKILL_BY_ID.get(skillId);
    if (skill && Array.isArray(skill.prerequisites)) {
      for (const prereqId of skill.prerequisites) {
        if (!visited.has(prereqId)) {
          dfs(prereqId, [...currentPath]);
        } else if (recursionStack.has(prereqId)) {
          const cycleStartIndex = currentPath.indexOf(prereqId);
          cycles.push([...currentPath.slice(cycleStartIndex), prereqId]);
        }
      }
    }

    recursionStack.delete(skillId);
  }

  for (const skill of CANONICAL_SKILL_CATALOG) {
    if (!visited.has(skill.id)) {
      dfs(skill.id, []);
    }
  }

  return cycles;
}

/**
 * Validates the entire skill ontology graph:
 * - Ensures zero cycles in prerequisite dependencies
 * - Ensures zero orphan prerequisite or sub-skill references
 * - Ensures no duplicate canonical IDs or keys
 *
 * @returns {{ isValid: boolean, errors: string[] }}
 */
export function validateDependencyGraph() {
  const errors = [];

  // 1. Check for duplicate IDs or Keys
  const seenIds = new Set();
  const seenKeys = new Set();
  for (const skill of CANONICAL_SKILL_CATALOG) {
    if (seenIds.has(skill.id)) {
      errors.push(`Duplicate canonical skill ID: "${skill.id}"`);
    }
    seenIds.add(skill.id);

    if (seenKeys.has(skill.key)) {
      errors.push(`Duplicate canonical skill key: "${skill.key}" for ID "${skill.id}"`);
    }
    seenKeys.add(skill.key);
  }

  // 2. Check for orphan prerequisite references
  for (const skill of CANONICAL_SKILL_CATALOG) {
    for (const prereqId of skill.prerequisites) {
      if (!SKILL_BY_ID.has(prereqId)) {
        errors.push(`Skill "${skill.id}" references non-existent prerequisite "${prereqId}"`);
      }
    }
    for (const relatedId of skill.relatedSkills) {
      if (!SKILL_BY_ID.has(relatedId)) {
        errors.push(`Skill "${skill.id}" references non-existent related skill "${relatedId}"`);
      }
    }
  }

  // 3. Detect Cycles
  const cycles = detectGraphCycles();
  if (cycles.length > 0) {
    for (const cycle of cycles) {
      errors.push(`Circular prerequisite cycle detected: ${cycle.join(' -> ')}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Computes the complete, ordered chain of prerequisites required for a skill.
 * Results are ordered from foundational to immediate prerequisite.
 *
 * @param {string} skillIdOrName
 * @returns {Array<object>} Ordered list of prerequisite Canonical Skill Records
 */
export function getPrerequisiteChain(skillIdOrName) {
  const target = resolveCanonicalSkill(skillIdOrName);
  if (!target) return [];

  const ordered = [];
  const visited = new Set();

  function collect(currentSkillId) {
    if (visited.has(currentSkillId)) return;
    visited.add(currentSkillId);

    const skill = SKILL_BY_ID.get(currentSkillId);
    if (!skill) return;

    for (const prereqId of skill.prerequisites) {
      collect(prereqId);
    }

    if (currentSkillId !== target.id) {
      ordered.push(skill);
    }
  }

  collect(target.id);
  return ordered;
}
