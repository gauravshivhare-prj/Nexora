import { EVIDENCE_STRENGTH } from '../evidence/evidence.js';
import { skillDisplayName, skillKey } from '../skills/skillKey.js';

/**
 * Comparing what a student can show against what a role asks for.
 *
 * The output is not a list of missing words. It is a list of *statuses*, each
 * with the reason behind it and a concrete way to change it — because the
 * useful question is never "do you have Docker?" but "what would it take for
 * Nexora to say you have Docker?".
 *
 * The distinction that makes this worth building is between a skill that is
 * merely claimed and one that is demonstrated. A student who typed "Docker,
 * expert" into a form has a gap; a student who shipped a containerised
 * project does not. Any system that treats those the same is a checklist,
 * and the student finds out which they were at the interview.
 *
 * Pure: no database, no clock, no AI. Same twin and same role, same gaps.
 */

/**
 * What Nexora is prepared to say about a skill.
 *
 * Ordered from worst to best, which is also the order a student should work
 * through them in.
 */
export const GAP_STATUS = {
  /** No evidence of any kind. */
  MISSING: 'missing',
  /**
   * The student says they have it and nothing else does.
   *
   * Deliberately its own status rather than counted as "have it". This is
   * the case the product exists to surface: it looks like a skill on a
   * profile and behaves like a gap in an interview.
   */
  CLAIMED: 'claimed',
  /** They pointed at a project or certification that involves it. */
  SUPPORTED: 'supported',
  /** An independent check passed. Nothing produces this yet — Phase 8. */
  VERIFIED: 'verified',
};

/** How important the skill is to the role. */
export const GAP_IMPORTANCE = {
  REQUIRED: 'required',
  PREFERRED: 'preferred',
};

/** Evidence strength maps straight onto gap status. */
const STATUS_FOR_STRENGTH = {
  [EVIDENCE_STRENGTH.CLAIMED]: GAP_STATUS.CLAIMED,
  [EVIDENCE_STRENGTH.SUPPORTED]: GAP_STATUS.SUPPORTED,
  [EVIDENCE_STRENGTH.VERIFIED]: GAP_STATUS.VERIFIED,
};

/**
 * Priority order for what to work on next.
 *
 * Required-and-missing first, because that is what stops someone being
 * considered at all. Required-but-only-claimed next: the student believes
 * they are done there, so it is the gap most likely to surprise them.
 *
 * Verified skills are not in this list — there is nothing to do about them.
 */
const PRIORITY = [
  { importance: GAP_IMPORTANCE.REQUIRED, status: GAP_STATUS.MISSING },
  { importance: GAP_IMPORTANCE.REQUIRED, status: GAP_STATUS.CLAIMED },
  { importance: GAP_IMPORTANCE.PREFERRED, status: GAP_STATUS.MISSING },
  { importance: GAP_IMPORTANCE.REQUIRED, status: GAP_STATUS.SUPPORTED },
  { importance: GAP_IMPORTANCE.PREFERRED, status: GAP_STATUS.CLAIMED },
  { importance: GAP_IMPORTANCE.PREFERRED, status: GAP_STATUS.SUPPORTED },
];

/**
 * Compares a CareerTwin against one role.
 *
 * @param {object} twin CareerTwin content — needs `skills`.
 * @param {import('../careers/roleCatalogue.js').CareerRole} role
 * @returns {object} Every skill the role names, with its status and what
 *   would change it.
 */
export function computeSkillGap(twin, role) {
  const held = new Map((twin.skills ?? []).map((skill) => [skill.key, skill]));

  const skills = [
    ...role.requiredSkills.map((name) => assess(name, GAP_IMPORTANCE.REQUIRED, held, role)),
    ...role.preferredSkills.map((name) => assess(name, GAP_IMPORTANCE.PREFERRED, held, role)),
  ].sort(byPriority);

  return {
    roleId: role.id,
    roleTitle: role.title,
    skills,
    summary: summarise(skills),
    /**
     * Skills the student has that the role does not ask for.
     *
     * Reported as context, never as a criticism. A backend student's Figma
     * is not a flaw in their backend profile — it is a hint that another
     * role may fit better, and that is the reader's call to make.
     */
    additionalSkills: extraSkills(twin, role),
  };
}

/** Works out where one of the role's skills stands for this student. */
function assess(requiredName, importance, held, role) {
  const key = skillKey(requiredName);
  const skill = held.get(key);
  const name = skillDisplayName(requiredName);

  if (!skill) {
    return {
      key,
      name,
      importance,
      status: GAP_STATUS.MISSING,
      evidence: [],
      reason: `${role.title} asks for ${name}, and Nexora has not seen it anywhere in your profile or resumes.`,
      suggestedEvidence: suggestionsFor(name, GAP_STATUS.MISSING),
    };
  }

  const status = STATUS_FOR_STRENGTH[skill.strength] ?? GAP_STATUS.CLAIMED;

  return {
    key,
    name,
    importance,
    status,
    /** Your spelling, which may differ from the catalogue's. */
    yourSkill: skill.name,
    selfDeclaredLevel: skill.selfDeclaredLevel ?? null,
    evidence: skill.evidence ?? [],
    reason: reasonFor(skill, status, name),
    suggestedEvidence: suggestionsFor(name, status),
  };
}

/**
 * Why a skill has the status it has, in the student's terms.
 *
 * Built from the evidence rather than written per status, so the sentence
 * cannot drift from what actually justified it.
 */
function reasonFor(skill, status, name) {
  const first = skill.evidence?.[0]?.detail;

  if (status === GAP_STATUS.CLAIMED) {
    return `You have listed ${name}, but Nexora has not seen you use it. ${first ?? ''}`.trim();
  }

  if (status === GAP_STATUS.SUPPORTED) {
    return `You have pointed at concrete work involving ${name}. ${first ?? ''}`.trim();
  }

  return `${name} has been independently checked. ${first ?? ''}`.trim();
}

/**
 * What would move a skill up a level.
 *
 * Structured, not prose, so the roadmap can act on them rather than parse
 * them. Deliberately generic: a specific course or project brief would be
 * an invented external resource, and there is no verified dataset of those.
 *
 * Nothing is suggested for a verified skill — there is nothing left to prove.
 */
function suggestionsFor(name, status) {
  if (status === GAP_STATUS.VERIFIED) return [];

  const assessment = {
    type: 'assessment',
    action: `Pass a ${name} assessment`,
    wouldReach: GAP_STATUS.VERIFIED,
    available: false,
    note: 'Assessments are not available yet.',
  };

  if (status === GAP_STATUS.SUPPORTED) return [assessment];

  const project = {
    type: 'project',
    action:
      status === GAP_STATUS.MISSING
        ? `Learn ${name} and build something with it`
        : `Add a project that uses ${name}`,
    wouldReach: GAP_STATUS.SUPPORTED,
    available: true,
    note: 'Add it to your profile with the technologies listed.',
  };

  const certification = {
    type: 'certification',
    action: `Add a certification covering ${name}`,
    wouldReach: GAP_STATUS.SUPPORTED,
    available: true,
    note: 'A credential link makes it checkable.',
  };

  return [project, certification, assessment];
}

function byPriority(left, right) {
  const rank = (skill) =>
    PRIORITY.findIndex(
      (entry) => entry.importance === skill.importance && entry.status === skill.status,
    );

  // Verified skills fall outside PRIORITY and sort last, which is right:
  // there is nothing to do about them.
  const leftRank = rank(left);
  const rightRank = rank(right);

  const byRank = (leftRank === -1 ? 99 : leftRank) - (rightRank === -1 ? 99 : rightRank);
  if (byRank !== 0) return byRank;

  return left.name.localeCompare(right.name);
}

/**
 * Counts, with no derived score.
 *
 * Coverage percentages are deliberately absent. "You are 60% ready" invites
 * a student to read a single number and stop, and the whole value here is in
 * the breakdown — which of the 60% is claimed rather than shown. The career
 * match score already provides one honest headline figure, computed from
 * published weights; a second one here would compete with it.
 */
function summarise(skills) {
  const count = (importance, status) =>
    skills.filter((skill) => skill.importance === importance && skill.status === status).length;

  return {
    required: {
      total: skills.filter((skill) => skill.importance === GAP_IMPORTANCE.REQUIRED).length,
      missing: count(GAP_IMPORTANCE.REQUIRED, GAP_STATUS.MISSING),
      claimed: count(GAP_IMPORTANCE.REQUIRED, GAP_STATUS.CLAIMED),
      supported: count(GAP_IMPORTANCE.REQUIRED, GAP_STATUS.SUPPORTED),
      verified: count(GAP_IMPORTANCE.REQUIRED, GAP_STATUS.VERIFIED),
    },
    preferred: {
      total: skills.filter((skill) => skill.importance === GAP_IMPORTANCE.PREFERRED).length,
      missing: count(GAP_IMPORTANCE.PREFERRED, GAP_STATUS.MISSING),
      claimed: count(GAP_IMPORTANCE.PREFERRED, GAP_STATUS.CLAIMED),
      supported: count(GAP_IMPORTANCE.PREFERRED, GAP_STATUS.SUPPORTED),
      verified: count(GAP_IMPORTANCE.PREFERRED, GAP_STATUS.VERIFIED),
    },
  };
}

/** The student's skills that this role does not name. */
function extraSkills(twin, role) {
  const roleKeys = new Set(
    [...role.requiredSkills, ...role.preferredSkills].map((name) => skillKey(name)),
  );

  return (twin.skills ?? [])
    .filter((skill) => !roleKeys.has(skill.key))
    .map((skill) => ({ name: skill.name, strength: skill.strength }));
}
