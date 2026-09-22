import { skillKey } from '../../src/domain/skills/skillKey.js';

function skill(name, strength) {
  return {
    key: skillKey(name),
    name,
    strength,
    sourceCount: 1,
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

export const SKILL_GAP_FIXTURES = {
  statusLevels: {
    skills: [
      skill('JavaScript', 'claimed'),
      skill('Node.js', 'supported'),
      skill('REST APIs', 'verified'),
    ],
  },

  normalizationEdges: {
    skills: [
      skill('NODE JS', 'claimed'),
      skill('restful-apis', 'supported'),
      skill('SQL', 'claimed'),
    ],
  },
};