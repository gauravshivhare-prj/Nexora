import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';

import { ERROR_CODES } from '../src/constants/errorCodes.js';
import { findRole } from '../src/domain/careers/roleCatalogue.js';
import { PRIORITY, buildRoadmap } from '../src/domain/roadmap/buildRoadmap.js';
import { computeSkillGap } from '../src/domain/skillGap/computeSkillGap.js';
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
 * Personalised roadmap.
 *
 * Two things matter most here. Every item must trace back to a gap that was
 * actually measured — a roadmap that invents steps is a generic course list
 * with a student's name on it. And no resource link may be fabricated: a
 * student following a made-up URL has been misled by the product that sent
 * them there.
 */

const BACKEND = findRole('backend-developer');

function twinWith(skills) {
  return {
    skills: skills.map(({ name, strength = 'claimed' }) => ({
      key: skillKey(name),
      name,
      strength,
      selfDeclaredLevel: null,
      sourceCount: 1,
      evidence: [
        { source: 'self_declared', strength, detail: `You listed ${name}.`, reference: null },
      ],
    })),
    targetRoles: [],
  };
}

const roadmapFor = (skills, options) =>
  buildRoadmap(computeSkillGap(twinWith(skills), BACKEND), options);

const itemFor = (roadmap, name) =>
  roadmap.items.find((item) => item.skill.key === skillKey(name));

// ----------------------------------------------------------- pure builder

describe('buildRoadmap', () => {
  it('names the role it is a plan for', () => {
    const roadmap = roadmapFor([]);

    assert.equal(roadmap.goal.roleId, 'backend-developer');
    assert.match(roadmap.goal.description, /Backend Developer/);
  });

  it('creates an item only for a skill that is actually a gap', () => {
    const roadmap = roadmapFor([{ name: 'JavaScript', strength: 'supported' }]);

    // JavaScript is already supported, so there is nothing to plan for it.
    // Every other item must correspond to a real gap.
    const planned = roadmap.items.map((item) => item.skill.name);
    assert.ok(!planned.includes('JavaScript'));
    assert.ok(planned.includes('SQL'));
  });

  it('plans nothing for a student who already meets the role', () => {
    const everything = [...BACKEND.requiredSkills, ...BACKEND.preferredSkills].map((name) => ({
      name,
      strength: 'verified',
    }));

    const roadmap = buildRoadmap(computeSkillGap(twinWith(everything), BACKEND));

    // Verified skills have nothing left to prove.
    assert.deepEqual(roadmap.items, []);
    assert.equal(roadmap.summary.actionableGaps, 0);
  });

  it('plans to demonstrate, not to relearn, a skill already claimed', () => {
    const roadmap = roadmapFor([{ name: 'Node.js', strength: 'claimed' }]);

    const node = itemFor(roadmap, 'Node.js');
    assert.match(node.title, /^Demonstrate/);
    assert.match(node.objective, /something Nexora can see/);
    assert.equal(node.estimatedEffort, 'moderate');
  });

  it('plans to learn a skill that is missing', () => {
    const roadmap = roadmapFor([]);

    const sql = itemFor(roadmap, 'SQL');
    assert.match(sql.title, /^Learn/);
    assert.equal(sql.estimatedEffort, 'substantial');
  });

  it('puts a missing core skill above a merely claimed one', () => {
    const roadmap = roadmapFor([{ name: 'Node.js', strength: 'claimed' }]);

    assert.equal(roadmap.items[0].priority, PRIORITY.CRITICAL);
    assert.equal(itemFor(roadmap, 'Node.js').priority, PRIORITY.HIGH);
  });

  it('ranks a claimed core skill above a missing optional one', () => {
    const roadmap = roadmapFor([{ name: 'Node.js', strength: 'claimed' }]);

    const node = roadmap.items.findIndex((item) => item.skill.key === skillKey('Node.js'));
    const redis = roadmap.items.findIndex((item) => item.skill.key === skillKey('Redis'));

    // The student thinks Node.js is done, so it is the likeliest surprise.
    assert.ok(node < redis, 'a claimed core skill was ranked below an optional gap');
  });

  it('explains why every item is on the plan', () => {
    const roadmap = roadmapFor([{ name: 'Node.js' }]);

    for (const item of roadmap.items) {
      assert.equal(item.because.roleTitle, 'Backend Developer');
      assert.ok(['required', 'preferred'].includes(item.because.importance));
      assert.ok(item.because.currentStatus);
      assert.ok(item.description?.length > 0, `${item.skill.name} has no description`);
    }
  });

  it('gives every item a verification step that reaches a real status', () => {
    const roadmap = roadmapFor([]);

    for (const item of roadmap.items) {
      // The verification step is what makes this a roadmap and not a
      // reading list.
      assert.equal(item.verification.method, 'project');
      assert.equal(item.verification.reaches, 'supported');
      assert.equal(item.verification.available, true);
      assert.equal(item.verification.alternative.reaches, 'verified');
      assert.equal(item.verification.alternative.available, false);
    }
  });

  it('never fabricates a resource link', () => {
    const roadmap = roadmapFor([]);

    for (const item of roadmap.items) {
      assert.ok(item.resources.length > 0, `${item.skill.name} has no resources`);

      for (const resource of item.resources) {
        // A made-up URL is worse than no URL: a student following a dead
        // link has been actively misled.
        assert.equal(resource.url, null, `${item.skill.name} has an invented link`);
        assert.equal(resource.verified, false);
        assert.ok(resource.title?.length > 0);
      }
    }
  });

  it('says in the payload that its resources are not curated', () => {
    const roadmap = roadmapFor([]);

    assert.equal(roadmap.method.resourcesVerified, false);
    assert.match(roadmap.method.resourceNote, /no verified course catalogue/);
    assert.equal(roadmap.method.usesAi, false);
    assert.equal(roadmap.method.generatedFrom, 'skill-gap');
  });

  it('gives a search hint a student can act on themselves', () => {
    const roadmap = roadmapFor([]);

    const documentation = itemFor(roadmap, 'SQL').resources.find(
      (resource) => resource.type === 'documentation',
    );

    assert.match(documentation.searchHint, /SQL/);
  });

  it('lists a prerequisite only when it is also on the plan', () => {
    // Express.js needs JavaScript and Node.js. Here all three are missing,
    // so both prerequisites are real and reachable.
    const roadmap = roadmapFor([], { maxItems: 25 });
    const express = itemFor(roadmap, 'Express.js');

    const names = express.prerequisites.map((prerequisite) => prerequisite.name);
    assert.ok(names.includes('JavaScript'));
    assert.ok(names.includes('Node.js'));

    for (const prerequisite of express.prerequisites) {
      assert.ok(
        roadmap.items.some((item) => item.id === prerequisite.itemId),
        `prerequisite ${prerequisite.name} points at no item on this roadmap`,
      );
    }
  });

  it('drops a prerequisite the student already has', () => {
    const roadmap = roadmapFor(
      [
        { name: 'JavaScript', strength: 'supported' },
        { name: 'Node.js', strength: 'supported' },
      ],
      { maxItems: 25 },
    );

    // Both foundations are demonstrated, so neither is a prerequisite left
    // to do.
    assert.deepEqual(itemFor(roadmap, 'Express.js').prerequisites, []);
  });

  it('orders a prerequisite before the item that needs it', () => {
    const roadmap = roadmapFor([], { maxItems: 25 });

    const javascript = roadmap.items.findIndex(
      (item) => item.skill.key === skillKey('JavaScript'),
    );
    const express = roadmap.items.findIndex((item) => item.skill.key === skillKey('Express.js'));

    assert.ok(javascript < express, 'Express.js was planned before JavaScript');
  });

  it('does not store a completion flag that could contradict the evidence', () => {
    const roadmap = roadmapFor([{ name: 'Node.js' }]);

    const node = itemFor(roadmap, 'Node.js');

    // A student completes an item by adding evidence, which closes the gap,
    // which removes the item. A stored flag could disagree with that.
    assert.equal(node.completion.isComplete, false);
    assert.equal(node.completion.status, 'claimed');
    assert.match(node.completion.completesWhen, /supported/);
  });

  it('numbers items in the order they should be worked through', () => {
    const roadmap = roadmapFor([]);

    assert.deepEqual(
      roadmap.items.map((item) => item.order),
      roadmap.items.map((_, index) => index + 1),
    );
  });

  it('caps the plan but reports how much was left out', () => {
    const roadmap = roadmapFor([], { maxItems: 3 });

    assert.equal(roadmap.items.length, 3);
    // A student must not be left thinking a three-item plan is the whole of it.
    assert.ok(roadmap.summary.actionableGaps > 3);
  });

  it('gives items stable ids', () => {
    const first = roadmapFor([{ name: 'Node.js' }]);
    const second = roadmapFor([{ name: 'Node.js' }]);

    assert.deepEqual(
      first.items.map((item) => item.id),
      second.items.map((item) => item.id),
    );
    assert.match(first.items[0].id, /^backend-developer:/);
  });

  it('is deterministic', () => {
    const skills = [{ name: 'Node.js' }, { name: 'JavaScript', strength: 'supported' }];

    assert.deepEqual(roadmapFor(skills), roadmapFor(skills));
  });

  it('estimates effort in bands, never in invented hours', () => {
    const roadmap = roadmapFor([]);

    const serialised = JSON.stringify(roadmap).toLowerCase();
    for (const forbidden of ['hours', 'weeks to', 'days to complete', 'minutes']) {
      assert.ok(!serialised.includes(forbidden), `roadmap claims a duration: "${forbidden}"`);
    }

    for (const item of roadmap.items) {
      assert.ok(['quick', 'moderate', 'substantial'].includes(item.estimatedEffort));
    }
  });
});

// --------------------------------------------------------------------- API

describe('roadmap API', () => {
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

  const fetchRoadmap = (token, roleId, query = '') =>
    getWithToken(server.baseUrl, `/api/careers/roles/${roleId}/roadmap${query}`, token);

  it('requires authentication', async () => {
    const { status, body } = await requestWithHeaders(
      server.baseUrl,
      '/api/careers/roles/backend-developer/roadmap',
    );

    assert.equal(status, 401);
    assert.equal(body.errorCode, ERROR_CODES.AUTH_TOKEN_MISSING);
  });

  it('refuses without a CareerTwin', async () => {
    const token = await studentWith('notwin@example.com', null);

    const { status, body } = await fetchRoadmap(token, 'backend-developer');

    assert.equal(status, 409);
    assert.equal(body.errorCode, ERROR_CODES.CAREER_TWIN_NOT_FOUND);
  });

  it('answers 404 for a role outside the catalogue', async () => {
    const token = await studentWith('norole@example.com', {
      skills: [{ name: 'Node.js', level: 'advanced' }],
    });

    const { status, body } = await fetchRoadmap(token, 'time-traveller');

    assert.equal(status, 404);
    assert.equal(body.errorCode, ERROR_CODES.CAREER_ROLE_NOT_FOUND);
  });

  it('generates a plan from the student\'s real gaps', async () => {
    const token = await studentWith('plan@example.com', {
      skills: [
        { name: 'JavaScript', level: 'advanced' },
        { name: 'Node.js', level: 'expert' },
      ],
      projects: [{ title: 'Nexora', technologies: ['JavaScript'] }],
    });

    const { status, body } = await fetchRoadmap(token, 'backend-developer');
    const { roadmap } = body.data;

    assert.equal(status, 200);
    assert.ok(roadmap.items.length > 0);

    // JavaScript is demonstrated by a project, so it is not on the plan.
    const planned = roadmap.items.map((item) => item.skill.name);
    assert.ok(!planned.includes('JavaScript'));

    // Node.js was declared "expert" but never used — demonstrate, not learn.
    const node = roadmap.items.find((item) => item.skill.name === 'Node.js');
    assert.match(node.title, /^Demonstrate/);
    assert.equal(node.priority, 'high');

    // SQL was never mentioned at all.
    const sql = roadmap.items.find((item) => item.skill.name === 'SQL');
    assert.match(sql.title, /^Learn/);
    assert.equal(sql.priority, 'critical');
  });

  it('returns no plan when the student already meets the role', async () => {
    const token = await studentWith('done@example.com', {
      skills: [...BACKEND.requiredSkills, ...BACKEND.preferredSkills].map((name) => ({
        name,
        level: 'advanced',
      })),
      projects: [
        {
          title: 'Everything',
          technologies: [...BACKEND.requiredSkills, ...BACKEND.preferredSkills],
        },
      ],
    });

    const { status, body } = await fetchRoadmap(token, 'backend-developer');

    // Every skill is `supported`, which is the highest status reachable
    // today, so there is nothing left to plan.
    assert.equal(status, 200);
    assert.deepEqual(body.data.roadmap.items, []);
    assert.match(body.message, /already meet what this role asks for/);
  });

  it('never returns a fabricated link', async () => {
    const token = await studentWith('links@example.com', {
      skills: [{ name: 'Node.js', level: 'advanced' }],
    });

    const { body } = await fetchRoadmap(token, 'backend-developer');

    for (const item of body.data.roadmap.items) {
      for (const resource of item.resources) {
        assert.equal(resource.url, null);
      }
    }
    assert.equal(body.data.roadmap.method.resourcesVerified, false);
  });

  it('honours the item cap', async () => {
    const token = await studentWith('cap@example.com', {
      skills: [{ name: 'Node.js', level: 'advanced' }],
    });

    const { body } = await fetchRoadmap(token, 'backend-developer', '?maxItems=2');

    assert.equal(body.data.roadmap.items.length, 2);
    assert.ok(body.data.roadmap.summary.actionableGaps > 2);
  });

  it('rejects a nonsensical cap', async () => {
    const token = await studentWith('badcap@example.com', {
      skills: [{ name: 'Node.js', level: 'advanced' }],
    });

    const { status, body } = await fetchRoadmap(token, 'backend-developer', '?maxItems=500');

    assert.equal(status, 400);
    assert.equal(body.errorCode, ERROR_CODES.VALIDATION_ERROR);
  });

  it('scopes the plan to the calling student', async () => {
    const beginner = await studentWith('owner1@example.com', {
      skills: [{ name: 'HTML', level: 'beginner' }],
    });
    const advanced = await studentWith('owner2@example.com', {
      skills: BACKEND.requiredSkills.map((name) => ({ name, level: 'advanced' })),
      projects: [{ title: 'API', technologies: BACKEND.requiredSkills }],
    });

    const beginnerPlan = await fetchRoadmap(beginner, 'backend-developer');
    const advancedPlan = await fetchRoadmap(advanced, 'backend-developer');

    assert.equal(beginnerPlan.body.data.roadmap.summary.critical, 4);
    assert.equal(advancedPlan.body.data.roadmap.summary.critical, 0);
  });

  it('shrinks the plan as the student closes a gap', async () => {
    const token = await studentWith('progress@example.com', {
      skills: [{ name: 'Node.js', level: 'advanced' }],
    });

    const before = await fetchRoadmap(token, 'backend-developer', '?maxItems=25');
    const beforeCount = before.body.data.roadmap.summary.actionableGaps;

    // Do the thing the roadmap asked for: build something with Node.js.
    await sendJsonWithToken(server.baseUrl, '/api/profile', {
      method: 'PATCH',
      token,
      payload: { projects: [{ title: 'API Server', technologies: ['Node.js'] }] },
    });
    await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

    const after = await fetchRoadmap(token, 'backend-developer', '?maxItems=25');

    // The item closes because the evidence changed, not because anything
    // was marked done.
    assert.equal(after.body.data.roadmap.summary.actionableGaps, beforeCount - 1);
    assert.ok(
      !after.body.data.roadmap.items.some((item) => item.skill.name === 'Node.js'),
      'the completed item is still on the plan',
    );
  });
});
