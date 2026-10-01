# Nexora — Skill Taxonomy, Ontology & Dependency Graph System (Task 03)

## 1. Overview & Architectural Principle
Task 03 transitions Nexora from a loose, free-form string matching dictionary to an authoritative **Skill Knowledge Model & Prerequisite DAG (`server/src/domain/skills/skillOntology.js`)**.

Rather than letting arbitrary LLM outputs or raw user strings introduce synthetic or duplicate competencies, all skills across Nexora are grounded in canonical entities with deterministic prerequisite chains and mathematical career-role relevance.

---

## 2. Canonical Skill Schema

Every skill in the ontology is defined with strict structural attributes:
- `id`: Stable canonical ID (`sk_*`, e.g. `sk_javascript`, `sk_docker`, `sk_kubernetes`).
- `key`: Alphanumeric normalized key for O(1) indexing and deduplication.
- `name`: Official display name.
- `category`: Domain grouping (`core_cs`, `frontend`, `backend`, `database`, `devops`, `cloud`, `security`, `data_ai`).
- `aliases`: Curated alternate spellings, frameworks, or synonyms (e.g. `['js', 'ecmascript', 'es6']`).
- `subSkills`: Granular competencies (e.g. `['hooks', 'jsx', 'state_management']` for React).
- `prerequisites`: Required foundational skills forming an acyclic dependency graph.
- `relatedSkills`: Complementary competencies.
- `difficulty`: 1 (Novice) to 5 (Mastery).
- `validEvidenceTypes`: Permitted proof channels (`project_evidence`, `assessment_mcq`, `assessment_code`, `human_interview`).
- `roleRelevance`: Calibrated relevance weights (0.0 to 1.0) across target career roles.

---

## 3. Dependency Graph & Cycle Detection Algorithms

1. **Cycle Detection (`detectGraphCycles`)**:
   Uses recursive Depth-First Search with an active recursion stack. Guarantees that circular dependencies (e.g. A requires B, B requires A) are rejected before deployment.
2. **Graph Integrity Validator (`validateDependencyGraph`)**:
   Verifies:
   - Zero cycles.
   - Zero orphan prerequisite references (every prerequisite ID exists).
   - Zero orphan related-skill references.
   - Zero duplicate IDs or normalized keys.
3. **Topological Prerequisite Resolver (`getPrerequisiteChain`)**:
   Returns the topologically ordered list of all foundational competencies needed before a skill can be studied or verified.

---

## 4. Normalization & Upstream Integration

- **Profile Skills**: Normalizes user-entered skill names into canonical IDs.
- **Resume Extraction**: LLM extraction is mapped through `resolveCanonicalSkill()`. Any unrecognized or ungrounded skill is quarantined.
- **Assessments & Interviews**: Every assessment question and interview prompt is tagged with a canonical `skillId`.
- **CareerTwin & Roadmaps**: Downstream roadmaps use `getPrerequisiteChain()` to sequence learning paths in correct dependency order.

---

## 5. Certification
* **Status**: **FIXED** (Skill ontology implemented in `server/src/domain/skills/skillOntology.js` with comprehensive test suite in `server/tests/skillOntology.test.js`).
