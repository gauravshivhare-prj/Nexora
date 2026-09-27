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

  emptyProfile: {
    skills: [],
  },

  allClaimed: {
    skills: [
      skill('JavaScript', 'claimed'),
      skill('Node.js', 'claimed'),
      skill('SQL', 'claimed'),
      skill('REST APIs', 'claimed'),
    ],
  },

  allSupported: {
    skills: [
      skill('JavaScript', 'supported'),
      skill('Node.js', 'supported'),
      skill('SQL', 'supported'),
      skill('REST APIs', 'supported'),
    ],
  },

  allVerified: {
    skills: [
      skill('JavaScript', 'verified'),
      skill('Node.js', 'verified'),
      skill('SQL', 'verified'),
      skill('REST APIs', 'verified'),
    ],
  },

  mixedRequirements: {
    skills: [
      skill('JavaScript', 'verified'),
      skill('Node.js', 'supported'),
      skill('SQL', 'claimed'),
      // REST APIs missing
      skill('Docker', 'supported'),
      skill('MongoDB', 'claimed'),
      // Git missing
    ],
  },

  duplicateSkills: {
    skills: [
      skill('Node.js', 'claimed'),
      skill('NodeJS', 'verified'),
      skill('SQL', 'supported'),
      skill('SQL', 'claimed'),
      skill('JavaScript', 'claimed'),
      skill('JavaScript', 'supported'),
    ],
  },

  aliasVariations: {
    skills: [
      skill('js', 'claimed'),
      skill('ecmascript', 'supported'),
      skill('py', 'claimed'),
      skill('postgres', 'verified'),
      skill('mongo', 'supported'),
      skill('k8s', 'claimed'),
      skill('dsa', 'verified'),
      skill('cicd', 'supported'),
    ],
  },

  priorityCoverage: {
    skills: [
      // Required: JavaScript (verified), Node.js (supported), SQL (claimed), REST APIs (missing)
      skill('JavaScript', 'verified'),
      skill('Node.js', 'supported'),
      skill('SQL', 'claimed'),
      // Preferred: Docker (supported), Redis (claimed), Git (missing)
      skill('Docker', 'supported'),
      skill('Redis', 'claimed'),
    ],
  },

  malformedAndMissingEvidence: {
    skills: [
      {
        name: 'Node.js',
        strength: 'claimed',
        sourceCount: 0,
        evidence: [],
      },
      {
        key: 'sql',
        name: 'SQL',
        strength: 'supported',
        sourceCount: 1,
        evidence: [
          null,
          { source: 'project', strength: 'supported', detail: null, reference: null },
        ],
      },
      {
        name: 'JavaScript',
        strength: 'verified',
        evidence: null,
      },
      null,
      'invalid-primitive-skill',
    ],
  },

  extraSkillsOnly: {
    skills: [
      skill('Figma', 'supported'),
      skill('UI Design', 'claimed'),
      skill('Flutter', 'verified'),
    ],
  },
};