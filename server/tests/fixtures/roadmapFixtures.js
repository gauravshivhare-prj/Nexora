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
};