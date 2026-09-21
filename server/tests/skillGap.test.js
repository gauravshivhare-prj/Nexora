import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';

import { ERROR_CODES } from '../src/constants/errorCodes.js';
import { findRole } from '../src/domain/careers/roleCatalogue.js';
import { GAP_STATUS, computeSkillGap } from '../src/domain/skillGap/computeSkillGap.js';
import { skillKey } from '../src/domain/skills/skillKey.js';
import { useAiProvider } from '../src/services/ai/aiProvider.js';
import {
  clearProfiles,
  clearResumes,
  clearUsers,
  getWithToken,
  postJson,
  requestWithHeaders,
  resetRateLimiters,
  sendJsonWithToken,
  sendWithToken,
  startTestServer,
} from './helpers/testServer.js';

/**
 * Skill gap analysis.
 *
 * The case worth protecting is the one the whole product turns on: a skill
 * a student merely typed into a form must come back as a gap, not as a
 * skill. If that ever stops being true, Nexora is a checklist and the
 * student finds out at the interview.
 */

const BACKEND = findRole('backend-developer');

function twinWith(skills) {
  return {
    skills: skills.map(({ name, strength = 'claimed', level = null, evidence }) => ({
      key: skillKey(name),
      name,
      strength,
      selfDeclaredLevel: level,
      sourceCount: 1,
      evidence: evidence ?? [
        { source: 'self_declared', strength, detail: `You listed ${name}.`, reference: null },
      ],
    })),
    targetRoles: [],
  };
}

const find = (gap, name) => gap.skills.find((skill) => skill.key === skillKey(name));

// --------------------------------------------------------- pure comparison

describe('computeSkillGap', () => {
  it('reports a skill Nexora has never seen as missing', () => {
    const gap = computeSkillGap(twinWith([{ name: 'JavaScript' }]), BACKEND);

    const sql = find(gap, 'SQL');
    assert.equal(sql.status, GAP_STATUS.MISSING);
    assert.equal(sql.importance, 'required');
    assert.match(sql.reason, /has not seen it/);
  });

  it('reports a merely listed skill as claimed, not as one the student has', () => {
    const gap = computeSkillGap(
      twinWith([{ name: 'Node.js', strength: 'claimed', level: 'expert' }]),
      BACKEND,
    );

    const node = find(gap, 'Node.js');

    // The student called themselves an expert. It is still a gap, and this
    // is the single most important assertion in the file.
    assert.equal(node.status, GAP_STATUS.CLAIMED);
    assert.equal(node.selfDeclaredLevel, 'expert');
    assert.match(node.reason, /has not seen you use it/);
  });

  it('reports a skill backed by a project as supported', () => {
    const gap = computeSkillGap(
      twinWith([
        {
          name: 'Node.js',
          strength: 'supported',
          evidence: [
            {
              source: 'project',
              strength: 'supported',
              detail: 'Used in your project "Nexora".',
              reference: 'Nexora',
            },
          ],
        },
      ]),
      BACKEND,
    );

    const node = find(gap, 'Node.js');
    assert.equal(node.status, GAP_STATUS.SUPPORTED);
    assert.match(node.reason, /concrete work/);
    assert.match(node.reason, /Nexora/);
  });

  it('gives every skill a reason, whatever its status', () => {
    const gap = computeSkillGap(
      twinWith([{ name: 'JavaScript' }, { name: 'Node.js', strength: 'supported' }]),
      BACKEND,
    );

    for (const skill of gap.skills) {
      assert.ok(skill.reason?.length > 0, `${skill.name} has no reason`);
    }
  });

  it('suggests a concrete way to improve every skill that is not verified', () => {
    const gap = computeSkillGap(twinWith([{ name: 'JavaScript' }]), BACKEND);

    for (const skill of gap.skills) {
      assert.ok(skill.suggestedEvidence.length > 0, `${skill.name} has no suggestion`);

      for (const suggestion of skill.suggestedEvidence) {
        assert.ok(suggestion.action?.length > 0);
        assert.ok(Object.values(GAP_STATUS).includes(suggestion.wouldReach));
      }
    }
  });

  it('marks assessments as unavailable rather than suggesting a missing feature', () => {
    const gap = computeSkillGap(twinWith([{ name: 'JavaScript' }]), BACKEND);

    const assessment = find(gap, 'SQL').suggestedEvidence.find(
      (suggestion) => suggestion.type === 'assessment',
    );

    assert.equal(assessment.available, false);
    assert.match(assessment.note, /not available yet/);
  });

  it('suggests only an assessment for an already-supported skill', () => {
    const gap = computeSkillGap(
      twinWith([{ name: 'Node.js', strength: 'supported' }]),
      BACKEND,
    );

    const suggestions = find(gap, 'Node.js').suggestedEvidence;

    // Adding a second project does not move a skill that already has one.
    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0].type, 'assessment');
  });

  it('suggests nothing for a verified skill', () => {
    const gap = computeSkillGap(twinWith([{ name: 'SQL', strength: 'verified' }]), BACKEND);

    assert.deepEqual(find(gap, 'SQL').suggestedEvidence, []);
  });

  it('puts required-and-missing first, then required-but-only-claimed', () => {
    const gap = computeSkillGap(
      twinWith([
        { name: 'JavaScript', strength: 'claimed' },
        { name: 'Node.js', strength: 'supported' },
        { name: 'MongoDB', strength: 'supported' },
      ]),
      BACKEND,
    );

    const ordered = gap.skills.map((skill) => `${skill.importance}:${skill.status}`);

    assert.equal(ordered[0], 'required:missing');
    const firstClaimed = ordered.indexOf('required:claimed');
    const firstPreferredMissing = ordered.indexOf('preferred:missing');
    assert.ok(firstClaimed < firstPreferredMissing, 'a claimed core skill was buried');
  });

  it('matches across a difference in spelling', () => {
    const gap = computeSkillGap(twinWith([{ name: 'NodeJS' }]), BACKEND);

    const node = find(gap, 'Node.js');
    assert.equal(node.status, GAP_STATUS.CLAIMED);
    assert.equal(node.yourSkill, 'NodeJS');
  });

  it('counts statuses without inventing a readiness percentage', () => {
    const gap = computeSkillGap(
      twinWith([
        { name: 'JavaScript', strength: 'supported' },
        { name: 'Node.js', strength: 'claimed' },
      ]),
      BACKEND,
    );

    assert.equal(gap.summary.required.total, BACKEND.requiredSkills.length);
    assert.equal(gap.summary.required.supported, 1);
    assert.equal(gap.summary.required.claimed, 1);
    assert.equal(gap.summary.required.missing, 2);

    // A single "60% ready" figure invites a student to read one number and
    // stop, when the whole value is in which 60% is shown rather than said.
    const serialised = JSON.stringify(gap.summary).toLowerCase();
    assert.ok(!serialised.includes('percent'));
    assert.ok(!serialised.includes('score'));
    assert.ok(!serialised.includes('readiness'));
  });

  it('lists skills outside the role as context, not as a criticism', () => {
    const gap = computeSkillGap(
      twinWith([{ name: 'Node.js' }, { name: 'Figma', strength: 'supported' }]),
      BACKEND,
    );

    assert.deepEqual(gap.additionalSkills, [{ name: 'Figma', strength: 'supported' }]);
  });

  it('reports every skill as missing for a student with none', () => {
    const gap = computeSkillGap(twinWith([]), BACKEND);

    assert.equal(
      gap.summary.required.missing,
      BACKEND.requiredSkills.length,
      'not every core skill was reported missing',
    );
    assert.deepEqual(gap.additionalSkills, []);
  });

  it('is deterministic', () => {
    const twin = twinWith([{ name: 'JavaScript' }, { name: 'Node.js', strength: 'supported' }]);

    assert.deepEqual(computeSkillGap(twin, BACKEND), computeSkillGap(twin, BACKEND));
  });

  it('never fabricates evidence', () => {
    const gap = computeSkillGap(twinWith([{ name: 'JavaScript' }]), BACKEND);

    for (const skill of gap.skills) {
      if (skill.status === GAP_STATUS.MISSING) {
        assert.deepEqual(skill.evidence, [], `${skill.name} is missing but has evidence`);
      } else {
        assert.ok(skill.evidence.length > 0, `${skill.name} has a status but no evidence`);
      }
    }
  });
});

// --------------------------------------------------------------------- API

describe('skill gap API', () => {
  let server;
  const PASSWORD = 'Str0ngPassphrase';

  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.close();
  });

  beforeEach(async () => {
    resetRateLimiters();
    useAiProvider(null);
    await mongoose.connection.collection('careertwins').deleteMany({});
    await clearResumes();
    await clearProfiles();
    await clearUsers();
  });

  async function studentWith(email, profile) {
    await postJson(server.baseUrl, '/api/auth/register', {
      name: 'Gaurav Shivhare',
      email,
      password: PASSWORD,
    });
    const { body } = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password: PASSWORD,
    });
    const token = body.data.token;

    if (profile) {
      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: profile,
      });
      await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });
    }

    return token;
  }

  const gapFor = (token, roleId) =>
    getWithToken(server.baseUrl, `/api/careers/roles/${roleId}/skill-gap`, token);

  it('requires authentication', async () => {
    const { status, body } = await requestWithHeaders(
      server.baseUrl,
      '/api/careers/roles/backend-developer/skill-gap',
    );

    assert.equal(status, 401);
    assert.equal(body.errorCode, ERROR_CODES.AUTH_TOKEN_MISSING);
  });

  it('refuses without a CareerTwin', async () => {
    const token = await studentWith('notwin@example.com', null);

    const { status, body } = await gapFor(token, 'backend-developer');

    assert.equal(status, 409);
    assert.equal(body.errorCode, ERROR_CODES.CAREER_TWIN_NOT_FOUND);
  });

  it('answers 404 for a role outside the catalogue', async () => {
    const token = await studentWith('norole@example.com', {
      skills: [{ name: 'Node.js', level: 'advanced' }],
    });

    const { status, body } = await gapFor(token, 'wizard');

    assert.equal(status, 404);
    assert.equal(body.errorCode, ERROR_CODES.CAREER_ROLE_NOT_FOUND);
  });

  it('distinguishes a typed skill from a demonstrated one end to end', async () => {
    const token = await studentWith('endtoend@example.com', {
      skills: [
        { name: 'JavaScript', level: 'expert' },
        { name: 'Node.js', level: 'expert' },
      ],
      projects: [{ title: 'Nexora', technologies: ['Node.js'] }],
    });

    const { status, body } = await gapFor(token, 'backend-developer');
    const skills = body.data.gap.skills;

    assert.equal(status, 200);

    // Both were declared "expert". Only one was built with.
    const javascript = skills.find((skill) => skill.name === 'JavaScript');
    const node = skills.find((skill) => skill.name === 'Node.js');

    assert.equal(javascript.status, 'claimed');
    assert.equal(node.status, 'supported');
    assert.match(node.evidence[0].detail, /Nexora/);
  });

  it('explains what each status means in the response', async () => {
    const token = await studentWith('meanings@example.com', {
      skills: [{ name: 'Node.js', level: 'advanced' }],
    });

    const { body } = await gapFor(token, 'backend-developer');

    // A client showing "claimed" must be able to say what Nexora means by
    // it without the reader consulting documentation.
    assert.match(body.data.method.statusMeanings.claimed, /has not seen you use it/);
    assert.match(body.data.method.statusMeanings.verified, /Not available until assessments/);
    assert.equal(body.data.method.usesAi, false);
  });

  it('scopes the gap to the calling student', async () => {
    const backend = await studentWith('owner1@example.com', {
      skills: [
        { name: 'JavaScript', level: 'advanced' },
        { name: 'Node.js', level: 'advanced' },
        { name: 'SQL', level: 'advanced' },
        { name: 'REST APIs', level: 'advanced' },
      ],
    });
    const beginner = await studentWith('owner2@example.com', {
      skills: [{ name: 'HTML', level: 'beginner' }],
    });

    const strong = await gapFor(backend, 'backend-developer');
    const weak = await gapFor(beginner, 'backend-developer');

    assert.equal(strong.body.data.gap.summary.required.missing, 0);
    assert.equal(weak.body.data.gap.summary.required.missing, 4);
  });

  it('reflects a regenerated CareerTwin', async () => {
    const token = await studentWith('changed@example.com', {
      skills: [{ name: 'Node.js', level: 'beginner' }],
    });

    const before = await gapFor(token, 'backend-developer');
    assert.equal(
      before.body.data.gap.skills.find((skill) => skill.name === 'Node.js').status,
      'claimed',
    );

    await sendJsonWithToken(server.baseUrl, '/api/profile', {
      method: 'PATCH',
      token,
      payload: { projects: [{ title: 'API Server', technologies: ['Node.js'] }] },
    });
    await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

    const after = await gapFor(token, 'backend-developer');

    // Building something with it is what moves the status.
    assert.equal(
      after.body.data.gap.skills.find((skill) => skill.name === 'Node.js').status,
      'supported',
    );
  });
});
