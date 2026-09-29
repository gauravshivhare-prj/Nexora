/**
 * Opportunity contracts and presentation options.
 *
 * All opportunity matching in Nexora is deterministic based on verified skills
 * and student profile target role. There are no synthetic match scores.
 */

export const OPPORTUNITY_SOURCE_TYPES = Object.freeze({
  CURATED_INTERNAL: 'curated_internal',
  LIVE_EXTERNAL: 'live_external',
});

export const OPPORTUNITY_FILTER_TYPES = Object.freeze({
  ALL: 'all',
  CURATED: 'curated',
  LIVE: 'live',
});

export const OPPORTUNITY_SOURCE_PRESENTATION = Object.freeze({
  curated_internal: {
    label: 'Curated Practice',
    badgeClass: 'border-orange-200 bg-orange-50 text-orange-800',
    icon: '🎯',
    description: 'Internally vetted practice opportunity to test real verified skills.',
    isCurated: true,
    isLive: false,
  },
  live_external: {
    label: 'Live Opportunity',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    icon: '🌐',
    description: 'External partner or employer job posting.',
    isCurated: false,
    isLive: true,
  },
});
