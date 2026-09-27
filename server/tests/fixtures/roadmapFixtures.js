import { skillKey } from '../../src/domain/skills/skillKey.js';

export function roadmapTwin(skills = []) {
  return {
    skills: skills.map(({ name, strength = 'claimed' }) => ({
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
    })),
    targetRoles: [],
  };
}

export const ROADMAP_FIXTURES = {
  empty: roadmapTwin(),

  foundationGaps: roadmapTwin([
    { name: 'JavaScript', strength: 'claimed' },
    { name: 'Node.js', strength: 'claimed' },
  ]),

  supportedEvidence: roadmapTwin([
    { name: 'JavaScript', strength: 'supported' },
    { name: 'Node.js', strength: 'supported' },
  ]),

  allGapsClosed: roadmapTwin([
    { name: 'JavaScript', strength: 'supported' },
    { name: 'Node.js', strength: 'verified' },
    { name: 'SQL', strength: 'supported' },
    { name: 'REST APIs', strength: 'verified' },
    { name: 'Express.js', strength: 'supported' },
    { name: 'MongoDB', strength: 'supported' },
    { name: 'PostgreSQL', strength: 'verified' },
    { name: 'Docker', strength: 'supported' },
    { name: 'Redis', strength: 'supported' },
    { name: 'Git', strength: 'supported' },
  ]),

  transitiveChain: roadmapTwin([]),

  mixedPriorityWithPrerequisite: roadmapTwin([
    // Node.js is claimed (High priority), Express.js missing (Medium)
    { name: 'Node.js', strength: 'claimed' },
  ]),

  singleGap: roadmapTwin([
    { name: 'Node.js', strength: 'supported' },
    { name: 'SQL', strength: 'supported' },
    { name: 'REST APIs', strength: 'supported' },
    { name: 'Express.js', strength: 'supported' },
    { name: 'MongoDB', strength: 'supported' },
    { name: 'PostgreSQL', strength: 'supported' },
    { name: 'Docker', strength: 'supported' },
    { name: 'Redis', strength: 'supported' },
    { name: 'Git', strength: 'supported' },
    // Only JavaScript is missing (or claimed)
    { name: 'JavaScript', strength: 'claimed' },
  ]),
};