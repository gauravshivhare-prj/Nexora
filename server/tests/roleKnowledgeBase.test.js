import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
  CAREER_ROLES,
  CATALOGUE_SOURCE,
  CATALOGUE_VERSION,
  ROLE_CATEGORIES,
  ROLE_PROVENANCE,
  ROLE_STATUS,
  findRole,
  getAuthoritativeRoles,
  isEligibleForRecommendation,
} from '../src/domain/careers/roleCatalogue.js';
import {
  reviewAndPromoteRole,
  submitAiRoleProposal,
  validateRoleRequirements,
} from '../src/domain/careers/roleQualityGate.js';
import { getWithToken, postJson, startTestServer } from './helpers/testServer.js';

/**
 * Task 08 — Career Role Knowledge Base & Requirement Engineering Suite
 *
 * Validates:
 * 1. Controlled Role Catalogue integrity, canonical IDs, and requirement structures.
 * 2. Quality gate enforcement: structural validation and recommendation eligibility.
 * 3. AI Proposal Isolation & Human Review Promotion workflow.
 * 4. API Endpoints: GET /api/careers/roles and GET /api/careers/roles/:roleId.
 */

const PASSWORD = 'Str0ngPassphrase1!';
let server;
let token;

describe('Task 08 — Career Role Knowledge Base & Requirement Engineering Suite', () => {
  before(async () => {
    server = await startTestServer();
    const email = `role.kb.${Date.now()}@example.com`;
    await postJson(server.baseUrl, '/api/auth/register', {
      name: 'Role Curator',
      email,
      password: PASSWORD,
    });
    const res = await postJson(server.baseUrl, '/api/auth/login', { email, password: PASSWORD });
    token = res.body.data.token;
  });

  after(async () => {
    await server.close();
  });

  describe('1. Controlled Role Knowledge Base & Schema Integrity', () => {
    it('verifies all 10 canonical career roles meet quality gates and are authoritative', () => {
      assert.equal(CAREER_ROLES.length, 10, 'Expected exactly 10 curated canonical roles');
      assert.equal(CATALOGUE_VERSION, 1);
      assert.equal(CATALOGUE_SOURCE.type, 'curated');

      for (const role of CAREER_ROLES) {
        // ID checks
        assert.ok(role.id, `Role missing slug id`);
        assert.ok(role.canonicalId, `Role ${role.id} missing canonicalId`);
        assert.ok(role.canonicalId.startsWith('role_'));

        // Quality gate pass
        const validation = validateRoleRequirements(role);
        assert.ok(
          validation.isValid,
          `Role ${role.id} failed quality gate: ${validation.errors.join('; ')}`,
        );

        // Eligibility check
        assert.equal(isEligibleForRecommendation(role), true);

        // Competency and evidence expectations
        assert.ok(role.requiredSkills.length >= 2, `${role.id} lacks required skills`);
        assert.ok(role.preferredSkills.length >= 2, `${role.id} lacks preferred skills`);
        assert.ok(role.proficiencyExpectations, `${role.id} lacks proficiency expectations`);
        assert.ok(role.evidenceExpectations, `${role.id} lacks evidence expectations`);
        assert.ok(Array.isArray(role.evidenceExpectations.acceptableEvidenceTypes));

        // Metadata
        assert.equal(role.metadata.status, ROLE_STATUS.ACTIVE);
        assert.equal(role.metadata.provenance, ROLE_PROVENANCE.CURATED);
      }
    });

    it('resolves roles by both canonical ID and legacy slug ID', () => {
      const bySlug = findRole('backend-developer');
      const byCanonical = findRole('role_backend_developer');

      assert.ok(bySlug);
      assert.ok(byCanonical);
      assert.equal(bySlug.id, byCanonical.id);
      assert.equal(bySlug.title, 'Backend Developer');
    });

    it('returns only authoritative roles from getAuthoritativeRoles()', () => {
      const authRoles = getAuthoritativeRoles();
      assert.equal(authRoles.length, 10);
      for (const role of authRoles) {
        assert.equal(role.metadata.status, ROLE_STATUS.ACTIVE);
      }
    });
  });

  describe('2. Quality Gates & Validation Rules', () => {
    it('rejects roles with insufficient required skills or invalid categories', () => {
      // Role with only 1 required skill
      const weakRole = {
        id: 'weak-dev',
        title: 'Weak Developer',
        category: ROLE_CATEGORIES.ENGINEERING,
        summary: 'This is a description that is at least twenty characters long.',
        requiredSkills: ['JavaScript'],
        preferredSkills: ['HTML', 'CSS'],
        proficiencyExpectations: { overallMinimum: 'beginner' },
        evidenceExpectations: { minimumSupportedProjects: 1, acceptableEvidenceTypes: ['project_evidence'] },
      };

      const result = validateRoleRequirements(weakRole);
      assert.equal(result.isValid, false);
      assert.ok(result.errors.some((e) => e.includes('at least 2 required skills')));

      // Role with invalid category
      const invalidCatRole = {
        ...weakRole,
        requiredSkills: ['JavaScript', 'Node.js'],
        category: 'wizardry',
      };
      const catResult = validateRoleRequirements(invalidCatRole);
      assert.equal(catResult.isValid, false);
      assert.ok(catResult.errors.some((e) => e.includes('must be one of:')));
    });

    it('blocks draft, deprecated, or unreviewed roles from recommendation eligibility', () => {
      const draftRole = {
        ...CAREER_ROLES[0],
        metadata: { ...CAREER_ROLES[0].metadata, status: ROLE_STATUS.DRAFT },
      };
      assert.equal(isEligibleForRecommendation(draftRole), false);

      const aiRole = {
        ...CAREER_ROLES[0],
        metadata: { ...CAREER_ROLES[0].metadata, status: ROLE_STATUS.AI_SUGGESTED },
      };
      assert.equal(isEligibleForRecommendation(aiRole), false);
    });
  });

  describe('3. AI Role Proposal Isolation & Quality Gate Promotion', () => {
    it('isolates AI-generated role suggestions and bars them from recommendation logic', () => {
      const rawAiProposal = {
        title: 'Prompt Engineer',
        category: ROLE_CATEGORIES.ENGINEERING,
        summary: 'Designs and evaluates prompts for large language models.',
        requiredSkills: ['Prompt Design', 'Python'],
        preferredSkills: ['NLP', 'Git'],
      };

      const isolatedProposal = submitAiRoleProposal(rawAiProposal, 'gemini-1.5-pro');

      // Assert status and isolation
      assert.equal(isolatedProposal.metadata.status, ROLE_STATUS.AI_SUGGESTED);
      assert.equal(isolatedProposal.metadata.provenance, ROLE_PROVENANCE.AI_DRAFT);
      assert.equal(isolatedProposal.metadata.generatedByModel, 'gemini-1.5-pro');

      // Must be barred from recommendation logic
      assert.equal(isEligibleForRecommendation(isolatedProposal), false);
    });

    it('promotes an AI role proposal to authoritative status following human curriculum review', () => {
      const rawAiProposal = {
        title: 'Prompt Engineer',
        category: ROLE_CATEGORIES.ENGINEERING,
        summary: 'Designs and evaluates prompts for large language models in enterprise workflows.',
        requiredSkills: ['Prompt Design', 'Python'],
        preferredSkills: ['NLP', 'Git'],
        proficiencyExpectations: { overallMinimum: 'intermediate' },
        evidenceExpectations: { minimumSupportedProjects: 1, acceptableEvidenceTypes: ['project_evidence'] },
      };

      const proposal = submitAiRoleProposal(rawAiProposal);
      assert.equal(isEligibleForRecommendation(proposal), false);

      // Human review and promotion
      const promotion = reviewAndPromoteRole(proposal, {
        reviewerName: 'Chief Learning Officer',
        approvalNotes: 'Validated against emerging industry benchmark standards.',
      });

      assert.equal(promotion.success, true);
      assert.ok(promotion.role);
      assert.equal(promotion.role.metadata.status, ROLE_STATUS.ACTIVE);
      assert.equal(promotion.role.metadata.reviewedBy, 'Chief Learning Officer');
      assert.equal(isEligibleForRecommendation(promotion.role), true);
    });
  });

  describe('4. API Endpoints Integration', () => {
    it('GET /api/careers/roles exposes authoritative roles with structured expectations', async () => {
      const res = await getWithToken(server.baseUrl, '/api/careers/roles', token);
      assert.equal(res.status, 200);

      const roles = res.body.data.roles;
      assert.equal(roles.length, 10);

      const backend = roles.find((r) => r.id === 'backend-developer');
      assert.ok(backend);
      assert.equal(backend.canonicalId, 'role_backend_developer');
      assert.ok(backend.proficiencyExpectations);
      assert.ok(backend.evidenceExpectations);
      assert.equal(backend.metadata.status, 'active');
    });

    it('GET /api/careers/roles/:roleId returns full structured requirements and competency relationships', async () => {
      const res = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer',
        token,
      );
      assert.equal(res.status, 200);

      const role = res.body.data.role;
      assert.equal(role.id, 'backend-developer');
      assert.equal(role.canonicalId, 'role_backend_developer');
      assert.ok(role.competencyRelationships.length > 0);
      assert.equal(role.evidenceExpectations.minimumSupportedProjects, 1);
      assert.equal(role.proficiencyExpectations.skills.sk_nodejs, 'intermediate');
    });

    it('GET /api/careers/roles/:roleId supports canonical ID lookup (role_backend_developer)', async () => {
      const res = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/role_backend_developer',
        token,
      );
      assert.equal(res.status, 200);
      assert.equal(res.body.data.role.title, 'Backend Developer');
    });

    it('GET /api/careers/roles/:roleId returns 404 for unknown role id', async () => {
      const res = await getWithToken(server.baseUrl, '/api/careers/roles/non-existent-role', token);
      assert.equal(res.status, 404);
    });
  });
});
