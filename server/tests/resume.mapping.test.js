import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { groundParsedResume } from '../src/domain/resume/groundParsedResume.js';

const parsed = {
  basics: { fullName: null, email: null, phone: null, location: null, links: [] },
  education: [],
  skills: [
    { name: 'NODE JS' },
    { name: 'docker-compose' },
    { name: 'Invented Framework' },
  ],
  projects: [
    {
      title: 'Shipyard',
      description: null,
      technologies: ['Docker', 'GitHub', 'Imaginary Cloud'],
    },
  ],
  experience: [],
  certifications: [],
  achievements: [],
};

describe('resume-to-skill taxonomy mapping', () => {
  it('keeps grounded aliases canonical and excludes unknown skills', () => {
    const { value, warnings } = groundParsedResume(
      parsed,
      'Shipyard uses Node.js, docker compose and Docker with GitHub. Invented Framework and Imaginary Cloud are mentioned.',
    );

    assert.deepEqual(value.skills.map(({ name }) => name), ['Node.js', 'Docker Compose']);
    assert.deepEqual(value.projects[0].technologies, ['Docker', 'GitHub']);
    assert.equal(warnings.filter((warning) => warning.includes('canonical skill taxonomy')).length, 2);
  });

  it('does not treat a text mention as evidence when it is not grounded', () => {
    const { value, warnings } = groundParsedResume(
      parsed,
      'Shipyard uses Node.js and Docker.',
    );

    assert.deepEqual(value.skills.map(({ name }) => name), ['Node.js']);
    assert.deepEqual(value.projects[0].technologies, ['Docker']);
    assert.ok(warnings.some((warning) => warning.includes('docker-compose')));
    assert.ok(warnings.some((warning) => warning.includes('GitHub')));
  });
});
