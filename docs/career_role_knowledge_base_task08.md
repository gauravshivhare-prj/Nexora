# Task 08 — Career Role Knowledge Base & Requirement Engineering

## 1. Executive Summary & Architectural Overview

In **Task 08**, Nexora established a **controlled, structured career role catalogue and requirement engineering engine**.

Prior to this task, role definitions were simple lists of required and preferred skill strings without proficiency thresholds, prerequisite knowledge, competency relationships, or quality gates. Under the reconstructed architecture:
1. **Canonical Role Catalogue**: Every role has an immutable canonical ID (e.g. `role_backend_developer`) and slug ID (`backend-developer`), versioned under `CATALOGUE_VERSION = 2`.
2. **Deep Structured Requirements**:
   - `requiredSkills`: Fundamental skills a candidate must possess.
   - `preferredSkills`: Complementary skills that strengthen candidacy.
   - `proficiencyExpectations`: Stated minimum proficiency per required competency (e.g. `intermediate` for Node.js and SQL).
   - `prerequisites`: Required foundational capabilities mapped to the controlled skill ontology (e.g. `sk_programming_fundamentals`).
   - `evidenceExpectations`: Concrete evidence expectations, including minimum supported project counts and acceptable evidence types.
   - `competencyRelationships`: Explicit directed dependency and integration links between role requirements.
3. **Quality Gates & Recommendation Protection**:
   - A role cannot enter live recommendation or matching logic without passing all 7 structural quality gates.
   - AI-generated role suggestions are quarantined under `status: 'ai_suggested'` and `provenance: 'ai_draft'`, completely barred from authoritative recommendation matching until formally reviewed and promoted by human curriculum experts.
4. **Lifecycle Management**: Formally defined sourcing, reviewing, versioning, and deprecation protocols.

---

## 2. Canonical Role Schema Specification

```javascript
{
  canonicalId: 'role_backend_developer',
  id: 'backend-developer',
  title: 'Backend Developer',
  category: 'engineering',
  summary: 'Builds the server-side logic, APIs and data access behind an application.',
  requiredSkills: ['JavaScript', 'Node.js', 'REST APIs', 'SQL'],
  preferredSkills: ['Express.js', 'MongoDB', 'PostgreSQL', 'Docker', 'Redis', 'Git'],
  relatedTechnologies: ['Nginx', 'GraphQL', 'RabbitMQ', 'Kubernetes'],
  commonBackgrounds: [
    'computer science',
    'computer science and engineering',
    'information technology',
    'software engineering',
    'computer engineering',
  ],
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
    status: 'active',
    provenance: 'curated',
    lastReviewedAt: '2026-09-15',
    reviewedBy: 'Nexora Curriculum Committee',
    changeLog: ['Standardized schema with canonical skillIds, competency relationships, and quality gate gating.'],
  },
}
```

---

## 3. Quality Gate & AI Boundary Enforcement

### 3.1 Quality Gate Rules (`validateRoleRequirements`)
1. **Identifier & Title**: Lowercase alphanumeric slug and canonical `role_*` identifier. Title $\ge 3$ characters.
2. **Category**: Must match one of `engineering`, `data`, `infrastructure`, `design`, `quality`.
3. **Summary**: Descriptive text between 20 and 500 characters.
4. **Skill Quantities**: At least 2 required skills and at least 2 preferred skills.
5. **Proficiency Expectations**: Defined overall minimum and mapped requirements.
6. **Evidence Expectations**: Defined minimum supported projects ($\ge 0$) and acceptable evidence types.
7. **Metadata**: Valid status (`active`, `draft`, `deprecated`, `ai_suggested`) and provenance (`curated`, `industry_standard`, `ai_draft`).

### 3.2 Recommendation Eligibility Boundary (`isEligibleForRecommendation`)
$$R \in \text{AuthoritativeCatalogue} \iff \text{validateRoleRequirements}(R).\text{isValid} \land R.\text{status} = \text{'active'}$$

- **AI Proposal Isolation**: Proposals submitted via `submitAiRoleProposal` receive `status: 'ai_suggested'` and `provenance: 'ai_draft'`. They **cannot be returned by `getAuthoritativeRoles()`** or matched by `recommendRoles()`.
- **Human Promotion Gate**: Only `reviewAndPromoteRole()` with a designated reviewer name and approval notes can promote a proposal to `'active'` status.

---

## 4. API Endpoints

### 4.1 `GET /api/careers/roles`
Returns all active authoritative roles with structured requirement counts, proficiency expectations, and evidence criteria.

### 4.2 `GET /api/careers/roles/:roleId`
Returns complete structured requirements for a single role. Supports both slug (`backend-developer`) and canonical ID (`role_backend_developer`).
- **Response**:
```json
{
  "success": true,
  "message": "Career role details retrieved",
  "data": {
    "role": {
      "canonicalId": "role_backend_developer",
      "id": "backend-developer",
      "title": "Backend Developer",
      "category": "engineering",
      "summary": "Builds the server-side logic, APIs and data access behind an application.",
      "requiredSkills": ["JavaScript", "Node.js", "REST APIs", "SQL"],
      "preferredSkills": ["Express.js", "MongoDB", "PostgreSQL", "Docker", "Redis", "Git"],
      "prerequisites": ["sk_programming_fundamentals"],
      "proficiencyExpectations": { "overallMinimum": "intermediate", "skills": { "sk_nodejs": "intermediate" } },
      "evidenceExpectations": { "minimumSupportedProjects": 1, "acceptableEvidenceTypes": ["project_evidence"] },
      "competencyRelationships": [
        { "sourceSkill": "sk_nodejs", "targetSkill": "sk_rest_apis", "relationshipType": "implements" }
      ],
      "metadata": { "version": "2.0.0", "status": "active", "provenance": "curated" }
    },
    "source": { "type": "curated", "version": 2 }
  }
}
```

---

## 5. Verification Results

| Test Suite | Tests | Result | Focus Areas |
|---|---|---|---|
| `tests/roleKnowledgeBase.test.js` | 11 | **PASS (100%)** | Canonical role schemas, quality gate rejection, AI isolation, review promotion, API endpoints. |
| `tests/skillGap.roadmap.integration.test.js` | 3 | **PASS (100%)** | Recommendation $\to$ skill gap $\to$ roadmap integration using structured role definitions. |
| `tests/recommendation.test.js` | 19 | **PASS (100%)** | Ranking and matching against authoritative catalogue. |
| `tests/careerTwinIntelligence.test.js` | 6 | **PASS (100%)** | Target role relevance mapping against controlled role catalogue. |

---

## 6. Certification Status

- **Status**: **FIXED & FULLY CERTIFIED**
- **Quality Gate Integrity**: Verified. All 10 curated canonical roles pass 100%.
- **AI Separation**: Verified. AI drafted roles cannot enter recommendation logic without human promotion.
- **Backward Compatibility**: Preserved. Existing recommendation and skill gap algorithms continue operating seamlessly.
