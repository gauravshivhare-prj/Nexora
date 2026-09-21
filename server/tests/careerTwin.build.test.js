import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildCareerTwin } from '../src/domain/careerTwin/buildCareerTwin.js';
import {
  groundNarrative,
  validateNarrative,
} from '../src/domain/careerTwin/careerTwinNarrative.js';
import {
  EVIDENCE_SOURCES,
  EVIDENCE_STRENGTH,
  makeEvidence,
  meetsStrength,
  strongestStrength,
} from '../src/domain/evidence/evidence.js';

/**
 * CareerTwin construction, as a pure function.
 *
 * These tests are the specification for what Nexora is willing to claim
 * about a student. The cases that matter are the ones about restraint: that
 * a typed skill is not treated as a demonstrated one, that nothing invents a
 * proficiency, and that no score appears without a defined calculation.
 */

/** A profile with one of everything, for tests that need a populated student. */
function profileWith(overrides = {}) {
  return {
    academic: {
      degree: 'B.Tech',
      branch: 'Computer Science and Engineering',
      collegeName: 'MANIT',
      currentSemester: 6,
      graduationYear: 2027,
      cgpa: 8.4,
    },
    career: {
      targetRole: 'Backend Developer',
      preferredLocation: 'Bengaluru',
      careerInterests: ['Distributed systems'],
      bio: null,
    },
    skills: [],
    projects: [],
    certifications: [],
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    ...overrides,
  };
}

/** An analysed resume in the public shape the service passes in. */
function analysedResume(parsed, { id = 'resume-1', label = 'My CV' } = {}) {
  return { id, label, parsed: { skills: [], projects: [], ...parsed } };
}

// ------------------------------------------------------------ evidence model

describe('evidence model', () => {
  it('rates a listed skill as claimed and a project technology as supported', () => {
    assert.equal(
      makeEvidence({ source: EVIDENCE_SOURCES.SELF_DECLARED, detail: 'x' }).strength,
      EVIDENCE_STRENGTH.CLAIMED,
    );
    assert.equal(
      makeEvidence({ source: EVIDENCE_SOURCES.PROJECT, detail: 'x' }).strength,
      EVIDENCE_STRENGTH.SUPPORTED,
    );
  });

  it('rates a resume as claimed, not supported', () => {
    // A resume is a document its subject wrote about themselves. Grounding
    // proves the resume says it, not that it is true.
    assert.equal(
      makeEvidence({ source: EVIDENCE_SOURCES.RESUME, detail: 'x' }).strength,
      EVIDENCE_STRENGTH.CLAIMED,
    );
  });

  it('rates a certification as supported, not verified', () => {
    // Nexora has not fetched the credential. An unchecked link is not proof.
    assert.equal(
      makeEvidence({ source: EVIDENCE_SOURCES.CERTIFICATION, detail: 'x' }).strength,
      EVIDENCE_STRENGTH.SUPPORTED,
    );
  });

  it('refuses a source with no declared strength rather than guessing one', () => {
    assert.throws(() => makeEvidence({ source: 'vibes', detail: 'x' }), /Unknown evidence source/);
  });

  it('takes the strongest evidence, not an average', () => {
    const items = [
      makeEvidence({ source: EVIDENCE_SOURCES.SELF_DECLARED, detail: 'x' }),
      makeEvidence({ source: EVIDENCE_SOURCES.PROJECT, detail: 'x' }),
    ];

    // Passing an assessment is not diluted by also having typed the skill in.
    assert.equal(strongestStrength(items), EVIDENCE_STRENGTH.SUPPORTED);
  });

  it('returns no strength for no evidence, rather than inventing the lowest', () => {
    assert.equal(strongestStrength([]), null);
  });

  it('orders the scale correctly', () => {
    assert.ok(meetsStrength(EVIDENCE_STRENGTH.VERIFIED, EVIDENCE_STRENGTH.SUPPORTED));
    assert.ok(meetsStrength(EVIDENCE_STRENGTH.SUPPORTED, EVIDENCE_STRENGTH.SUPPORTED));
    assert.ok(!meetsStrength(EVIDENCE_STRENGTH.CLAIMED, EVIDENCE_STRENGTH.SUPPORTED));
  });
});

// ------------------------------------------------------------------ building

describe('buildCareerTwin', () => {
  it('records a listed skill as claimed, with the reason', () => {
    const twin = buildCareerTwin({
      profile: profileWith({ skills: [{ name: 'Node.js', level: 'advanced' }] }),
    });

    const [skill] = twin.skills;
    assert.equal(skill.name, 'Node.js');
    assert.equal(skill.strength, EVIDENCE_STRENGTH.CLAIMED);
    assert.equal(skill.selfDeclaredLevel, 'advanced');
    assert.match(skill.evidence[0].detail, /listed this on your profile as advanced/);
  });

  it('does not promote a skill because the student called themselves an expert', () => {
    const twin = buildCareerTwin({
      profile: profileWith({ skills: [{ name: 'Node.js', level: 'expert' }] }),
    });

    // The whole premise of the product: saying so is not showing so.
    assert.equal(twin.skills[0].strength, EVIDENCE_STRENGTH.CLAIMED);
    assert.equal(twin.skills[0].selfDeclaredLevel, 'expert');
  });

  it('raises a skill to supported when a project uses it', () => {
    const twin = buildCareerTwin({
      profile: profileWith({
        skills: [{ name: 'React', level: 'beginner' }],
        projects: [{ title: 'Nexora', technologies: ['React'] }],
      }),
    });

    const react = twin.skills.find((skill) => skill.name === 'React');
    assert.equal(react.strength, EVIDENCE_STRENGTH.SUPPORTED);
    assert.equal(react.evidence.length, 2);

    // Strongest first. Everything downstream that quotes a single reason
    // takes the first one, so the project — not the profile listing — is
    // what a student reads next to a "supported" status.
    assert.match(react.evidence[0].detail, /Used in your project "Nexora"/);
    assert.equal(react.evidence[0].strength, EVIDENCE_STRENGTH.SUPPORTED);
    assert.match(react.evidence[1].detail, /listed this on your profile/);
  });

  it('merges spellings of one skill instead of listing it twice', () => {
    const twin = buildCareerTwin({
      profile: profileWith({ skills: [{ name: 'Node.js', level: 'advanced' }] }),
      resumes: [analysedResume({ skills: [{ name: 'NodeJS' }] })],
    });

    // Two entries would show the student a gap for something already listed.
    assert.equal(twin.skills.length, 1);
    assert.equal(twin.skills[0].name, 'Node.js');
    assert.equal(twin.skills[0].sourceCount, 2);
  });

  it('counts repeated mentions from one kind of source only once', () => {
    const twin = buildCareerTwin({
      profile: null,
      resumes: [
        analysedResume({ skills: [{ name: 'Go' }] }, { id: 'r1' }),
        analysedResume({ skills: [{ name: 'Go' }] }, { id: 'r2' }),
      ],
    });

    assert.equal(twin.skills[0].evidence.length, 2);
    assert.equal(twin.skills[0].sourceCount, 1, 'two resumes counted as two kinds of evidence');
  });

  it('attaches certification evidence only to a skill the certification names', () => {
    const twin = buildCareerTwin({
      profile: profileWith({
        skills: [
          { name: 'AWS', level: 'beginner' },
          { name: 'React', level: 'beginner' },
        ],
        certifications: [{ name: 'AWS Certified Cloud Practitioner' }],
      }),
    });

    const aws = twin.skills.find((skill) => skill.name === 'AWS');
    const react = twin.skills.find((skill) => skill.name === 'React');

    assert.equal(aws.strength, EVIDENCE_STRENGTH.SUPPORTED);
    assert.equal(react.strength, EVIDENCE_STRENGTH.CLAIMED, 'certification leaked to React');
  });

  it('does not turn a certification title into skills', () => {
    const twin = buildCareerTwin({
      profile: profileWith({
        certifications: [{ name: 'AWS Certified Cloud Practitioner' }],
      }),
    });

    // Splitting the title would invent "Certified" and "Practitioner".
    assert.deepEqual(twin.skills, []);
    assert.equal(twin.indicators.certificationCount, 1);
  });

  it('takes skills from an analysed resume', () => {
    const twin = buildCareerTwin({
      profile: null,
      resumes: [analysedResume({ skills: [{ name: 'MongoDB' }] }, { label: 'Internship CV' })],
    });

    assert.equal(twin.skills[0].name, 'MongoDB');
    assert.equal(twin.skills[0].strength, EVIDENCE_STRENGTH.CLAIMED);
    assert.match(twin.skills[0].evidence[0].detail, /Listed in Internship CV/);
  });

  it('ignores a resume that has not been analysed', () => {
    const twin = buildCareerTwin({
      profile: profileWith(),
      resumes: [{ id: 'r1', label: 'Raw', parsed: null }],
    });

    // An unanalysed resume is a wall of text; guessing at it would invent.
    assert.deepEqual(twin.skills, []);
    assert.equal(twin.indicators.analysedResumeCount, 0);
    assert.equal(twin.sources.resumeCount, 1);
  });

  it('orders skills by strength, then by corroboration', () => {
    const twin = buildCareerTwin({
      profile: profileWith({
        skills: [
          { name: 'Python', level: 'beginner' },
          { name: 'React', level: 'beginner' },
        ],
        projects: [{ title: 'Nexora', technologies: ['React'] }],
      }),
    });

    assert.equal(twin.skills[0].name, 'React', 'supported skill was not listed first');
  });

  it('gives every skill at least one reason a student can read', () => {
    const twin = buildCareerTwin({
      profile: profileWith({
        skills: [{ name: 'Node.js', level: 'advanced' }],
        projects: [{ title: 'Nexora', technologies: ['React', 'Express'] }],
      }),
      resumes: [analysedResume({ skills: [{ name: 'MongoDB' }] })],
    });

    for (const skill of twin.skills) {
      assert.ok(skill.evidence.length > 0, `${skill.name} has no evidence`);
      for (const item of skill.evidence) {
        assert.ok(item.detail?.length > 0, `${skill.name} has evidence with no reason`);
      }
    }
  });

  it('reports counts and never a readiness score', () => {
    const twin = buildCareerTwin({
      profile: profileWith({
        skills: [{ name: 'Node.js', level: 'advanced' }],
        projects: [{ title: 'Nexora', technologies: ['React'] }],
      }),
    });

    assert.equal(twin.indicators.totalSkills, 2);
    assert.equal(twin.indicators.claimedOnly, 1);
    assert.equal(twin.indicators.supported, 1);
    assert.equal(twin.indicators.verified, 0);
    assert.equal(twin.indicators.hasTargetRole, true);

    // Readiness is readiness *for* something. There is no target to measure
    // against until career matching exists, so no such number is produced.
    const numeric = Object.keys(twin.indicators).filter((key) => /score|readiness|rating/i.test(key));
    assert.deepEqual(numeric, [], `unexplained score fields: ${numeric.join(', ')}`);
  });

  it('marks the student\'s own target role as theirs', () => {
    const twin = buildCareerTwin({ profile: profileWith() });

    // A Nexora suggestion must never come back as the student's stated goal.
    assert.deepEqual(twin.targetRoles, [{ title: 'Backend Developer', origin: 'student' }]);
  });

  it('copies interests without inferring any', () => {
    const twin = buildCareerTwin({
      profile: profileWith({
        career: { targetRole: null, careerInterests: ['Distributed systems', 'distributed systems'] },
      }),
    });

    assert.deepEqual(twin.interests, ['Distributed systems']);
  });

  it('handles a student with nothing recorded', () => {
    const twin = buildCareerTwin({ profile: null, resumes: [] });

    assert.deepEqual(twin.skills, []);
    assert.deepEqual(twin.interests, []);
    assert.equal(twin.academic, null);
    assert.equal(twin.indicators.totalSkills, 0);
  });

  it('is deterministic', () => {
    const inputs = {
      profile: profileWith({
        skills: [
          { name: 'Node.js', level: 'advanced' },
          { name: 'React', level: 'beginner' },
        ],
        projects: [{ title: 'Nexora', technologies: ['React', 'Express'] }],
      }),
      resumes: [analysedResume({ skills: [{ name: 'MongoDB' }] })],
    };

    // A student is entitled to ask why their twin says what it says, which
    // is only answerable if the answer does not change between runs.
    assert.deepEqual(buildCareerTwin(inputs), buildCareerTwin(inputs));
  });

  it('records what it was built from', () => {
    const twin = buildCareerTwin({
      profile: profileWith({ skills: [{ name: 'Go', level: 'beginner' }] }),
      resumes: [analysedResume({ skills: [{ name: 'Go' }] }, { id: 'resume-9' })],
    });

    assert.equal(twin.sources.hasProfile, true);
    assert.deepEqual(twin.sources.analysedResumeIds, ['resume-9']);
  });
});

// ----------------------------------------------------------------- narrative

describe('CareerTwin narrative validation', () => {
  it('accepts a well-formed summary', () => {
    const { value, error } = validateNarrative({ summary: 'You have shown backend work.' });

    assert.equal(error, null);
    assert.equal(value, 'You have shown backend work.');
  });

  it('rejects a response that is not an object or has no summary', () => {
    assert.ok(validateNarrative('just text').error);
    assert.ok(validateNarrative({}).error);
    assert.ok(validateNarrative({ summary: 42 }).error);
  });
});

describe('groundNarrative', () => {
  const twin = buildCareerTwin({
    profile: profileWith({ skills: [{ name: 'Node.js', level: 'advanced' }] }),
  });

  const vocabulary = ['Node.js', 'Docker', 'Kubernetes', 'React'];

  it('accepts a summary that stays within the student\'s skills', () => {
    const result = groundNarrative('You have claimed Node.js experience.', twin, vocabulary);

    assert.ok(result.ok);
    assert.deepEqual(result.warnings, []);
  });

  it('rejects a summary that credits a skill the student does not have', () => {
    // The characteristic failure: a model reaching for the sentence such
    // summaries usually contain.
    const result = groundNarrative(
      'You have a strong foundation in Node.js and Docker.',
      twin,
      vocabulary,
    );

    assert.ok(!result.ok);
    assert.match(result.warnings[0], /Docker/);
  });

  it('matches across a difference in punctuation', () => {
    const result = groundNarrative('You work with NodeJS.', twin, vocabulary);

    assert.ok(result.ok, 'a spelling variant of the student\'s own skill was rejected');
  });
});
