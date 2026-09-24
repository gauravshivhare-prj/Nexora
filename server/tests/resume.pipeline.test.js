import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PARSED_LIMITS } from '../src/constants/resumePolicy.js';
import { groundParsedResume } from '../src/domain/resume/groundParsedResume.js';
import { validateParsedResume } from '../src/domain/resume/parsedResumeSchema.js';
import { parseJsonObject } from '../src/services/ai/aiJson.js';

/**
 * The AI safety pipeline, tested without a database or a model.
 *
 * These are the three stages that stand between a provider's output and
 * Nexora's stored data. They are pure functions, so they can be tested
 * against exactly the malformed and invented output a real model produces —
 * which is far harder to arrange through the API.
 */

// ------------------------------------------------------------- JSON parsing

describe('parseJsonObject', () => {
  it('reads a plain JSON object', () => {
    const { value, error } = parseJsonObject('{"skills":[{"name":"Node.js"}]}');

    assert.equal(error, undefined);
    assert.deepEqual(value.skills, [{ name: 'Node.js' }]);
  });

  it('reads a fenced block, which models add unprompted', () => {
    const { value } = parseJsonObject('```json\n{"basics":{"fullName":"Gaurav"}}\n```');

    assert.equal(value.basics.fullName, 'Gaurav');
  });

  it('reads an object wrapped in prose', () => {
    const { value } = parseJsonObject('Sure! Here is the data:\n{"achievements":["Won"]}\nHope that helps.');

    assert.deepEqual(value.achievements, ['Won']);
  });

  it('prefers the fenced block when the model explains itself as well', () => {
    const { value } = parseJsonObject(
      'I considered {this} carefully.\n```json\n{"skills":[{"name":"Go"}]}\n```',
    );

    assert.deepEqual(value.skills, [{ name: 'Go' }]);
  });

  it('refuses an empty response', () => {
    assert.match(parseJsonObject('').error, /empty/);
    assert.match(parseJsonObject('   ').error, /empty/);
  });

  it('refuses a response with no object in it', () => {
    assert.match(parseJsonObject('I cannot help with that.').error, /did not contain/);
  });

  it('refuses malformed JSON', () => {
    assert.match(parseJsonObject('{"skills": [,]}').error, /not valid JSON/);
  });

  it('refuses a bare array, which is valid JSON but the wrong shape', () => {
    // The span from the first "{" to the last "}" is an object here, so this
    // also checks the extraction does not accidentally accept the array.
    assert.ok(parseJsonObject('[1, 2, 3]').error);
  });

  it('refuses an oversized response rather than parsing it', () => {
    const huge = `{"a":"${'x'.repeat(200_001)}"}`;

    assert.match(parseJsonObject(huge).error, /too large/);
  });

  it('never echoes the response back in the error', () => {
    // The response contains a resume. An error message is logged and stored,
    // so nothing personal may appear in it.
    const { error } = parseJsonObject('Gaurav Shivhare, gaurav@example.com, +91 98765 43210');

    assert.ok(!error.includes('gaurav@example.com'));
    assert.ok(!error.includes('Gaurav'));
  });
});

// --------------------------------------------------------- schema validation

describe('validateParsedResume', () => {
  it('accepts a well-formed response', () => {
    const { value, errors } = validateParsedResume({
      basics: { fullName: 'Gaurav Shivhare', email: 'gaurav@example.com', links: ['https://x.dev'] },
      education: [{ institution: 'MANIT', degree: 'B.Tech', endYear: 2027, grade: '8.4 CGPA' }],
      skills: [{ name: 'Node.js' }, { name: 'MongoDB' }],
      projects: [{ title: 'Nexora', technologies: ['React'] }],
      experience: [{ organisation: 'Acme', title: 'Intern', startDate: 'Jan 2025' }],
      certifications: [{ name: 'AWS CCP', issuer: 'AWS', issueYear: 2025 }],
      achievements: ['Winner, Smart India Hackathon'],
    });

    assert.deepEqual(errors, []);
    assert.equal(value.basics.fullName, 'Gaurav Shivhare');
    assert.equal(value.education[0].endYear, 2027);
    assert.deepEqual(value.skills, [{ name: 'Node.js' }, { name: 'MongoDB' }]);
    assert.equal(value.experience[0].startDate, 'Jan 2025');
  });

  it('accepts skills as bare strings as well as objects', () => {
    const { value } = validateParsedResume({ skills: ['Node.js', { name: 'Redis' }] });

    assert.deepEqual(value.skills, [{ name: 'Node.js' }, { name: 'Redis' }]);
  });

  it('fills every section when the response is an empty object', () => {
    const { value, errors } = validateParsedResume({});

    assert.deepEqual(errors, []);
    assert.deepEqual(value.skills, []);
    assert.deepEqual(value.education, []);
    assert.equal(value.basics.fullName, null);
  });

  it('rejects a response that is not an object at all', () => {
    assert.ok(validateParsedResume('nope').errors.length > 0);
    assert.ok(validateParsedResume([]).errors.length > 0);
    assert.ok(validateParsedResume(null).errors.length > 0);
  });

  it('fails when a section has the wrong top-level type', () => {
    const { value, errors } = validateParsedResume({ skills: 'Node.js, React' });

    assert.equal(value, null, 'invalid output must not produce storable data');
    assert.match(errors[0], /`skills` was not a list/);
  });

  it('fails when basics is not an object', () => {
    const { value, errors } = validateParsedResume({ basics: ['Gaurav'] });

    assert.equal(value, null);
    assert.match(errors[0], /`basics` was not an object/);
  });

  it('drops a single malformed entry rather than failing the whole response', () => {
    const { value, errors, warnings } = validateParsedResume({
      skills: [{ name: 'Node.js' }, { name: 42 }, { name: 'Redis' }],
    });

    assert.deepEqual(errors, []);
    assert.deepEqual(value.skills, [{ name: 'Node.js' }, { name: 'Redis' }]);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /skills\[1\]/);
  });

  it('drops a list entry that is not an object', () => {
    const { value, warnings } = validateParsedResume({ education: ['MANIT'] });

    assert.deepEqual(value.education, []);
    assert.match(warnings[0], /education\[0\]/);
  });

  it('drops an entry in which nothing could be read', () => {
    const { value, warnings } = validateParsedResume({ projects: [{ unknownKey: 'x' }] });

    assert.deepEqual(value.projects, []);
    assert.match(warnings[0], /no usable fields/);
  });

  it('ignores a key the model invented instead of storing it', () => {
    const { value } = validateParsedResume({
      skills: [{ name: 'Node.js', proficiency: 'expert', yearsOfExperience: 5 }],
    });

    // A model must not assign proficiency, and an allow-listed output means
    // it cannot smuggle one in.
    assert.deepEqual(value.skills, [{ name: 'Node.js' }]);
  });

  it('de-duplicates skills case-insensitively', () => {
    const { value } = validateParsedResume({
      skills: [{ name: 'Node.js' }, { name: 'node.js' }, { name: 'NODE.JS' }],
    });

    assert.equal(value.skills.length, 1);
  });

  it('caps a runaway list and says so', () => {
    const tooMany = Array.from({ length: PARSED_LIMITS.skills.maxItems + 10 }, (_, i) => ({
      name: `Skill${i}`,
    }));

    const { value, warnings } = validateParsedResume({ skills: tooMany });

    assert.equal(value.skills.length, PARSED_LIMITS.skills.maxItems);
    assert.ok(warnings.some((warning) => /kept the first/.test(warning)));
  });

  it('drops a year outside the plausible range', () => {
    const { value, warnings } = validateParsedResume({
      education: [{ institution: 'MANIT', endYear: 12027 }],
    });

    assert.equal(value.education[0].endYear, null);
    assert.equal(value.education[0].institution, 'MANIT');
    assert.ok(warnings.some((warning) => /endYear/.test(warning)));
  });

  it('accepts a year given as a numeric string', () => {
    const { value } = validateParsedResume({ education: [{ endYear: '2027' }] });

    assert.equal(value.education[0].endYear, 2027);
  });
});

// ----------------------------------------------------------------- grounding

describe('groundParsedResume', () => {
  const RESUME = `Gaurav Shivhare
gaurav@example.com | +91 98765 43210 | Bhopal
https://github.com/example

EDUCATION
Maulana Azad National Institute of Technology, B.Tech CSE, 2027, 8.4 CGPA

SKILLS
Node.js, Express, MongoDB, React, C++, Go

PROJECTS
Nexora — a career readiness platform built with React and Express.

CERTIFICATIONS
AWS Certified Cloud Practitioner`;

  /** Runs a parsed shape through schema validation first, as the service does. */
  function ground(partial) {
    const { value } = validateParsedResume(partial);
    return groundParsedResume(value, RESUME);
  }

  it('keeps a skill that is in the resume', () => {
    const { value, warnings } = ground({ skills: [{ name: 'Node.js' }, { name: 'MongoDB' }] });

    assert.deepEqual(value.skills, [{ name: 'Node.js' }, { name: 'MongoDB' }]);
    assert.deepEqual(warnings, []);
  });

  it('drops a skill the model invented', () => {
    // The single most important case in the codebase. A backend resume that
    // does not mention Docker must not produce Docker as a skill.
    const { value, warnings } = ground({
      skills: [{ name: 'Node.js' }, { name: 'Docker' }, { name: 'Kubernetes' }],
    });

    assert.deepEqual(value.skills, [{ name: 'Node.js' }]);
    assert.equal(warnings.length, 2);
    assert.match(warnings[0], /Docker/);
    assert.match(warnings[0], /does not appear in the resume/);
  });

  it('matches across a difference in punctuation', () => {
    // The resume says "Node.js"; the model wrote "NodeJS". Same skill.
    const { value, warnings } = ground({ skills: [{ name: 'NodeJS' }] });

    assert.deepEqual(value.skills, [{ name: 'Node.js' }]);
    assert.deepEqual(warnings, []);
  });

  it('keeps a short skill that appears as its own word', () => {
    const { value } = ground({ skills: [{ name: 'Go' }, { name: 'C++' }] });

    assert.deepEqual(value.skills, [{ name: 'Go' }, { name: 'C++' }]);
  });

  it('drops a short skill that only appears inside another word', () => {
    // "R" is a real language, and it is not in this resume — but the letter
    // appears in almost every line. A substring test would confirm anything.
    const { value, warnings } = ground({ skills: [{ name: 'R' }] });

    assert.deepEqual(value.skills, []);
    assert.equal(warnings.length, 1);
  });

  it('keeps contact details that are in the resume', () => {
    const { value } = ground({
      basics: { fullName: 'Gaurav Shivhare', email: 'gaurav@example.com', phone: '+91 98765 43210' },
    });

    assert.equal(value.basics.email, 'gaurav@example.com');
    assert.equal(value.basics.fullName, 'Gaurav Shivhare');
  });

  it('drops an email the model invented', () => {
    const { value, warnings } = ground({ basics: { email: 'someone.else@example.com' } });

    assert.equal(value.basics.email, null);
    assert.match(warnings[0], /basics.email/);
  });

  it('matches a phone number written with different spacing', () => {
    const { value } = ground({ basics: { phone: '+919876543210' } });

    assert.equal(value.basics.phone, '+919876543210');
  });

  it('drops a phone number that is not in the resume', () => {
    const { value, warnings } = ground({ basics: { phone: '+91 00000 00000' } });

    assert.equal(value.basics.phone, null);
    assert.equal(warnings.length, 1);
  });

  it('drops invented project technologies but keeps the real ones', () => {
    const { value, warnings } = ground({
      projects: [{ title: 'Nexora', technologies: ['React', 'Express', 'Kafka'] }],
    });

    assert.deepEqual(value.projects[0].technologies, ['React', 'Express.js']);
    assert.equal(value.projects[0].title, 'Nexora');
    assert.match(warnings[0], /Kafka/);
  });

  it('drops an invented certification', () => {
    const { value, warnings } = ground({
      certifications: [
        { name: 'AWS Certified Cloud Practitioner' },
        { name: 'Certified Kubernetes Administrator' },
      ],
    });

    assert.equal(value.certifications[0].name, 'AWS Certified Cloud Practitioner');
    assert.equal(value.certifications[1].name, null, 'the invented certification was kept');
    assert.equal(warnings.length, 1);
  });

  it('drops an invented institution', () => {
    const { value, warnings } = ground({ education: [{ institution: 'IIT Bombay', endYear: 2027 }] });

    assert.equal(value.education[0].institution, null);
    assert.equal(value.education[0].endYear, 2027, 'a plain year is not grounded');
    assert.equal(warnings.length, 1);
  });

  it('leaves a summarised description alone', () => {
    // A model rewording project bullets is doing its job. Requiring a verbatim
    // match would delete every description.
    const summary = 'Designed and shipped an end-to-end career guidance system.';
    const { value, warnings } = ground({ projects: [{ title: 'Nexora', description: summary }] });

    assert.equal(value.projects[0].description, summary);
    assert.deepEqual(warnings, []);
  });

  it('names the dropped value so the student can see what was removed', () => {
    const { warnings } = ground({ skills: [{ name: 'Terraform' }] });

    assert.match(warnings[0], /Terraform/);
  });

  it('does not confirm a skill that only appears inside a longer word', () => {
    const { value: parsed } = validateParsedResume({
      skills: [{ name: 'Java' }, { name: 'SQL' }, { name: 'React' }, { name: 'Node.js' }, { name: 'JavaScript' }],
    });
    const { value, warnings } = groundParsedResume(
      parsed,
      'Built dashboards in JavaScript on PostgreSQL. Stack: React/Redux, NodeJS.',
    );

    assert.deepEqual(
      value.skills.map((skill) => skill.name),
      ['React', 'Node.js', 'JavaScript'],
    );
    assert.ok(warnings.some((warning) => warning.includes('"Java"')));
    assert.ok(warnings.some((warning) => warning.includes('"SQL"')));
  });

  it('drops everything when the resume text is empty', () => {
    const { value } = validateParsedResume({ skills: [{ name: 'Node.js' }] });
    const grounded = groundParsedResume(value, '');

    assert.deepEqual(grounded.value.skills, []);
  });
});
