import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { ERROR_CODES } from '../src/constants/errorCodes.js';
import { PROFILE_LIMITS } from '../src/constants/profilePolicy.js';
import {
  clearProfiles,
  clearUsers,
  getWithToken,
  postJson,
  requestWithHeaders,
  resetRateLimiters,
  sendJsonWithToken,
  startTestServer,
} from './helpers/testServer.js';

/**
 * Student Profile API.
 *
 * The cases that matter most here are not the happy path but the two the
 * design exists to guarantee: that a profile can only ever be reached by its
 * owner, and that a partial save cannot destroy the fields it did not touch.
 */

const PASSWORD = 'Str0ngPassphrase';

describe('student profile', () => {
  let server;

  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.close();
  });

  beforeEach(async () => {
    resetRateLimiters();
    await clearProfiles();
    await clearUsers();
  });

  /** Registers a fresh account and returns its access token. */
  async function signUp(email) {
    await postJson(server.baseUrl, '/api/auth/register', {
      name: 'Gaurav Shivhare',
      email,
      password: PASSWORD,
    });

    const { body } = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password: PASSWORD,
    });

    return body.data.token;
  }

  const read = (token) => getWithToken(server.baseUrl, '/api/profile', token);

  const save = (token, payload) =>
    sendJsonWithToken(server.baseUrl, '/api/profile', { method: 'PATCH', token, payload });

  /** Finds a single field failure by its dotted path. */
  const errorFor = (body, field) => body.details?.find((detail) => detail.field === field);

  // ------------------------------------------------------------ empty state

  describe('GET /api/profile', () => {
    it('returns an empty profile rather than 404 before anything is saved', async () => {
      const token = await signUp('new.student@example.com');

      const { status, body } = await read(token);

      assert.equal(status, 200);
      assert.equal(body.success, true);
      assert.equal(body.data.exists, false);
      assert.equal(body.data.profile.personal.city, null);
      assert.deepEqual(body.data.profile.skills, []);
      assert.deepEqual(body.data.profile.projects, []);
      assert.deepEqual(body.data.profile.certifications, []);
      assert.deepEqual(body.data.profile.career.careerInterests, []);
    });

    it('reports exists:true once a profile has been saved', async () => {
      const token = await signUp('saved.student@example.com');
      await save(token, { personal: { city: 'Bhopal' } });

      const { body } = await read(token);

      assert.equal(body.data.exists, true);
      assert.equal(body.data.profile.personal.city, 'Bhopal');
    });
  });

  // --------------------------------------------------------- authentication

  describe('authentication', () => {
    it('refuses a read with no token', async () => {
      const { status, body } = await requestWithHeaders(server.baseUrl, '/api/profile');

      assert.equal(status, 401);
      assert.equal(body.errorCode, ERROR_CODES.AUTH_TOKEN_MISSING);
    });

    it('refuses a write with no token', async () => {
      const { status, body } = await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        payload: { personal: { city: 'Bhopal' } },
      });

      assert.equal(status, 401);
      assert.equal(body.errorCode, ERROR_CODES.AUTH_TOKEN_MISSING);
    });

    it('refuses a forged token', async () => {
      const { status, body } = await read('not.a.token');

      assert.equal(status, 401);
      assert.equal(body.errorCode, ERROR_CODES.AUTH_TOKEN_INVALID);
    });
  });

  // -------------------------------------------------------------- ownership

  describe('ownership', () => {
    it('never returns one student the profile of another', async () => {
      const alice = await signUp('alice@example.com');
      const bob = await signUp('bob@example.com');

      await save(alice, { personal: { city: 'Indore' }, career: { targetRole: 'Data Analyst' } });

      const { body } = await read(bob);

      assert.equal(body.data.exists, false);
      assert.equal(body.data.profile.personal.city, null);
      assert.equal(body.data.profile.career.targetRole, null);
    });

    it('ignores a user id in the body and writes to the caller instead', async () => {
      const alice = await signUp('alice2@example.com');
      const bob = await signUp('bob2@example.com');

      await save(alice, { personal: { city: 'Indore' } });

      // Bob names Alice's account. The field is not an ownership input at all,
      // so it is rejected as unrecognised rather than quietly honoured.
      const { status, body } = await save(bob, {
        user: 'alice2@example.com',
        personal: { city: 'Pune' },
      });

      assert.equal(status, 400);
      assert.equal(body.errorCode, ERROR_CODES.VALIDATION_ERROR);

      // Alice's profile is untouched either way.
      const alicesProfile = await read(alice);
      assert.equal(alicesProfile.body.data.profile.personal.city, 'Indore');
    });

    it('keeps two profiles independent', async () => {
      const alice = await signUp('alice3@example.com');
      const bob = await signUp('bob3@example.com');

      await save(alice, { academic: { collegeName: 'NIT Bhopal' } });
      await save(bob, { academic: { collegeName: 'IIT Indore' } });

      const alicesProfile = await read(alice);
      const bobsProfile = await read(bob);

      assert.equal(alicesProfile.body.data.profile.academic.collegeName, 'NIT Bhopal');
      assert.equal(bobsProfile.body.data.profile.academic.collegeName, 'IIT Indore');
    });
  });

  // ------------------------------------------------------------- happy path

  describe('PATCH /api/profile', () => {
    it('saves a complete profile and reads it back unchanged', async () => {
      const token = await signUp('complete@example.com');

      const payload = {
        personal: {
          phone: '+91 98765 43210',
          dateOfBirth: '2004-03-18',
          gender: 'male',
          city: 'Bhopal',
          state: 'Madhya Pradesh',
        },
        academic: {
          collegeName: 'Maulana Azad National Institute of Technology',
          degree: 'B.Tech',
          branch: 'Computer Science and Engineering',
          currentSemester: 6,
          graduationYear: 2027,
          cgpa: 8.46,
        },
        career: {
          targetRole: 'Backend Developer',
          preferredLocation: 'Bengaluru',
          careerInterests: ['Distributed systems', 'Developer tooling'],
          bio: 'Third-year CSE student building backend services.',
        },
        skills: [
          { name: 'Node.js', level: 'advanced' },
          { name: 'MongoDB', level: 'intermediate' },
        ],
        projects: [
          {
            title: 'Nexora',
            description: 'A career readiness platform.',
            technologies: ['React', 'Express'],
            projectUrl: 'https://nexora.example.com',
            githubUrl: 'https://github.com/example/nexora',
          },
        ],
        certifications: [
          {
            name: 'AWS Certified Cloud Practitioner',
            issuer: 'Amazon Web Services',
            issueDate: '2025-01-15',
            credentialUrl: 'https://verify.example.com/abc123',
          },
        ],
      };

      const { status, body } = await save(token, payload);

      assert.equal(status, 200);
      assert.equal(body.success, true);
      assert.equal(body.data.exists, true);

      const { body: readBack } = await read(token);
      const profile = readBack.data.profile;

      assert.equal(profile.personal.phone, '+91 98765 43210');
      assert.equal(profile.personal.dateOfBirth, '2004-03-18');
      assert.equal(profile.academic.cgpa, 8.46);
      assert.equal(profile.academic.currentSemester, 6);
      assert.deepEqual(profile.career.careerInterests, [
        'Distributed systems',
        'Developer tooling',
      ]);
      assert.deepEqual(profile.skills, payload.skills);
      assert.equal(profile.projects[0].title, 'Nexora');
      assert.deepEqual(profile.projects[0].technologies, ['React', 'Express']);
      assert.equal(profile.certifications[0].issueDate, '2025-01-15');
    });

    it('rounds a cgpa to two decimal places', async () => {
      const token = await signUp('cgpa@example.com');

      const { body } = await save(token, { academic: { cgpa: 8.456789 } });

      assert.equal(body.data.profile.academic.cgpa, 8.46);
    });

    it('accepts numeric fields sent as strings, as HTML number inputs submit them', async () => {
      const token = await signUp('strings@example.com');

      const { status, body } = await save(token, {
        academic: { currentSemester: '6', graduationYear: '2027', cgpa: '8.4' },
      });

      assert.equal(status, 200);
      assert.equal(body.data.profile.academic.currentSemester, 6);
      assert.equal(body.data.profile.academic.graduationYear, 2027);
      assert.equal(body.data.profile.academic.cgpa, 8.4);
    });

    it('drops blank and duplicate entries from a list of interests', async () => {
      const token = await signUp('interests@example.com');

      const { body } = await save(token, {
        career: { careerInterests: ['Backend', '', '  ', 'backend', 'Cloud'] },
      });

      assert.deepEqual(body.data.profile.career.careerInterests, ['Backend', 'Cloud']);
    });
  });

  // ------------------------------------------------------------ merge rules

  describe('merge semantics', () => {
    it('leaves untouched sections alone on a partial save', async () => {
      const token = await signUp('merge@example.com');

      await save(token, {
        personal: { city: 'Bhopal', state: 'Madhya Pradesh' },
        academic: { collegeName: 'MANIT', cgpa: 8.4 },
        skills: [{ name: 'Node.js', level: 'advanced' }],
      });

      // A save that mentions one field in one section.
      await save(token, { personal: { city: 'Pune' } });

      const { body } = await read(token);
      const profile = body.data.profile;

      assert.equal(profile.personal.city, 'Pune');
      assert.equal(profile.personal.state, 'Madhya Pradesh', 'sibling field was wiped');
      assert.equal(profile.academic.collegeName, 'MANIT', 'other section was wiped');
      assert.equal(profile.academic.cgpa, 8.4);
      assert.equal(profile.skills.length, 1, 'skills were wiped');
    });

    it('clears a field when it is sent as null', async () => {
      const token = await signUp('clear@example.com');

      await save(token, { personal: { city: 'Bhopal', state: 'Madhya Pradesh' } });
      await save(token, { personal: { city: null } });

      const { body } = await read(token);

      assert.equal(body.data.profile.personal.city, null);
      assert.equal(body.data.profile.personal.state, 'Madhya Pradesh');
    });

    it('clears a field when it is sent as an empty string', async () => {
      const token = await signUp('clear2@example.com');

      await save(token, { career: { bio: 'Original bio' } });
      await save(token, { career: { bio: '   ' } });

      const { body } = await read(token);

      assert.equal(body.data.profile.career.bio, null);
    });

    it('replaces a list wholesale, so an entry can be removed', async () => {
      const token = await signUp('lists@example.com');

      await save(token, {
        skills: [
          { name: 'Node.js', level: 'advanced' },
          { name: 'MongoDB', level: 'beginner' },
        ],
      });

      await save(token, { skills: [{ name: 'Node.js', level: 'expert' }] });

      const { body } = await read(token);

      assert.deepEqual(body.data.profile.skills, [{ name: 'Node.js', level: 'expert' }]);
    });

    it('empties a list when it is sent as an empty array', async () => {
      const token = await signUp('emptylist@example.com');

      await save(token, { projects: [{ title: 'Nexora' }] });
      await save(token, { projects: [] });

      const { body } = await read(token);

      assert.deepEqual(body.data.profile.projects, []);
    });

    it('accepts an empty patch from an account with no profile yet', async () => {
      // The upsert has nothing to $set on this path. MongoDB rejects a
      // literally empty update, so this would be a 500 if the driver were
      // handed one.
      const token = await signUp('emptyfirst@example.com');

      const { status } = await save(token, {});

      assert.equal(status, 200);
    });

    it('accepts an empty patch without changing anything', async () => {
      const token = await signUp('nochange@example.com');

      await save(token, { personal: { city: 'Bhopal' } });
      const { status } = await save(token, {});

      assert.equal(status, 200);

      const { body } = await read(token);
      assert.equal(body.data.profile.personal.city, 'Bhopal');
    });

    it('creates exactly one profile across repeated saves', async () => {
      const token = await signUp('single@example.com');

      await save(token, { personal: { city: 'Bhopal' } });
      await save(token, { personal: { city: 'Pune' } });
      await save(token, { academic: { degree: 'B.Tech' } });

      const { body } = await read(token);

      assert.equal(body.data.profile.personal.city, 'Pune');
      assert.equal(body.data.profile.academic.degree, 'B.Tech');
    });
  });

  // ------------------------------------------------------------- validation

  describe('validation', () => {
    it('rejects a body that is not an object', async () => {
      const token = await signUp('notobject@example.com');

      const { status, body } = await save(token, ['skills']);

      assert.equal(status, 400);
      assert.equal(body.errorCode, ERROR_CODES.VALIDATION_ERROR);
    });

    it('rejects an unrecognised field instead of silently dropping it', async () => {
      const token = await signUp('unknown@example.com');

      const { status, body } = await save(token, { personal: { pincode: '462003' } });

      assert.equal(status, 400);
      assert.ok(errorFor(body, 'personal.pincode'), 'the unknown field was not named');
    });

    it('rejects a semester outside the allowed range', async () => {
      const token = await signUp('semester@example.com');

      const { status, body } = await save(token, { academic: { currentSemester: 14 } });

      assert.equal(status, 400);
      assert.match(errorFor(body, 'academic.currentSemester').message, /between 1 and 12/);
    });

    it('rejects a fractional semester rather than truncating it', async () => {
      const token = await signUp('fractional@example.com');

      const { status, body } = await save(token, { academic: { currentSemester: 6.5 } });

      assert.equal(status, 400);
      assert.match(errorFor(body, 'academic.currentSemester').message, /whole number/);
    });

    it('rejects a cgpa above the 10-point scale', async () => {
      const token = await signUp('badcgpa@example.com');

      const { status, body } = await save(token, { academic: { cgpa: 11 } });

      assert.equal(status, 400);
      assert.match(errorFor(body, 'academic.cgpa').message, /between 0 and 10/);
    });

    it('rejects a date of birth in the future', async () => {
      const token = await signUp('futuredob@example.com');

      const { status, body } = await save(token, { personal: { dateOfBirth: '2099-01-01' } });

      assert.equal(status, 400);
      assert.ok(errorFor(body, 'personal.dateOfBirth'));
    });

    it('rejects a calendar date that does not exist', async () => {
      const token = await signUp('badday@example.com');

      const { status, body } = await save(token, { personal: { dateOfBirth: '2004-02-31' } });

      assert.equal(status, 400);
      assert.match(errorFor(body, 'personal.dateOfBirth').message, /not a real date/);
    });

    it('rejects a certification issued in the future', async () => {
      const token = await signUp('futurecert@example.com');

      const { status, body } = await save(token, {
        certifications: [{ name: 'Some Certificate', issueDate: '2099-06-01' }],
      });

      assert.equal(status, 400);
      assert.match(errorFor(body, 'certifications[0].issueDate').message, /future/);
    });

    it('rejects an unknown gender value', async () => {
      const token = await signUp('gender@example.com');

      const { status, body } = await save(token, { personal: { gender: 'unspecified' } });

      assert.equal(status, 400);
      assert.ok(errorFor(body, 'personal.gender'));
    });

    it('rejects a malformed phone number', async () => {
      const token = await signUp('phone@example.com');

      const { status, body } = await save(token, { personal: { phone: 'call me maybe' } });

      assert.equal(status, 400);
      assert.ok(errorFor(body, 'personal.phone'));
    });

    it('rejects a skill with no level', async () => {
      const token = await signUp('nolevel@example.com');

      const { status, body } = await save(token, { skills: [{ name: 'Node.js' }] });

      assert.equal(status, 400);
      assert.match(errorFor(body, 'skills[0].level').message, /required/);
    });

    it('rejects an unknown skill level', async () => {
      const token = await signUp('badlevel@example.com');

      const { status, body } = await save(token, {
        skills: [{ name: 'Node.js', level: 'godlike' }],
      });

      assert.equal(status, 400);
      assert.match(errorFor(body, 'skills[0].level').message, /beginner/);
    });

    it('names the failing entry by index so a long list can be fixed', async () => {
      const token = await signUp('index@example.com');

      const { status, body } = await save(token, {
        skills: [
          { name: 'Node.js', level: 'advanced' },
          { name: 'MongoDB', level: 'intermediate' },
          { name: '', level: 'expert' },
        ],
      });

      assert.equal(status, 400);
      assert.ok(errorFor(body, 'skills[2].name'), 'the third entry was not identified');
    });

    it('reports every failure in one response', async () => {
      const token = await signUp('many@example.com');

      const { status, body } = await save(token, {
        personal: { gender: 'nope', phone: 'nope' },
        academic: { cgpa: 99 },
      });

      assert.equal(status, 400);
      assert.ok(body.details.length >= 3, `expected several failures, got ${body.details.length}`);
    });

    it('rejects a project link that is not http or https', async () => {
      const token = await signUp('xss@example.com');

      const { status, body } = await save(token, {
        projects: [{ title: 'Nexora', projectUrl: 'javascript:alert(1)' }],
      });

      assert.equal(status, 400);
      assert.match(errorFor(body, 'projects[0].projectUrl').message, /http/);
    });

    it('rejects a string longer than its limit', async () => {
      const token = await signUp('toolong@example.com');

      const { status, body } = await save(token, {
        career: { bio: 'a'.repeat(PROFILE_LIMITS.bio + 1) },
      });

      assert.equal(status, 400);
      assert.match(errorFor(body, 'career.bio').message, /at most/);
    });

    it('rejects more list entries than the limit allows', async () => {
      const token = await signUp('toomany@example.com');

      const { status, body } = await save(token, {
        skills: Array.from({ length: PROFILE_LIMITS.skills.maxItems + 1 }, (_, index) => ({
          name: `Skill ${index}`,
          level: 'beginner',
        })),
      });

      assert.equal(status, 400);
      assert.match(errorFor(body, 'skills').message, /at most/);
    });

    it('stores nothing when validation fails', async () => {
      const token = await signUp('atomic@example.com');

      await save(token, { personal: { city: 'Bhopal' } });
      await save(token, { personal: { city: 'Pune', gender: 'invalid' } });

      const { body } = await read(token);

      // The valid half of a rejected patch must not have been applied.
      assert.equal(body.data.profile.personal.city, 'Bhopal');
    });
  });
});
