/**
 * Profile form options and input limits.
 *
 * These mirror server/src/constants/profilePolicy.js. The server remains the
 * authority — it re-checks every one of these and rejects anything that gets
 * past the browser. They exist here only so an input can stop a student at the
 * limit rather than letting them write a long answer and then lose it to a
 * validation error.
 *
 * If a limit changes, change it in both places; the server-side profile tests
 * are what will catch a disagreement that matters.
 */

export const FIELD_LIMITS = {
  phone: 20,
  city: 100,
  state: 100,
  collegeName: 200,
  degree: 100,
  branch: 100,
  targetRole: 120,
  preferredLocation: 120,
  bio: 1000,
  skillName: 80,
  projectTitle: 150,
  projectDescription: 1000,
  certificationName: 200,
  certificationIssuer: 150,
  url: 500,
};

export const LIST_LIMITS = {
  careerInterests: { maxItems: 20, maxLength: 60 },
  technologies: { maxItems: 25, maxLength: 60 },
  skills: 100,
  projects: 30,
  certifications: 30,
};

export const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

export const SKILL_LEVEL_OPTIONS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'expert', label: 'Expert' },
];

export const SEMESTER_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1),
  label: `Semester ${index + 1}`,
}));
