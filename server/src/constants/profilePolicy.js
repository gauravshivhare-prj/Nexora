/**
 * Student Profile rules in one place.
 *
 * The validator, the Mongoose schema and the tests all read these constants,
 * so a limit cannot drift between the API boundary and the database. Same
 * arrangement as authPolicy.js, for the same reason.
 */

/**
 * Every bound is deliberate rather than decorative. An unbounded string or
 * array in a user-editable document is a storage and rendering problem: one
 * request could otherwise persist megabytes that every later read must load.
 */
export const PROFILE_LIMITS = {
  // --- Personal ---
  phone: 20,
  city: 100,
  state: 100,

  // --- Academic ---
  collegeName: 200,
  degree: 100,
  branch: 100,

  // --- Career ---
  targetRole: 120,
  preferredLocation: 120,
  bio: 1000,
  careerInterests: { maxItems: 20, maxLength: 60 },

  // --- Collections ---
  skills: { maxItems: 100, name: 80 },
  projects: {
    maxItems: 30,
    title: 150,
    description: 1000,
    technologies: { maxItems: 25, maxLength: 60 },
  },
  certifications: { maxItems: 30, name: 200, issuer: 150 },

  /** Applies to every URL field: project, repository and credential links. */
  url: 500,
};

/**
 * Deliberately permissive: digits, spaces, hyphens, parentheses, dots and an
 * optional leading "+". Nexora's users are students across many countries and
 * a stricter national format would reject legitimate numbers. The only claim
 * this makes is "looks like a phone number", which is all we can verify
 * without sending an SMS.
 */
export const PHONE_PATTERN = /^\+?[\d\s\-().]{6,20}$/;

/**
 * Self-declared proficiency.
 *
 * This is a *claim*, not evidence. Nothing downstream may treat a profile
 * skill as demonstrated on the strength of this field alone — see the
 * evidence model in the Skill Gap phase.
 */
export const SKILL_LEVELS = {
  BEGINNER: 'beginner',
  INTERMEDIATE: 'intermediate',
  ADVANCED: 'advanced',
  EXPERT: 'expert',
};

export const SKILL_LEVEL_VALUES = Object.values(SKILL_LEVELS);

/**
 * Includes an explicit opt-out so a student is never forced to disclose
 * gender to complete a profile. Every profile field is optional, but this one
 * benefits from a named value rather than silence.
 */
export const GENDER_VALUES = ['male', 'female', 'other', 'prefer_not_to_say'];

/**
 * Age bounds for date of birth.
 *
 * The lower bound is a sanity check, not a policy: it rejects an obvious typo
 * such as a year of 2202 or 1802 without making a judgement about who may use
 * Nexora.
 */
export const AGE_LIMITS = {
  minYears: 13,
  maxYears: 100,
};

/**
 * Graduation year window, relative to the current year.
 *
 * Past years are allowed because a graduate may still use Nexora; the future
 * window covers a first-year student on a long programme.
 */
export const GRADUATION_YEAR_WINDOW = {
  yearsBack: 60,
  yearsAhead: 10,
};

export const SEMESTER_LIMITS = {
  min: 1,
  /** Covers integrated and dual-degree programmes, which run beyond eight. */
  max: 12,
};

/**
 * CGPA is stored on a 0–10 scale, which is what Indian universities issue and
 * what Nexora's users will be reading off their own transcripts. A 4-point GPA
 * is *not* silently converted: it would land at the bottom of this range and
 * quietly misrepresent the student. Supporting other scales means storing the
 * scale alongside the value, which is a deliberate future change.
 */
export const CGPA_LIMITS = {
  min: 0,
  max: 10,
  /** Transcripts are issued to two decimal places. */
  decimals: 2,
};
