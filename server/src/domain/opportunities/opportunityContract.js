/**
 * Contract for the opportunity catalogue and its deterministic match result.
 *
 * G7 defines the boundary only. G8 supplies a small internal catalogue and a
 * matcher; neither may imply live external data that does not exist.
 */
export const OPPORTUNITY_CONTRACT_VERSION = 1;
export const OPPORTUNITY_CATALOGUE_VERSION = 1;

export const OPPORTUNITY_SOURCE_TYPES = Object.freeze({
  CURATED_INTERNAL: 'curated_internal',
});

export const OPPORTUNITY_ELIGIBILITY_TYPES = Object.freeze({
  VERIFIED_SKILLS: 'verified_skills',
  TARGET_ROLE: 'target_role',
});

export const OPPORTUNITY_REQUIRED_FIELDS = Object.freeze([
  'id',
  'title',
  'summary',
  'source',
  'eligibility',
  'requiredSkills',
  'targetRoleIds',
]);

export const OPPORTUNITY_SOURCE_FIELDS = Object.freeze(['type', 'version', 'asOf']);