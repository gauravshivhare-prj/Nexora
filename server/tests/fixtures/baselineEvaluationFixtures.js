import { skillKey } from '../../src/domain/skills/skillKey.js';

function twin(skillNames, targetRole) {
  return {
    skills: skillNames.map((name) => ({
      key: skillKey(name),
      name,
      strength: 'supported',
      sourceCount: 1,
      evidence: [
        {
          source: 'project',
          strength: 'supported',
          detail: `Project evidence for ${name}`,
          reference: null,
        },
      ],
    })),
    interests: [],
    targetRoles: [{ title: targetRole, origin: 'student' }],
    academic: null,
  };
}

/** Reproducible labels for evaluating the current explainable baseline. */
export const BASELINE_EVALUATION_FIXTURES = [
  {
    id: 'backend-fit',
    expectedRoleId: 'backend-developer',
    twin: twin(['JavaScript', 'Node.js', 'REST APIs', 'SQL', 'Express.js'], 'Backend Developer'),
  },
  {
    id: 'frontend-fit',
    expectedRoleId: 'frontend-developer',
    twin: twin(['HTML', 'CSS', 'JavaScript', 'React', 'TypeScript'], 'Frontend Developer'),
  },
  {
    id: 'data-fit',
    expectedRoleId: 'data-analyst',
    twin: twin(['SQL', 'Excel', 'Data Visualisation', 'Python', 'Statistics'], 'Data Analyst'),
  },
];