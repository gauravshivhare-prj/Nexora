import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { EVIDENCE_SOURCES, EVIDENCE_STRENGTH } from '../src/domain/evidence/evidence.js';
import { isCareerTwinStale } from '../src/models/index.js';
import {
  registerAiProvider,
  resetAiProviders,
  useAiProvider,
} from '../src/services/ai/aiProvider.js';
import {
  clearProfiles,
  clearResumes,
  clearUsers,
  getWithToken,
  postJson,
  resetRateLimiters,
  sendJsonWithToken,
  sendWithToken,
  startTestServer,
  uploadWithToken,
} from './helpers/testServer.js';

/**
 * Evidence reaching the CareerTwin.
 *
 * The twin is where the product's central claim lives: that it reports what
 * a student can demonstrate rather than what they typed. These tests follow
 * real evidence in through both doors — a profile and an analysed resume,
 * including an uploaded one — and check that its provenance survives the
 * trip, that strength is derived from the source rather than asserted, and
 * that the twin notices when the evidence underneath it moves.
 */

const PASSWORD = 'Str0ngPassphrase';

const RESUME_TEXT = `Gaurav Shivhare
gaurav@example.com | Bhopal

SKILLS
Docker, Kubernetes, PostgreSQL

CERTIFICATIONS
Certified Kubernetes Administrator

PROJECTS
Shipyard - a deployment tool built with Docker and Go.`;

/** What the provider double returns: everything below is in the text above. */
const EXTRACTION = {
  basics: { fullName: 'Gaurav Shivhare', email: 'gaurav@example.com' },
  skills: [{ name: 'Docker' }, { name: 'Kubernetes' }, { name: 'PostgreSQL' }],
  certifications: [{ name: 'Certified Kubernetes Administrator' }],
  projects: [{ title: 'Shipyard', technologies: ['Docker', 'Go'] }],
};

describe('career twin evidence integration', () => {
  let server;
  let counter = 0;

  before(async () => {
    server = await startTestServer();

    registerAiProvider({
      name: 'test-double',
      async complete() {
        return { text: JSON.stringify(EXTRACTION), model: 'test-model' };
      },
    });
  });

  after(async () => {
    resetAiProviders();
    await server.close();
  });

  beforeEach(async () => {
    await clearResumes();
    await clearProfiles();
    await clearUsers();
    resetRateLimiters();
    useAiProvider('test-double');
  });

  async function signUp() {
    counter += 1;
    const email = `twin.evidence.${Date.now()}.${counter}@example.com`;

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

  const saveProfile = (token, payload) =>
    sendJsonWithToken(server.baseUrl, '/api/profile', { method: 'PATCH', token, payload });

  /** Uploads the resume as a file and analyses it. Returns its id. */
  async function uploadAndAnalyse(token, label = 'Uploaded CV') {
    const { body: uploaded, status } = await uploadWithToken(
      server.baseUrl,
      '/api/resumes/upload',
      {
        token,
        file: { buffer: Buffer.from(RESUME_TEXT, 'utf8'), filename: 'cv.txt', type: 'text/plain' },
        fields: { label },
      },
    );
    assert.equal(status, 201, 'the upload was rejected');

    const id = uploaded.data.resume.id;
    const analysed = await sendWithToken(server.baseUrl, `/api/resumes/${id}/analysis`, {
      method: 'POST',
      token,
    });
    assert.equal(analysed.status, 200, 'the analysis failed');

    return id;
  }

  const generate = (token) =>
    sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

  const read = (token) => getWithToken(server.baseUrl, '/api/career-twin', token);

  const skillNamed = (twin, name) => twin.skills.find((skill) => skill.name === name);

  // -------------------------------------------- evidence from an upload

  it('builds a twin from an uploaded, analysed resume', async () => {
    const token = await signUp();
    await uploadAndAnalyse(token);

    const { status, body } = await generate(token);
    assert.equal(status, 200);

    const twin = body.data.careerTwin;
    // An uploaded resume must be worth exactly as much as a pasted one:
    // nothing downstream should care which door the text came through.
    assert.ok(skillNamed(twin, 'Docker'), 'no Docker skill reached the twin');
    assert.equal(twin.indicators.analysedResumeCount, 1);
  });

  it('records where each piece of evidence came from', async () => {
    const token = await signUp();
    const resumeId = await uploadAndAnalyse(token);
    await generate(token);

    const { body } = await read(token);
    const docker = skillNamed(body.data.careerTwin, 'Docker');

    // Provenance is the whole point. Every item names its source, says why
    // in words a student can read, and points back at the record it came
    // from — a strength with no traceable reason is the unexplained score
    // this design exists to rule out.
    for (const item of docker.evidence) {
      assert.ok(EVIDENCE_SOURCES[item.source.toUpperCase()], `unknown source ${item.source}`);
      assert.ok(item.detail.length > 0, 'evidence carried no explanation');
    }

    const fromResume = docker.evidence.find((item) => item.reference === resumeId);
    assert.ok(fromResume, 'no evidence traced back to the resume it came from');
    assert.match(fromResume.detail, /Uploaded CV/);
  });

  it('raises a resume-only skill to supported when a project backs it', async () => {
    const token = await signUp();
    await uploadAndAnalyse(token);
    await generate(token);

    const { body } = await read(token);
    const twin = body.data.careerTwin;

    // Docker is both listed and used by a project in the resume.
    assert.equal(skillNamed(twin, 'Docker').strength, EVIDENCE_STRENGTH.SUPPORTED);

    // PostgreSQL is only listed. A resume is a document its subject wrote
    // about themselves, so naming a skill in one is a claim, not a showing.
    assert.equal(skillNamed(twin, 'PostgreSQL').strength, EVIDENCE_STRENGTH.CLAIMED);
  });

  it('uses a resume certification as corroboration for a skill', async () => {
    const token = await signUp();
    await uploadAndAnalyse(token);
    await generate(token);

    const { body } = await read(token);
    const kubernetes = skillNamed(body.data.careerTwin, 'Kubernetes');

    // The certification is grounded against the resume text like everything
    // else, so discarding it would throw away evidence Nexora had earned.
    const certification = kubernetes.evidence.find(
      (item) => item.source === EVIDENCE_SOURCES.CERTIFICATION,
    );
    assert.ok(certification, 'a resume certification produced no evidence');
    assert.match(certification.detail, /Certified Kubernetes Administrator/);
    assert.equal(kubernetes.strength, EVIDENCE_STRENGTH.SUPPORTED);
  });

  it('merges profile and resume evidence for the same skill', async () => {
    const token = await signUp();

    await saveProfile(token, {
      skills: [{ name: 'Docker', level: 'advanced' }],
      projects: [],
      certifications: [],
    });
    await uploadAndAnalyse(token);
    await generate(token);

    const { body } = await read(token);
    const docker = skillNamed(body.data.careerTwin, 'Docker');

    const sources = new Set(docker.evidence.map((item) => item.source));
    assert.ok(sources.has(EVIDENCE_SOURCES.SELF_DECLARED), 'the profile claim was lost');
    assert.ok(sources.has(EVIDENCE_SOURCES.RESUME), 'the resume mention was lost');

    // The student's own rating is kept beside the derived strength, never
    // folded into it: "I call myself advanced" and "Nexora has seen a
    // project" have to stay visibly different things.
    assert.equal(docker.selfDeclaredLevel, 'advanced');
    assert.equal(docker.strength, EVIDENCE_STRENGTH.SUPPORTED);
  });

  it('never reports verified, because nothing produces it yet', async () => {
    const token = await signUp();
    await uploadAndAnalyse(token);
    await generate(token);

    const { body } = await read(token);
    const twin = body.data.careerTwin;

    assert.equal(twin.indicators.verified, 0);
    for (const skill of twin.skills) {
      assert.notEqual(
        skill.strength,
        EVIDENCE_STRENGTH.VERIFIED,
        `${skill.name} was reported as verified without an independent check`,
      );
    }
  });

  // ------------------------------------------------------ AI comes last

  it('builds a complete twin with no provider configured', async () => {
    const token = await signUp();
    await uploadAndAnalyse(token);

    // Analysis is already done and stored; the twin itself must need no
    // model at all. This is the state Nexora ships in.
    useAiProvider(null);

    const { status, body } = await sendWithToken(
      server.baseUrl,
      '/api/career-twin?narrative=true',
      { method: 'POST', token },
    );

    assert.equal(status, 200, 'an unconfigured provider broke a deterministic build');
    const twin = body.data.careerTwin;

    assert.ok(twin.skills.length > 0, 'the deterministic facts were lost with the narrative');
    assert.equal(twin.narrative, null, 'a narrative was invented with no provider');
    assert.equal(skillNamed(twin, 'Docker').strength, EVIDENCE_STRENGTH.SUPPORTED);
  });

  // -------------------------------------------------------- stale state

  it('reports itself stale after the profile changes', async () => {
    const token = await signUp();
    await uploadAndAnalyse(token);
    await generate(token);

    await saveProfile(token, { career: { targetRole: 'Platform Engineer' } });

    const { body } = await read(token);
    assert.equal(body.data.careerTwin.isStale, true);
    assert.match(String(body.data.careerTwin.staleReasons), /profile has changed/);
  });

  it('reports itself stale when a resume is analysed again', async () => {
    const token = await signUp();
    const resumeId = await uploadAndAnalyse(token);
    await generate(token);

    const fresh = await read(token);
    assert.equal(fresh.data?.careerTwin?.isStale ?? fresh.body.data.careerTwin.isStale, false);

    // Re-analysing keeps the resume id and replaces the parsed data, so the
    // set of analysed ids is identical while every skill underneath the
    // twin may have moved. Comparing ids alone cannot see this.
    await new Promise((resolve) => setTimeout(resolve, 15));
    const again = await sendWithToken(server.baseUrl, `/api/resumes/${resumeId}/analysis`, {
      method: 'POST',
      token,
    });
    assert.equal(again.status, 200);

    const { body } = await read(token);
    assert.equal(
      body.data.careerTwin.isStale,
      true,
      're-analysing a resume left the twin claiming to be current',
    );
    assert.match(String(body.data.careerTwin.staleReasons), /analysed again/);
  });

  it('is not stale immediately after being generated', async () => {
    const token = await signUp();
    await uploadAndAnalyse(token);
    await generate(token);

    const { body } = await read(token);
    assert.equal(body.data.careerTwin.isStale, false);
    assert.deepEqual(body.data.careerTwin.staleReasons, []);
  });

  // ------------------------------------------- the staleness rule itself

  describe('isCareerTwinStale', () => {
    const generatedAt = new Date('2026-01-10T10:00:00Z');
    const twin = {
      generatedAt,
      sources: { profileUpdatedAt: generatedAt, analysedResumeIds: ['a', 'b'] },
    };

    it('is current when nothing moved', () => {
      const result = isCareerTwinStale(twin, {
        profileUpdatedAt: generatedAt,
        analysedResumeIds: ['b', 'a'],
        latestAnalysisAt: new Date('2026-01-10T09:00:00Z'),
      });

      assert.equal(result.isStale, false);
    });

    it('notices a re-analysis under an unchanged set of ids', () => {
      const result = isCareerTwinStale(twin, {
        profileUpdatedAt: generatedAt,
        analysedResumeIds: ['a', 'b'],
        latestAnalysisAt: new Date('2026-01-10T11:00:00Z'),
      });

      assert.equal(result.isStale, true);
      assert.deepEqual(result.reasons, ['A resume has been analysed again since this was generated.']);
    });

    it('prefers the more specific reason when the set changed too', () => {
      const result = isCareerTwinStale(twin, {
        profileUpdatedAt: generatedAt,
        analysedResumeIds: ['a', 'b', 'c'],
        latestAnalysisAt: new Date('2026-01-10T11:00:00Z'),
      });

      // "You added a resume" is the useful thing to say; also reporting the
      // re-analysis would be two messages about one event.
      assert.deepEqual(result.reasons, [
        'Your analysed resumes have changed since this was generated.',
      ]);
    });

    it('tolerates a missing analysis timestamp', () => {
      const result = isCareerTwinStale(twin, {
        profileUpdatedAt: generatedAt,
        analysedResumeIds: ['a', 'b'],
      });

      assert.equal(result.isStale, false);
    });
  });
});
