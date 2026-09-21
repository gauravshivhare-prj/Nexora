import { PARSED_LIMITS, PARSED_YEAR_RANGE } from '../../constants/resumePolicy.js';
import {
  checkInteger,
  checkString,
  checkStringArray,
  isBlank,
  isPlainObject,
} from '../../utils/fieldTypes.js';

/**
 * Schema validation for AI-parsed resume data.
 *
 * Step two of the pipeline: raw text → JSON → **schema validation** → business
 * validation → persistence. This module answers "is this the right shape?".
 * Whether the content is *true* is the grounding step's job.
 *
 * Two kinds of finding, treated differently on purpose:
 *
 *  - **errors** are structural. The model returned something that is not a
 *    parsed resume at all — `skills` as a string, `basics` as an array. The
 *    analysis fails and nothing is stored.
 *  - **warnings** are per-entry. One of forty skills was a number, so that
 *    entry is dropped and recorded. Failing the whole analysis over one bad
 *    row would throw away thirty-nine good ones.
 *
 * Nothing here throws. An unusable response from a model is an expected
 * outcome to be recorded against the document, not an exception.
 *
 * The output is an allow-list: a key the model invents is ignored rather than
 * stored, so a provider cannot introduce a field no later phase expects.
 *
 * Skills carry no proficiency level. A resume says a person listed a skill,
 * not how good they are at it, and a model asked to guess would produce a
 * number that looks like evidence and is not. Proficiency comes from the
 * evidence model, not from a document.
 */

/**
 * @param {unknown} raw Parsed JSON from the provider.
 * @returns {{ value: object|null, errors: string[], warnings: string[] }}
 */
export function validateParsedResume(raw) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(raw)) {
    return { value: null, errors: ['The AI response was not a parsed-resume object.'], warnings };
  }

  const value = {
    basics: readBasics(raw.basics, errors, warnings),
    education: readList(raw.education, {
      field: 'education',
      limit: PARSED_LIMITS.education,
      read: readEducation,
      errors,
      warnings,
    }),
    skills: readSkills(raw.skills, errors, warnings),
    projects: readList(raw.projects, {
      field: 'projects',
      limit: PARSED_LIMITS.projects,
      read: readProject,
      errors,
      warnings,
    }),
    experience: readList(raw.experience, {
      field: 'experience',
      limit: PARSED_LIMITS.experience,
      read: readExperience,
      errors,
      warnings,
    }),
    certifications: readList(raw.certifications, {
      field: 'certifications',
      limit: PARSED_LIMITS.certifications,
      read: readCertification,
      errors,
      warnings,
    }),
    achievements: readAchievements(raw.achievements, errors, warnings),
  };

  return { value: errors.length > 0 ? null : value, errors, warnings };
}

// ----------------------------------------------------------------- sections

function readBasics(raw, errors, warnings) {
  const empty = { fullName: null, email: null, phone: null, location: null, links: [] };

  if (raw === undefined || raw === null) return empty;

  if (!isPlainObject(raw)) {
    errors.push('`basics` was not an object.');
    return empty;
  }

  return {
    fullName: text(raw.fullName, 'basics.fullName', PARSED_LIMITS.string, warnings),
    email: text(raw.email, 'basics.email', PARSED_LIMITS.string, warnings),
    phone: text(raw.phone, 'basics.phone', PARSED_LIMITS.string, warnings),
    location: text(raw.location, 'basics.location', PARSED_LIMITS.string, warnings),
    links: strings(raw.links, 'basics.links', PARSED_LIMITS.links, warnings),
  };
}

/**
 * Skills, as bare names.
 *
 * Accepts both `["Node.js"]` and `[{ name: "Node.js" }]`: which one a model
 * produces varies with the prompt and the provider, and normalising here is
 * cheaper than constraining every future prompt to one of them.
 */
function readSkills(raw, errors, warnings) {
  if (raw === undefined || raw === null) return [];

  if (!Array.isArray(raw)) {
    errors.push('`skills` was not a list.');
    return [];
  }

  const skills = [];
  const seen = new Set();

  for (const [index, entry] of raw.slice(0, PARSED_LIMITS.skills.maxItems).entries()) {
    const rawName = isPlainObject(entry) ? entry.name : entry;

    if (isBlank(rawName)) continue;

    const { value, error } = checkString(rawName, { max: PARSED_LIMITS.skills.maxLength });
    if (error) {
      warnings.push(`Dropped skills[${index}]: ${error.toLowerCase()}.`);
      continue;
    }

    const key = value.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    skills.push({ name: value });
  }

  if (raw.length > PARSED_LIMITS.skills.maxItems) {
    warnings.push(
      `The AI returned ${raw.length} skills; kept the first ${PARSED_LIMITS.skills.maxItems}.`,
    );
  }

  return skills;
}

function readEducation(entry, path, warnings) {
  return {
    institution: text(entry.institution, `${path}.institution`, PARSED_LIMITS.string, warnings),
    degree: text(entry.degree, `${path}.degree`, PARSED_LIMITS.string, warnings),
    field: text(entry.field, `${path}.field`, PARSED_LIMITS.string, warnings),
    startYear: year(entry.startYear, `${path}.startYear`, warnings),
    endYear: year(entry.endYear, `${path}.endYear`, warnings),
    // Free text, not a number: a transcript may say "8.4 CGPA", "First Class"
    // or "72%". Coercing those to one numeric scale would invent precision
    // the document does not have.
    grade: text(entry.grade, `${path}.grade`, PARSED_LIMITS.string, warnings),
  };
}

function readProject(entry, path, warnings) {
  return {
    title: text(entry.title, `${path}.title`, PARSED_LIMITS.string, warnings),
    description: text(entry.description, `${path}.description`, PARSED_LIMITS.description, warnings),
    technologies: strings(
      entry.technologies,
      `${path}.technologies`,
      PARSED_LIMITS.technologies,
      warnings,
    ),
  };
}

function readExperience(entry, path, warnings) {
  return {
    organisation: text(entry.organisation, `${path}.organisation`, PARSED_LIMITS.string, warnings),
    title: text(entry.title, `${path}.title`, PARSED_LIMITS.string, warnings),
    // Kept as the document wrote them — "Jan 2024", "Summer 2025", "Present".
    // Parsing those into dates means guessing, and a wrong guess about when
    // someone worked somewhere is worse than the original string.
    startDate: text(entry.startDate, `${path}.startDate`, PARSED_LIMITS.string, warnings),
    endDate: text(entry.endDate, `${path}.endDate`, PARSED_LIMITS.string, warnings),
    description: text(entry.description, `${path}.description`, PARSED_LIMITS.description, warnings),
  };
}

function readCertification(entry, path, warnings) {
  return {
    name: text(entry.name, `${path}.name`, PARSED_LIMITS.string, warnings),
    issuer: text(entry.issuer, `${path}.issuer`, PARSED_LIMITS.string, warnings),
    issueYear: year(entry.issueYear, `${path}.issueYear`, warnings),
  };
}

function readAchievements(raw, errors, warnings) {
  if (raw === undefined || raw === null) return [];

  if (!Array.isArray(raw)) {
    errors.push('`achievements` was not a list.');
    return [];
  }

  return strings(raw, 'achievements', PARSED_LIMITS.achievements, warnings);
}

// ------------------------------------------------------------------ helpers

/**
 * Reads a list of objects, dropping entries that are not objects or that come
 * out entirely empty.
 *
 * An entry where every field failed carries no information; keeping it would
 * put blank rows in front of a student as though they were parsed content.
 */
function readList(raw, { field, limit, read, errors, warnings }) {
  if (raw === undefined || raw === null) return [];

  if (!Array.isArray(raw)) {
    errors.push(`\`${field}\` was not a list.`);
    return [];
  }

  const entries = [];

  for (const [index, entry] of raw.slice(0, limit.maxItems).entries()) {
    const path = `${field}[${index}]`;

    if (!isPlainObject(entry)) {
      warnings.push(`Dropped ${path}: it was not an object.`);
      continue;
    }

    const parsed = read(entry, path, warnings);
    if (isEmptyEntry(parsed)) {
      warnings.push(`Dropped ${path}: it contained no usable fields.`);
      continue;
    }

    entries.push(parsed);
  }

  if (raw.length > limit.maxItems) {
    warnings.push(`The AI returned ${raw.length} ${field} entries; kept the first ${limit.maxItems}.`);
  }

  return entries;
}

function isEmptyEntry(entry) {
  return Object.values(entry).every(
    (value) => value === null || (Array.isArray(value) && value.length === 0),
  );
}

/** An optional string field. Absent is fine; the wrong type is a warning. */
function text(raw, path, max, warnings) {
  if (isBlank(raw)) return null;

  const { value, error } = checkString(raw, { max });
  if (error) {
    warnings.push(`Dropped ${path}: ${error.toLowerCase()}.`);
    return null;
  }

  return value;
}

/** An optional list of short strings. */
function strings(raw, path, limit, warnings) {
  if (raw === undefined || raw === null) return [];

  if (!Array.isArray(raw)) {
    warnings.push(`Dropped ${path}: it was not a list.`);
    return [];
  }

  const { value, error } = checkStringArray(raw.slice(0, limit.maxItems), {
    maxItems: limit.maxItems,
    maxLength: limit.maxLength,
  });

  if (error) {
    warnings.push(`Dropped ${path}: ${error.toLowerCase()}.`);
    return [];
  }

  return value;
}

/** An optional four-digit year. Accepts a numeric string, as models emit both. */
function year(raw, path, warnings) {
  if (isBlank(raw)) return null;

  const { value, error } = checkInteger(raw, PARSED_YEAR_RANGE);
  if (error) {
    warnings.push(`Dropped ${path}: ${error.toLowerCase()}.`);
    return null;
  }

  return value;
}
