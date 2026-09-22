import { skillKey } from '../../src/domain/skills/skillKey.js';

function skill(name, strength = 'claimed') {
  return {
    key: skillKey(name),
    name,
    strength,
    sourceCount: strength === 'claimed' ? 1 : 2,
    evidence: [
      {
        source: strength === 'claimed' ? 'self_declared' : 'project',
        strength,
        detail: `${strength} evidence for ${name}`,
        reference: null,
      },
    ],
  };
}

function twin(skills = [], extras = {}) {
  return {
    skills: skills.map((item) => (typeof item === 'string' ? skill(item) : skill(item.name, item.strength))),
    interests: [],
    targetRoles: [],
    academic: null,
    ...extras,
  };
}

export const RECOMMENDATION_FIXTURES = {
  emptyProfile: twin(),

  strongBackendFit: twin(
    [
      { name: 'JavaScript', strength: 'supported' },
      { name: 'Node.js', strength: 'supported' },
      { name: 'REST APIs', strength: 'supported' },
      { name: 'SQL', strength: 'supported' },
      { name: 'Express.js', strength: 'supported' },
      { name: 'MongoDB', strength: 'supported' },
    ],
    {
      targetRoles: [{ title: 'Backend Developer', origin: 'student' }],
      academic: { branch: 'Computer Science and Engineering' },
    },
  ),

  conflictingInterestAndSkills: twin(
    [
      { name: 'JavaScript', strength: 'supported' },
      { name: 'Node.js', strength: 'supported' },
      { name: 'REST APIs', strength: 'supported' },
      { name: 'SQL', strength: 'supported' },
    ],
    {
      targetRoles: [{ title: 'Frontend Developer', origin: 'student' }],
      interests: ['UI Design'],
    },
  ),

  claimedBackendSkills: twin(['JavaScript', 'Node.js', 'REST APIs', 'SQL']),
  supportedBackendSkills: twin([
    { name: 'JavaScript', strength: 'supported' },
    { name: 'Node.js', strength: 'supported' },
    { name: 'REST APIs', strength: 'supported' },
    { name: 'SQL', strength: 'supported' },
  ]),
};