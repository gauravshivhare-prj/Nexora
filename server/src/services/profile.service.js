import {
  AGE_LIMITS,
  CGPA_LIMITS,
  GENDER_VALUES,
  GRADUATION_YEAR_WINDOW,
  PHONE_PATTERN,
  PROFILE_LIMITS,
  SEMESTER_LIMITS,
  SKILL_LEVEL_VALUES,
} from '../constants/profilePolicy.js';
import { StudentProfile, emptyProfile, toPublicProfile } from '../models/index.js';
import {
  checkDate,
  checkEnum,
  checkInteger,
  checkNumber,
  checkString,
  checkStringArray,
  checkUrl,
  isBlank,
  isPlainObject,
  unknownKeyPaths,
} from '../utils/fieldTypes.js';
import { ValidationCollector } from '../utils/validation.js';

/**
 * Student Profile business logic.
 *
 * Ownership is never an argument the caller can choose: every function here
 * takes the `userId` that requireAuth derived from a verified token, and every
 * query is scoped by it. There is no code path that reads or writes a profile
 * by its own id, so one student cannot address another's document at all.
 */

// --------------------------------------------------------------- field rules

/**
 * One checker per field, grouped by section.
 *
 * A table rather than a long if-chain so that the rule for a field sits on one
 * line next to its neighbours, and adding a field cannot accidentally skip
 * validation — anything absent from these tables is not accepted at all.
 */
const PERSONAL_FIELDS = {
  phone: (raw) =>
    checkString(raw, {
      max: PROFILE_LIMITS.phone,
      min: 6,
      pattern: PHONE_PATTERN,
      patternMessage: 'Must be a phone number — digits, spaces, hyphens and an optional leading +',
    }),
  dateOfBirth: checkDateOfBirth,
  gender: (raw) => checkEnum(raw, GENDER_VALUES),
  city: (raw) => checkString(raw, { max: PROFILE_LIMITS.city }),
  state: (raw) => checkString(raw, { max: PROFILE_LIMITS.state }),
};

const ACADEMIC_FIELDS = {
  collegeName: (raw) => checkString(raw, { max: PROFILE_LIMITS.collegeName }),
  degree: (raw) => checkString(raw, { max: PROFILE_LIMITS.degree }),
  branch: (raw) => checkString(raw, { max: PROFILE_LIMITS.branch }),
  currentSemester: (raw) => checkInteger(raw, SEMESTER_LIMITS),
  graduationYear: checkGraduationYear,
  cgpa: (raw) =>
    checkNumber(raw, {
      min: CGPA_LIMITS.min,
      max: CGPA_LIMITS.max,
      decimals: CGPA_LIMITS.decimals,
    }),
};

const CAREER_FIELDS = {
  targetRole: (raw) => checkString(raw, { max: PROFILE_LIMITS.targetRole }),
  preferredLocation: (raw) => checkString(raw, { max: PROFILE_LIMITS.preferredLocation }),
  careerInterests: (raw) => checkStringArray(raw, PROFILE_LIMITS.careerInterests),
  bio: (raw) => checkString(raw, { max: PROFILE_LIMITS.bio }),
};

/** Sections whose members are scalar fields, handled by the same walker. */
const SCALAR_SECTIONS = {
  personal: PERSONAL_FIELDS,
  academic: ACADEMIC_FIELDS,
  career: CAREER_FIELDS,
};

/** The complete set of keys a request body may contain. */
const TOP_LEVEL_KEYS = [...Object.keys(SCALAR_SECTIONS), 'skills', 'projects', 'certifications'];

/** Date of birth, bounded by AGE_LIMITS and required to be in the past. */
function checkDateOfBirth(raw) {
  const today = new Date();
  const notAfter = yearsAgo(today, AGE_LIMITS.minYears);
  const notBefore = yearsAgo(today, AGE_LIMITS.maxYears);

  return checkDate(raw, {
    notBefore,
    notAfter,
    rangeMessage: `Must be a date of birth between ${AGE_LIMITS.minYears} and ${AGE_LIMITS.maxYears} years ago`,
  });
}

function yearsAgo(from, years) {
  const date = new Date(from);
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return date;
}

/** Graduation year, relative to the year the request is made. */
function checkGraduationYear(raw) {
  const thisYear = new Date().getUTCFullYear();

  return checkInteger(raw, {
    min: thisYear - GRADUATION_YEAR_WINDOW.yearsBack,
    max: thisYear + GRADUATION_YEAR_WINDOW.yearsAhead,
  });
}

// ---------------------------------------------------------------- validation

/**
 * Validates a profile patch and returns the changes to apply.
 *
 * Merge semantics, as in RFC 7386: a key the client did not send is left
 * untouched, and an explicit `null` (or empty string) clears the stored value.
 * The alternative — replace everything on every save — means a page that edits
 * one section silently wipes the sections it did not load.
 *
 * Arrays are the exception: `skills`, `projects`, `certifications` and
 * `careerInterests` are replaced wholesale when present. There is no
 * well-defined way to merge two lists without stable ids on their entries, and
 * inventing one would make "remove this project" impossible to express.
 *
 * @param {unknown} payload Raw request body.
 * @returns {object} A flat `$set`-shaped object with dotted paths.
 * @throws {ApiError} 400 listing every field that failed.
 */
export function validateProfilePatch(payload) {
  const collector = new ValidationCollector();
  const changes = {};

  if (!isPlainObject(payload)) {
    collector.add('body', 'Must be a profile object');
    collector.throwIfInvalid();
  }

  // Checked before anything is validated. `user` is the key that matters: a
  // client trying to name whose profile to write must be told plainly that
  // ownership is not theirs to set, not given a 200 that looks like it worked.
  reportUnknownKeys(payload, TOP_LEVEL_KEYS, null, collector);

  for (const [section, fields] of Object.entries(SCALAR_SECTIONS)) {
    applyScalarSection(payload[section], { section, fields, changes, collector });
  }

  applyCollection(payload.skills, {
    name: 'skills',
    limits: PROFILE_LIMITS.skills,
    validateEntry: validateSkill,
    changes,
    collector,
  });

  applyCollection(payload.projects, {
    name: 'projects',
    limits: PROFILE_LIMITS.projects,
    validateEntry: validateProject,
    changes,
    collector,
  });

  applyCollection(payload.certifications, {
    name: 'certifications',
    limits: PROFILE_LIMITS.certifications,
    validateEntry: validateCertification,
    changes,
    collector,
  });

  collector.throwIfInvalid();

  return changes;
}

/**
 * Walks one section of scalar fields, writing dotted paths into `changes`.
 *
 * Dotted paths (`personal.city`) rather than a nested object because Mongoose
 * would otherwise treat `{ personal: { city } }` as a replacement of the whole
 * `personal` subdocument, deleting the fields the client did not send — the
 * exact data loss these merge semantics exist to prevent.
 */
function applyScalarSection(input, { section, fields, changes, collector }) {
  if (input === undefined) return;

  if (!isPlainObject(input)) {
    collector.add(section, 'Must be an object');
    return;
  }

  for (const [field, check] of Object.entries(fields)) {
    const raw = input[field];
    if (raw === undefined) continue;

    const path = `${section}.${field}`;

    // Blank means "clear this". Arrays clear to empty rather than null, so a
    // read never has to cope with both shapes for the same field.
    if (isBlank(raw)) {
      changes[path] = field === 'careerInterests' ? [] : null;
      continue;
    }

    const { value, error } = check(raw);
    if (error) {
      collector.add(path, error);
      continue;
    }

    changes[path] = value;
  }

  // Reject unknown keys rather than ignoring them: a client sending
  // `personal.pincode` has either a typo or a wrong assumption, and silently
  // dropping it would let them believe it was saved.
  reportUnknownKeys(input, Object.keys(fields), section, collector);
}

/**
 * Validates an array field and replaces it wholesale.
 *
 * Every entry is checked; the first failure in an entry does not stop the
 * others from being reported, so a student fixing a form sees all of it at once.
 */
function applyCollection(input, { name, limits, validateEntry, changes, collector }) {
  if (input === undefined) return;

  if (input === null) {
    changes[name] = [];
    return;
  }

  if (!Array.isArray(input)) {
    collector.add(name, 'Must be a list');
    return;
  }

  if (input.length > limits.maxItems) {
    collector.add(name, `Must have at most ${limits.maxItems} entries`);
    return;
  }

  const entries = [];

  input.forEach((raw, index) => {
    const path = `${name}[${index}]`;

    if (!isPlainObject(raw)) {
      collector.add(path, 'Must be an object');
      return;
    }

    const entry = validateEntry(raw, path, collector);
    if (entry) entries.push(entry);
  });

  changes[name] = entries;
}

/** A single skill entry. Both fields are required — a level-less claim says nothing. */
function validateSkill(raw, path, collector) {
  const before = collector.errors.length;

  const name = required(raw.name, (value) => checkString(value, { max: PROFILE_LIMITS.skills.name }), {
    path: `${path}.name`,
    label: 'A skill name',
    collector,
  });

  const level = required(raw.level, (value) => checkEnum(value, SKILL_LEVEL_VALUES), {
    path: `${path}.level`,
    label: 'A skill level',
    collector,
  });

  reportUnknownKeys(raw, ['name', 'level'], path, collector);

  return collector.errors.length === before ? { name, level } : null;
}

function validateProject(raw, path, collector) {
  const before = collector.errors.length;

  const title = required(
    raw.title,
    (value) => checkString(value, { max: PROFILE_LIMITS.projects.title }),
    { path: `${path}.title`, label: 'A project title', collector },
  );

  const entry = {
    title,
    description: optional(
      raw.description,
      (value) => checkString(value, { max: PROFILE_LIMITS.projects.description }),
      { path: `${path}.description`, collector },
    ),
    technologies:
      optional(
        raw.technologies,
        (value) => checkStringArray(value, PROFILE_LIMITS.projects.technologies),
        { path: `${path}.technologies`, collector },
      ) ?? [],
    projectUrl: optional(raw.projectUrl, (value) => checkUrl(value, { max: PROFILE_LIMITS.url }), {
      path: `${path}.projectUrl`,
      collector,
    }),
    githubUrl: optional(raw.githubUrl, (value) => checkUrl(value, { max: PROFILE_LIMITS.url }), {
      path: `${path}.githubUrl`,
      collector,
    }),
  };

  reportUnknownKeys(
    raw,
    ['title', 'description', 'technologies', 'projectUrl', 'githubUrl'],
    path,
    collector,
  );

  return collector.errors.length === before ? entry : null;
}

function validateCertification(raw, path, collector) {
  const before = collector.errors.length;

  const name = required(
    raw.name,
    (value) => checkString(value, { max: PROFILE_LIMITS.certifications.name }),
    { path: `${path}.name`, label: 'A certification name', collector },
  );

  const entry = {
    name,
    issuer: optional(
      raw.issuer,
      (value) => checkString(value, { max: PROFILE_LIMITS.certifications.issuer }),
      { path: `${path}.issuer`, collector },
    ),
    // A credential cannot have been issued in the future, but may be decades
    // old, so only the upper bound is enforced.
    issueDate: optional(
      raw.issueDate,
      (value) =>
        checkDate(value, { notAfter: new Date(), rangeMessage: 'Cannot be in the future' }),
      { path: `${path}.issueDate`, collector },
    ),
    credentialUrl: optional(
      raw.credentialUrl,
      (value) => checkUrl(value, { max: PROFILE_LIMITS.url }),
      { path: `${path}.credentialUrl`, collector },
    ),
  };

  reportUnknownKeys(raw, ['name', 'issuer', 'issueDate', 'credentialUrl'], path, collector);

  return collector.errors.length === before ? entry : null;
}

/** A field that must be present and valid. Records a failure and returns null. */
function required(raw, check, { path, label, collector }) {
  if (isBlank(raw)) {
    collector.add(path, `${label} is required`);
    return null;
  }

  const { value, error } = check(raw);
  if (error) {
    collector.add(path, error);
    return null;
  }

  return value;
}

/** A field that may be omitted. Blank and invalid are different outcomes. */
function optional(raw, check, { path, collector }) {
  if (isBlank(raw)) return null;

  const { value, error } = check(raw);
  if (error) {
    collector.add(path, error);
    return null;
  }

  return value;
}

/** Records one failure per unexpected key, naming it so the client can find it. */
function reportUnknownKeys(input, allowed, prefix, collector) {
  for (const path of unknownKeyPaths(input, allowed, prefix)) {
    collector.add(path, 'Is not a recognised profile field');
  }
}

// ------------------------------------------------------------------- queries

/**
 * Reads the signed-in student's profile.
 *
 * Answers with an empty profile rather than 404 when none has been saved:
 * "you have not filled this in yet" is a normal state for a new account, not
 * a failure, and the page has an empty state ready for it.
 *
 * @param {string} userId From requireAuth — never from the request body.
 * @returns {Promise<{ profile: object, exists: boolean }>}
 */
export async function getProfile(userId) {
  const profile = await StudentProfile.findOne({ user: userId });

  return profile
    ? { profile: toPublicProfile(profile), exists: true }
    : { profile: emptyProfile(), exists: false };
}

/**
 * Applies a validated patch, creating the profile on first save.
 *
 * `upsert` with a `user` filter is what makes this both idempotent and safe:
 * the owner is part of the query, not part of the update, so no field in the
 * request body can change whose profile is written. The unique index on `user`
 * means two concurrent first saves cannot produce two profiles — the loser
 * fails with a duplicate-key error, which the error middleware already maps.
 *
 * @param {string} userId From requireAuth.
 * @param {unknown} payload Raw request body.
 * @returns {Promise<object>} The saved profile, in its public shape.
 * @throws {ApiError} 400 listing every field that failed.
 */
export async function updateProfile(userId, payload) {
  const changes = validateProfilePatch(payload);

  try {
    const profile = await StudentProfile.findOneAndUpdate(
      { user: userId },
      {
        $set: changes,
        // Only applied when the upsert creates the document, so an existing
        // profile's owner is never rewritten.
        $setOnInsert: { user: userId },
      },
      {
        new: true,
        upsert: true,
        // Schema limits are a backstop behind the validator above. They would
        // not run on an update otherwise, leaving the database rules unenforced
        // for every path except document creation.
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    );

    return toPublicProfile(profile);
  } catch (err) {
    if (err.code === 11000) {
      // Race condition during upsert insert: retry update directly now that the doc exists
      const profile = await StudentProfile.findOneAndUpdate(
        { user: userId },
        { $set: changes },
        {
          new: true,
          runValidators: true,
        },
      );
      if (profile) {
        return toPublicProfile(profile);
      }
    }
    throw err;
  }
}
