import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CANONICAL_SKILL_CATALOG,
  ONTOLOGY_VERSION,
  detectGraphCycles,
  getPrerequisiteChain,
  resolveCanonicalSkill,
  validateDependencyGraph,
} from '../src/domain/skills/skillOntology.js';

describe('Task 03: Complete Skill Taxonomy, Ontology & Dependency Graph Suite', () => {
  describe('1. Ontology Knowledge Base & DAG Integrity', () => {
    it('verifies ontology version is 3.0.0', () => {
      assert.equal(ONTOLOGY_VERSION, '3.0.0');
    });

    it('verifies the master canonical catalog is strictly acyclic and valid', () => {
      const validation = validateDependencyGraph();
      assert.equal(
        validation.isValid,
        true,
        `Catalog dependency graph validation failed: ${validation.errors.join(', ')}`,
      );
      assert.equal(validation.errors.length, 0);
    });

    it('confirms zero cycles exist in the canonical prerequisite graph', () => {
      const cycles = detectGraphCycles();
      assert.deepEqual(cycles, [], 'Prerequisite graph must have zero cycles');
    });

    it('verifies all skills have required schema fields, valid categories, and positive difficulty', () => {
      for (const skill of CANONICAL_SKILL_CATALOG) {
        assert.ok(skill.id.startsWith('sk_'), `Skill ID ${skill.id} must start with sk_`);
        assert.ok(skill.name.length > 0, `Skill ${skill.id} must have non-empty name`);
        assert.ok(skill.key.length > 0, `Skill ${skill.id} must have non-empty key`);
        assert.ok(skill.difficulty >= 1 && skill.difficulty <= 5, `Difficulty must be 1-5`);
        assert.ok(Array.isArray(skill.prerequisites), `Prerequisites must be an array`);
        assert.ok(Array.isArray(skill.validEvidenceTypes), `Valid evidence types must be array`);
        assert.ok(
          skill.validEvidenceTypes.length > 0,
          `Skill ${skill.id} must have at least one valid evidence type`,
        );
      }
    });
  });

  describe('2. Canonical Skill Resolution & Alias Mapping', () => {
    it('resolves direct canonical skill IDs', () => {
      const skill = resolveCanonicalSkill('sk_docker');
      assert.ok(skill);
      assert.equal(skill.id, 'sk_docker');
      assert.equal(skill.name, 'Docker');
    });

    it('resolves common aliases and variations to the canonical skill', () => {
      // JavaScript aliases
      assert.equal(resolveCanonicalSkill('js')?.id, 'sk_javascript');
      assert.equal(resolveCanonicalSkill('JavaScript')?.id, 'sk_javascript');
      assert.equal(resolveCanonicalSkill('ecmascript')?.id, 'sk_javascript');

      // TypeScript aliases
      assert.equal(resolveCanonicalSkill('ts')?.id, 'sk_typescript');
      assert.equal(resolveCanonicalSkill('TypeScript')?.id, 'sk_typescript');

      // Kubernetes aliases
      assert.equal(resolveCanonicalSkill('k8s')?.id, 'sk_kubernetes');
      assert.equal(resolveCanonicalSkill('container orchestration')?.id, 'sk_kubernetes');

      // AWS aliases
      assert.equal(resolveCanonicalSkill('amazon web services')?.id, 'sk_cloud_aws');
      assert.equal(resolveCanonicalSkill('aws')?.id, 'sk_cloud_aws');

      // SQL aliases
      assert.equal(resolveCanonicalSkill('postgresql')?.id, 'sk_sql');
      assert.equal(resolveCanonicalSkill('mysql')?.id, 'sk_sql');
    });

    it('returns null for unknown or non-canonical skills', () => {
      assert.equal(resolveCanonicalSkill('ImaginaryQuantumTech99'), null);
      assert.equal(resolveCanonicalSkill(''), null);
      assert.equal(resolveCanonicalSkill(null), null);
    });
  });

  describe('3. Prerequisite Dependency Chains & Learning Sequences', () => {
    it('computes correct ordered prerequisite chain for Kubernetes', () => {
      const chain = getPrerequisiteChain('sk_kubernetes');
      assert.ok(chain.length >= 2, 'Kubernetes must require at least Docker and programming fundamentals');

      const ids = chain.map((s) => s.id);
      assert.ok(ids.includes('sk_programming_fundamentals'));
      assert.ok(ids.includes('sk_docker'));

      // Fundamentals must come before Docker
      const fundIndex = ids.indexOf('sk_programming_fundamentals');
      const dockerIndex = ids.indexOf('sk_docker');
      assert.ok(fundIndex < dockerIndex, 'Fundamentals must precede Docker in prerequisite chain');
    });

    it('computes correct ordered prerequisite chain for React', () => {
      const chain = getPrerequisiteChain('React');
      const ids = chain.map((s) => s.id);
      assert.ok(ids.includes('sk_javascript'));

      const jsIndex = ids.indexOf('sk_javascript');
      const fundIndex = ids.indexOf('sk_programming_fundamentals');
      assert.ok(fundIndex < jsIndex, 'Fundamentals must precede JavaScript');
    });

    it('returns empty array for foundational skills with no prerequisites', () => {
      const chain = getPrerequisiteChain('sk_programming_fundamentals');
      assert.deepEqual(chain, []);
    });
  });

  describe('4. Role Relevance Calibration', () => {
    it('defines non-zero role relevance for matching career tracks', () => {
      const reactSkill = resolveCanonicalSkill('react');
      assert.ok(reactSkill.roleRelevance['frontend-developer'] >= 0.9);

      const nodeSkill = resolveCanonicalSkill('nodejs');
      assert.ok(nodeSkill.roleRelevance['backend-developer'] >= 0.9);

      const dockerSkill = resolveCanonicalSkill('docker');
      assert.ok(dockerSkill.roleRelevance['devops-engineer'] >= 0.9);
    });
  });
});
