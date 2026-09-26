/**
 * Client-side interview contract options, constants, and presentation tokens.
 *
 * Mirrors server/src/domain/interview/interviewContract.js and provides UI-ready
 * presentation mappings adhering to the Sunset Warm theme.
 */

export const INTERVIEW_DIFFICULTY = Object.freeze({
  BEGINNER: 'beginner',
  INTERMEDIATE: 'intermediate',
  ADVANCED: 'advanced',
});

export const INTERVIEW_DIFFICULTY_ORDER = Object.freeze([
  INTERVIEW_DIFFICULTY.BEGINNER,
  INTERVIEW_DIFFICULTY.INTERMEDIATE,
  INTERVIEW_DIFFICULTY.ADVANCED,
]);

export const INTERVIEW_DIFFICULTY_PRESENTATION = Object.freeze({
  [INTERVIEW_DIFFICULTY.BEGINNER]: {
    label: 'Beginner',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-800',
    description: 'Foundational concepts, definitions, and standard conventions.',
  },
  [INTERVIEW_DIFFICULTY.INTERMEDIATE]: {
    label: 'Intermediate',
    badgeClass: 'border-orange-200 bg-orange-50 text-brand-text',
    description: 'Practical engineering scenarios, trade-offs, and design patterns.',
  },
  [INTERVIEW_DIFFICULTY.ADVANCED]: {
    label: 'Advanced',
    badgeClass: 'border-red-200 bg-red-50 text-red-800',
    description: 'System internals, distributed architecture, failure modes, and performance.',
  },
});

export const SESSION_STATUS = Object.freeze({
  INITIALIZED: 'initialized',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  TIMED_OUT: 'timed_out',
  ABANDONED: 'abandoned',
  FAILED: 'failed',
});

export const SESSION_STATUS_PRESENTATION = Object.freeze({
  [SESSION_STATUS.INITIALIZED]: {
    label: 'Ready to Start',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  [SESSION_STATUS.IN_PROGRESS]: {
    label: 'In Progress',
    badgeClass: 'border-sky-200 bg-sky-50 text-sky-800',
  },
  [SESSION_STATUS.COMPLETED]: {
    label: 'Completed',
    badgeClass: 'border-green-200 bg-green-50 text-green-800',
  },
  [SESSION_STATUS.TIMED_OUT]: {
    label: 'Timed Out',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  [SESSION_STATUS.ABANDONED]: {
    label: 'Abandoned',
    badgeClass: 'border-slate-200 bg-slate-50 text-slate-700',
  },
  [SESSION_STATUS.FAILED]: {
    label: 'Failed',
    badgeClass: 'border-red-200 bg-red-50 text-red-800',
  },
});

export const INTERVIEW_ROLES = Object.freeze([
  {
    id: 'backend-developer',
    title: 'Backend Developer',
    skills: ['JavaScript', 'Node.js', 'REST APIs', 'SQL', 'MongoDB'],
  },
  {
    id: 'frontend-developer',
    title: 'Frontend Developer',
    skills: ['JavaScript', 'React', 'HTML', 'CSS', 'TypeScript'],
  },
  {
    id: 'fullstack-developer',
    title: 'Fullstack Developer',
    skills: ['JavaScript', 'React', 'Node.js', 'REST APIs', 'SQL'],
  },
  {
    id: 'data-analyst',
    title: 'Data Analyst',
    skills: ['SQL', 'Python', 'Excel', 'Data Analysis'],
  },
  {
    id: 'devops-engineer',
    title: 'DevOps Engineer',
    skills: ['Linux', 'Docker', 'Git', 'CI/CD'],
  },
]);
