import { CAREER_ROLES, CATALOGUE_SOURCE, CATALOGUE_VERSION } from './roleCatalogue.js';
import {
  DIMENSION_WEIGHTS,
  MINIMUM_RECOMMENDABLE_SCORE,
  STRENGTH_CREDIT,
  WEIGHTS_VERSION,
  bandFor,
} from './scoring.js';
import { skillDisplayName, skillKey } from '../skills/skillKey.js';

/**
 * Matching a student's CareerTwin against career roles.
 *
 * Deterministic and explainable, with no AI anywhere. The same twin and the
 * same catalogue always produce the same scores, and every score arrives
 * with the skills that produced it.
 *
 * That is not a stylistic preference. A student is going to make a decision
 * on this, and "you are a 71% match for Backend Developer" is worthless
 * unless they can also see *which four skills* they have and *which two* they
 * are missing. So nothing here returns a bare number: `matched`, `missing`
 * and `evidence` travel with it, and the UI can show the reasoning instead of
 * asking for trust.
 *
 * Everything is computed from the CareerTwin, never from the profile or
 * resumes directly. The twin has already merged spellings, resolved
 * synonyms and attached evidence; reaching past it would redo that work and
 * eventually redo it differently.
 */

/**
 * Scores one student against one role.
 *
 * @param {object} twin CareerTwin content — needs `skills`, `interests`,
 *   `targetRoles`, `academic`.
 * @param {import('./roleCatalogue.js').CareerRole} role
 * @returns {object} Score, band, and the full reasoning behind both.
 */
export function scoreRoleMatch(twin, role) {
  const held = indexSkills(twin.skills ?? []);

  const required = classify(role.requiredSkills, held);
  const preferred = classify(role.preferredSkills, held);

  const dimensions = {
    requiredSkills: ratio(required.matched.length, role.requiredSkills.length),
    preferredSkills: ratio(preferred.matched.length, role.preferredSkills.length),
    evidenceStrength: evidenceScore([...required.matched, ...preferred.matched]),
    interestAlignment: interestScore(twin, role),
    backgroundAlignment: backgroundScore(twin, role),
  };

  const score = Math.round(
    Object.entries(dimensions).reduce(
      (total, [name, value]) => total + value * DIMENSION_WEIGHTS[name],
      0,
    ) * 100,
  );

  const band = bandFor(score);

  return {
    roleId: role.id,
    title: role.title,
    category: role.category,
    summary: role.summary,

    score,
    band: band.label,
    bandDescription: band.description,

    /**
     * The per-dimension breakdown, as percentages.
     *
     * Exposed rather than kept internal: a student who disagrees with their
     * score should be able to see which part of it they disagree with.
     */
    dimensions: Object.fromEntries(
      Object.entries(dimensions).map(([name, value]) => [
        name,
        { value: Math.round(value * 100), weight: DIMENSION_WEIGHTS[name] },
      ]),
    ),

    matchedRequired: required.matched.map(describeMatch),
    missingRequired: required.missing,
    matchedPreferred: preferred.matched.map(describeMatch),
    missingPreferred: preferred.missing,

    /** Concrete things the student has done that count towards this role. */
    evidence: collectEvidence([...required.matched, ...preferred.matched]),

    explanation: explain(role, required, preferred, band),
  };
}

/**
 * Ranks every role in the catalogue for a student.
 *
 * @param {object} twin CareerTwin content.
 * @param {{ limit?: number, includeBelowThreshold?: boolean }} [options]
 * @returns {{ matches: object[], catalogue: object }}
 */
export function rankRoles(twin, { limit = 5, includeBelowThreshold = false } = {}) {
  const scored = CAREER_ROLES.map((role) => scoreRoleMatch(twin, role))
    .filter((match) => includeBelowThreshold || match.score >= MINIMUM_RECOMMENDABLE_SCORE)
    // Ties broken by title so the order is stable across runs — an unstable
    // ordering would make a recommendation list appear to change on its own.
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title));

  return {
    matches: scored.slice(0, limit),
    catalogue: {
      version: CATALOGUE_VERSION,
      weightsVersion: WEIGHTS_VERSION,
      source: CATALOGUE_SOURCE.type,
      rolesConsidered: CAREER_ROLES.length,
    },
  };
}

// ------------------------------------------------------------------ scoring

/** The student's skills, keyed for lookup. */
function indexSkills(skills) {
  return new Map(skills.map((skill) => [skill.key, skill]));
}

/**
 * Splits a role's skill list into what the student has and what they do not.
 *
 * Matching is by canonical key, so the catalogue's "Node.js" finds a
 * student's "NodeJS" without either list having to be spelled a particular
 * way.
 */
function classify(roleSkills, held) {
  const matched = [];
  const missing = [];

  for (const name of roleSkills) {
    const skill = held.get(skillKey(name));

    if (skill) matched.push({ required: name, skill });
    else missing.push(skillDisplayName(name));
  }

  return { matched, missing };
}

/** Zero when a role lists nothing in a category, rather than dividing by zero. */
function ratio(count, total) {
  return total === 0 ? 0 : count / total;
}

/**
 * How well-evidenced the student's matching skills are.
 *
 * The mean credit across matched skills, so it answers "how solid is what
 * you have?" rather than "how much do you have?" — which is what the two
 * coverage dimensions already measure. Without that separation a student
 * with one well-evidenced skill would score the same as one with six.
 *
 * Zero for no matches: there is no evidence to be strong or weak about, and
 * any other value would be an opinion about nothing.
 */
function evidenceScore(matches) {
  if (matches.length === 0) return 0;

  const total = matches.reduce(
    (sum, match) => sum + (STRENGTH_CREDIT[match.skill.strength] ?? 0),
    0,
  );

  return total / matches.length;
}

/**
 * Whether the student has pointed in this direction themselves.
 *
 * Their stated target role counts fully; a matching interest counts for
 * half. Naming a role is a stronger statement than listing a field.
 *
 * Substring matching on the title is intentional, so "Backend Developer"
 * matches a stated target of "Backend Engineer". It is generous by design —
 * the dimension is worth 10%, and a false positive here moves a score by a
 * few points at most.
 */
function interestScore(twin, role) {
  const roleWords = normalise(role.title);

  const statedTarget = (twin.targetRoles ?? []).some(
    (target) => target.origin === 'student' && sharesWord(normalise(target.title), roleWords),
  );
  if (statedTarget) return 1;

  const interests = twin.interests ?? [];
  const matchesInterest = interests.some(
    (interest) =>
      sharesWord(normalise(interest), roleWords) ||
      [...role.requiredSkills, ...role.preferredSkills].some(
        (skill) => skillKey(skill) === skillKey(interest),
      ),
  );

  return matchesInterest ? 0.5 : 0;
}

/**
 * Whether the student's field of study is one this role commonly draws from.
 *
 * Returns a **neutral** 0.5 when the branch is unknown, not 0. A student who
 * has not filled in their branch has not told us they are a bad fit, and
 * scoring silence as a negative would penalise an incomplete profile rather
 * than describe a person.
 *
 * A different background scores 0 on this dimension and nothing more — it is
 * worth 5%, and people enter all of these roles from everywhere. There is
 * deliberately no exclusion rule anywhere in this file.
 */
function backgroundScore(twin, role) {
  const branch = twin.academic?.branch;
  if (!branch) return 0.5;

  // Compared as text rather than word sets, and in both directions, so
  // "Computer Science and Engineering" matches a listed "computer science"
  // and a listed "computer science and engineering" matches a branch of
  // "Computer Science".
  const normalised = flatten(branch);
  const matches = role.commonBackgrounds.some((background) => {
    const candidate = flatten(background);
    return normalised.includes(candidate) || candidate.includes(normalised);
  });

  return matches ? 1 : 0;
}

// ------------------------------------------------------------- explanation

function describeMatch({ required, skill }) {
  return {
    /** The catalogue's spelling, so it lines up with the role's own list. */
    name: skillDisplayName(required),
    /** What the student called it, which may differ. */
    yourSkill: skill.name,
    strength: skill.strength,
    sourceCount: skill.sourceCount ?? 0,
  };
}

/**
 * The concrete things behind a match.
 *
 * De-duplicated across skills: one project using React, Express and Node.js
 * is one piece of evidence, not three, and listing it three times would
 * overstate how much the student has done.
 */
function collectEvidence(matches) {
  const seen = new Map();

  for (const { skill } of matches) {
    for (const item of skill.evidence ?? []) {
      const key = `${item.source}:${item.reference ?? item.detail}`;
      if (seen.has(key)) {
        seen.get(key).skills.push(skill.name);
        continue;
      }

      seen.set(key, {
        source: item.source,
        strength: item.strength,
        detail: item.detail,
        reference: item.reference ?? null,
        skills: [skill.name],
      });
    }
  }

  // Strongest evidence first — it is the most persuasive thing to read.
  const order = { verified: 0, supported: 1, claimed: 2 };
  return [...seen.values()].sort((left, right) => order[left.strength] - order[right.strength]);
}

/**
 * The score in sentences.
 *
 * Built from the same numbers as the score, so the two cannot disagree. The
 * missing-skill line names at most three: a list of nine reads as a verdict
 * rather than a next step, and the full list is in `missingRequired` for a
 * client that wants it.
 */
function explain(role, required, preferred, band) {
  const lines = [band.description];

  if (required.matched.length > 0) {
    lines.push(
      `You have ${required.matched.length} of ${role.requiredSkills.length} core skills: ${listOf(required.matched.map((match) => skillDisplayName(match.required)))}.`,
    );
  } else {
    lines.push(`You do not yet have any of this role's core skills.`);
  }

  if (required.missing.length > 0) {
    lines.push(`Still needed: ${listOf(required.missing.slice(0, 3))}.`);
  }

  if (preferred.matched.length > 0) {
    lines.push(
      `You also have ${preferred.matched.length} of ${role.preferredSkills.length} skills that strengthen this path.`,
    );
  }

  return lines;
}

function listOf(items) {
  return new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(items);
}

/** A title as a list of lowercase words, for word-level comparison. */
function normalise(text) {
  return flatten(text).split(' ').filter(Boolean);
}

/** A phrase as one lowercase string with single spaces, for substring tests. */
function flatten(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Whether two titles share a meaningful word.
 *
 * Generic job-title words are ignored — "Backend Developer" and "Frontend
 * Developer" share "developer", and treating that as alignment would make
 * every engineering role match every engineering interest.
 */
const GENERIC_TITLE_WORDS = new Set([
  'developer',
  'engineer',
  'analyst',
  'scientist',
  'designer',
  'specialist',
  'associate',
  'junior',
  'senior',
  'intern',
  'software',
  'application',
  'applications',
]);

function sharesWord(left, right) {
  const meaningful = new Set(right.filter((word) => !GENERIC_TITLE_WORDS.has(word)));
  return left.some((word) => meaningful.has(word));
}
