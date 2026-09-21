import { patch, request } from './apiClient.js';

/**
 * Student Profile calls against the Nexora API.
 *
 * Unwraps the envelope and guarantees a complete profile shape to callers, so
 * no component has to write `profile.personal?.city ?? ''` or cope with a
 * section the backend happened not to send.
 */

/** The shape a freshly opened, never-saved profile form starts from. */
export function blankProfile() {
  return {
    personal: { phone: '', dateOfBirth: '', gender: '', city: '', state: '' },
    academic: {
      collegeName: '',
      degree: '',
      branch: '',
      currentSemester: '',
      graduationYear: '',
      cgpa: '',
    },
    career: { targetRole: '', preferredLocation: '', careerInterests: [], bio: '' },
    skills: [],
    projects: [],
    certifications: [],
  };
}

/**
 * Converts the API's nulls into the empty strings a controlled input needs.
 *
 * React logs a warning and switches an input to uncontrolled the moment its
 * value becomes null or undefined, so this conversion is not cosmetic.
 */
function toFormValues(profile) {
  const blank = blankProfile();

  return {
    personal: fillSection(blank.personal, profile?.personal),
    academic: fillSection(blank.academic, profile?.academic),
    career: {
      ...fillSection(blank.career, profile?.career),
      careerInterests: profile?.career?.careerInterests ?? [],
    },
    skills: (profile?.skills ?? []).map((skill) => ({
      name: skill.name ?? '',
      level: skill.level ?? 'beginner',
    })),
    projects: (profile?.projects ?? []).map((project) => ({
      title: project.title ?? '',
      description: project.description ?? '',
      technologies: project.technologies ?? [],
      projectUrl: project.projectUrl ?? '',
      githubUrl: project.githubUrl ?? '',
    })),
    certifications: (profile?.certifications ?? []).map((certification) => ({
      name: certification.name ?? '',
      issuer: certification.issuer ?? '',
      issueDate: certification.issueDate ?? '',
      credentialUrl: certification.credentialUrl ?? '',
    })),
  };
}

/** Replaces nulls with the blank default for each key of one section. */
function fillSection(blank, incoming) {
  const section = { ...blank };

  for (const key of Object.keys(blank)) {
    const value = incoming?.[key];
    if (value !== null && value !== undefined && !Array.isArray(value)) {
      section[key] = String(value);
    }
  }

  return section;
}

/**
 * GET /api/profile
 *
 * @returns {Promise<{ values: object, exists: boolean }>} `exists` is false
 *   before the first save, which is what the page's empty state keys off.
 */
export async function fetchProfile({ signal } = {}) {
  const body = await request('/api/profile', { signal });

  const profile = body?.data?.profile;
  if (!profile) throw new Error('The backend returned an unexpected response shape.');

  return { values: toFormValues(profile), exists: Boolean(body.data.exists) };
}

/**
 * PATCH /api/profile
 *
 * The form holds every field, so the whole form is sent. Empty strings are
 * left in deliberately: the backend reads a blank value as "clear this", which
 * is exactly what emptying a field in the UI should mean.
 *
 * @returns {Promise<{ values: object, exists: boolean }>} The saved profile as
 *   the server stored it — trimmed, rounded and re-ordered — so the form shows
 *   what was actually persisted rather than what was typed.
 */
export async function saveProfile(values) {
  const body = await patch('/api/profile', toRequestPayload(values));

  const profile = body?.data?.profile;
  if (!profile) throw new Error('The backend returned an unexpected response shape.');

  return { values: toFormValues(profile), exists: true };
}

/**
 * Drops list entries the student started and abandoned.
 *
 * An empty row left behind by "Add skill" is a UI artefact. Sending it would
 * fail validation on a field the student never meant to fill, so it is removed
 * here rather than reported back at them.
 */
function toRequestPayload(values) {
  return {
    ...values,
    skills: values.skills.filter((skill) => skill.name.trim() !== ''),
    projects: values.projects.filter((project) => project.title.trim() !== ''),
    certifications: values.certifications.filter(
      (certification) => certification.name.trim() !== '',
    ),
  };
}
