/**
 * Status presentation mappings for readiness evidence states.
 */
export const READINESS_STATUS_PRESENTATION = {
  insufficient_data: {
    label: 'Insufficient Data',
    badgeClass: 'border-slate-200 bg-slate-50 text-slate-700',
    description: 'There is not enough evidence to evaluate this role yet.',
  },
  partial: {
    label: 'Partial Evidence',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-800',
    description: 'Some required skills are missing or only claimed.',
  },
  supported: {
    label: 'Supported Evidence',
    badgeClass: 'border-sky-200 bg-sky-50 text-sky-800',
    description: 'Every required skill has supporting project evidence; verification pending.',
  },
  verified: {
    label: 'Fully Verified',
    badgeClass: 'border-green-200 bg-green-50 text-green-800',
    description: 'Every required skill has verified assessment evidence.',
  },
};

/**
 * Explainability definitions for evidence contributors.
 * Nexora rejects arbitrary readiness percentages. Instead, readiness represents
 * the exact composition of verifiable evidence for each skill asked by a role.
 */
export const CONTRIBUTOR_DEFINITIONS = [
  {
    key: 'verified',
    label: 'Verified Evidence',
    colorBg: 'bg-green-600',
    textClass: 'text-green-800',
    borderClass: 'border-green-200',
    bgClass: 'bg-green-50',
    meaning: 'Confirmed through technical assessments or verified review credentials.',
  },
  {
    key: 'supported',
    label: 'Supported Evidence',
    colorBg: 'bg-sky-500',
    textClass: 'text-sky-800',
    borderClass: 'border-sky-200',
    bgClass: 'bg-sky-50',
    meaning: 'Backed by real project code, repositories, or verified certifications on file.',
  },
  {
    key: 'claimed',
    label: 'Claimed Skills',
    colorBg: 'bg-amber-400',
    textClass: 'text-amber-800',
    borderClass: 'border-amber-200',
    bgClass: 'bg-amber-50',
    meaning: 'Self-reported in resume or profile, awaiting project or assessment proof.',
  },
  {
    key: 'missing',
    label: 'Missing Skills',
    colorBg: 'bg-rose-400',
    textClass: 'text-rose-800',
    borderClass: 'border-rose-200',
    bgClass: 'bg-rose-50',
    meaning: 'Required for this role, but not yet present in your profile or experience.',
  },
];
