/**
 * Learning resource references.
 *
 * ## Why these are placeholders
 *
 * Nexora has no verified dataset of courses. The obvious thing to do here —
 * have a model suggest "the Docker course on Udemy" and store the URL it
 * produces — is the worst available option. Models invent plausible course
 * titles and plausible URLs with equal confidence, and a student following a
 * dead or wrong link has been actively misled by the product that told them
 * to. A fabricated resource is worse than no resource, because no resource
 * at least tells the truth about what Nexora knows.
 *
 * So a resource reference here describes a *kind* of resource and how to
 * find it, never a specific one. `searchHint` is a query a student can run
 * themselves, and `url` is null everywhere until there is a real catalogue
 * behind it. The shape is the shape a real resource will have, so wiring one
 * in later is populating a field rather than a migration.
 */

/** Kinds of learning resource a roadmap item can point at. */
export const RESOURCE_TYPES = {
  /** Official documentation for a technology. */
  DOCUMENTATION: 'documentation',
  /** A structured course. */
  COURSE: 'course',
  /** Something to build. */
  PRACTICE_PROJECT: 'practice_project',
  /** A Nexora assessment. Not available until Phase 8. */
  ASSESSMENT: 'assessment',
};

/**
 * Builds the resource references for one skill.
 *
 * Deliberately the same three kinds for every skill rather than a curated
 * set per skill. A per-skill list would either be a catalogue Nexora does
 * not have, or a guess dressed up as one. What varies is the skill name in
 * the search hint, which is genuinely useful and makes no claim.
 *
 * @param {string} skillName
 * @returns {object[]}
 */
export function resourcesFor(skillName) {
  return [
    {
      type: RESOURCE_TYPES.DOCUMENTATION,
      title: `Official ${skillName} documentation`,
      /**
       * Null, always, until a verified catalogue exists. Guessing a
       * documentation URL from a skill name is how a student ends up at a
       * parked domain.
       */
      url: null,
      searchHint: `${skillName} official documentation`,
      verified: false,
    },
    {
      type: RESOURCE_TYPES.COURSE,
      title: `An introductory ${skillName} course`,
      url: null,
      searchHint: `learn ${skillName} beginner course`,
      verified: false,
    },
    {
      type: RESOURCE_TYPES.PRACTICE_PROJECT,
      title: `Build something small with ${skillName}`,
      url: null,
      // No search hint: this is a thing to do, not a thing to look up.
      searchHint: null,
      verified: false,
    },
  ];
}

/**
 * The verification step for a skill: how a student proves they learned it.
 *
 * This is the part of a roadmap item that closes the loop back to the
 * evidence model. Finishing a course proves nothing Nexora can record;
 * shipping a project and listing its technologies moves the skill from
 * `claimed` to `supported`, and that is a change the student can see.
 *
 * @param {string} skillName
 * @returns {object}
 */
export function verificationFor(skillName) {
  return {
    method: 'project',
    description: `Add a project to your profile that lists ${skillName} among its technologies.`,
    /** The gap status this would reach. Matches GAP_STATUS.SUPPORTED. */
    reaches: 'supported',
    available: true,
    alternative: {
      method: 'assessment',
      description: `Pass a Nexora ${skillName} assessment.`,
      reaches: 'verified',
      available: false,
      note: 'Assessments are not available yet.',
    },
  };
}
