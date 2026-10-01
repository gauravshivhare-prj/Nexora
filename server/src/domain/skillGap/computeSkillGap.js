import { EVIDENCE_STRENGTH } from '../evidence/evidence.js';
import { skillDisplayName, skillKey } from '../skills/skillKey.js';
import { resolveCanonicalSkill } from '../skills/skillOntology.js';
import { satisfiesPrerequisite } from '../careers/recommendationValidator.js';

/**
 * Task 11 — Complete Skill-Gap Intelligence Engine
 *
 * Comparing what a student can show against what a role asks for.
 *
 * Core Tenets:
 * 1. Grounded Canonical Truth: Matches skills using canonical ontology resolution,
 *    aliases, and IDs. Never reports MISSING if CareerTwin holds valid evidence.
 * 2. Anti-Inference Defense: Skills are NEVER marked as satisfied solely because an
 *    AI model guessed or inferred them. Only grounded evidence counts.
 * 3. Partial Satisfaction & Proficiency Gaps: Detects when a student holds a skill
 *    but at a proficiency level below role expectations (e.g. beginner vs intermediate).
 * 4. Prerequisite Deficit Gaps: Identifies missing foundational dependencies in the ontology DAG.
 * 5. Evidence Staleness & Conflict Detection: Flags evidence older than 24 months or
 *    conflicts between self-claimed levels and lower verification results.
 * 6. Actionable Remediation: Explains exactly why the gap exists and what concrete
 *    evidence would close it.
 */

/**
 * What Nexora is prepared to say about a skill.
 */
export const GAP_STATUS = Object.freeze({
  /** No evidence of any kind. */
  MISSING: 'missing',
  /** The student says they have it and nothing else does. */
  CLAIMED: 'claimed',
  /** They pointed at a project or certification that involves it. */
  SUPPORTED: 'supported',
  /** An independent check passed via skill assessment or human interview. */
  VERIFIED: 'verified',
});

/**
 * Higher-level satisfaction state combining evidence and proficiency.
 */
export const SATISFACTION_STATE = Object.freeze({
  MISSING: 'missing',
  PARTIALLY_SATISFIED: 'partially_satisfied',
  SATISFIED: 'satisfied',
});

/** How important the skill is to the role. */
export const GAP_IMPORTANCE = Object.freeze({
  REQUIRED: 'required',
  PREFERRED: 'preferred',
});

/** Evidence strength maps straight onto gap status. */
const STATUS_FOR_STRENGTH = {
  [EVIDENCE_STRENGTH.CLAIMED]: GAP_STATUS.CLAIMED,
  [EVIDENCE_STRENGTH.SUPPORTED]: GAP_STATUS.SUPPORTED,
  [EVIDENCE_STRENGTH.VERIFIED]: GAP_STATUS.VERIFIED,
};

/** Numerical level scale for proficiency gap comparison. */
const PROFICIENCY_RANK = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
  expert: 4,
};

/** Priority order for what to work on next. */
const PRIORITY = [
  { importance: GAP_IMPORTANCE.REQUIRED, status: GAP_STATUS.MISSING },
  { importance: GAP_IMPORTANCE.REQUIRED, status: GAP_STATUS.CLAIMED },
  { importance: GAP_IMPORTANCE.PREFERRED, status: GAP_STATUS.MISSING },
  { importance: GAP_IMPORTANCE.REQUIRED, status: GAP_STATUS.SUPPORTED },
  { importance: GAP_IMPORTANCE.PREFERRED, status: GAP_STATUS.CLAIMED },
  { importance: GAP_IMPORTANCE.PREFERRED, status: GAP_STATUS.SUPPORTED },
];

const PRIORITY_RANK = new Map(
  PRIORITY.map((entry, index) => [`${entry.importance}:${entry.status}`, index]),
);

/** Strength rank credit to resolve duplicates and prioritize evidence. */
const STRENGTH_CREDIT = {
  [EVIDENCE_STRENGTH.CLAIMED]: 1,
  [EVIDENCE_STRENGTH.SUPPORTED]: 2,
  [EVIDENCE_STRENGTH.VERIFIED]: 3,
};

/** Maximum age for evidence before flagging as stale (730 days = ~24 months). */
const STALE_EVIDENCE_AGE_DAYS = 730;

/**
 * Compares a CareerTwin against one role.
 *
 * @param {object} twin CareerTwin content — needs `skills`.
 * @param {import('../careers/roleCatalogue.js').CareerRole} role
 * @returns {object} Every skill the role names, with its status, gap analysis, and what would change it.
 */
export function computeSkillGap(twin, role) {
  const safeTwin = twin && typeof twin === 'object' ? twin : {};
  const held = indexSkills(safeTwin.skills ?? []);

  const requiredSkills = Array.isArray(role?.requiredSkills) ? role.requiredSkills : [];
  const preferredSkills = Array.isArray(role?.preferredSkills) ? role.preferredSkills : [];

  const seenRoleKeys = new Set();
  const assessedSkills = [];

  for (const name of requiredSkills) {
    if (!name || typeof name !== 'string') continue;
    const key = skillKey(name);
    if (!key || seenRoleKeys.has(key)) continue;
    seenRoleKeys.add(key);
    assessedSkills.push(assess(name, GAP_IMPORTANCE.REQUIRED, held, role));
  }

  for (const name of preferredSkills) {
    if (!name || typeof name !== 'string') continue;
    const key = skillKey(name);
    if (!key || seenRoleKeys.has(key)) continue;
    seenRoleKeys.add(key);
    assessedSkills.push(assess(name, GAP_IMPORTANCE.PREFERRED, held, role));
  }

  assessedSkills.sort(byPriority);

  return {
    roleId: role?.id ?? null,
    roleTitle: role?.title ?? '',
    canonicalRoleId: role?.canonicalId ?? (role?.id ? `role_${role.id.replace(/-/g, '_')}` : null),
    skills: assessedSkills,
    summary: summarise(assessedSkills),
    /**
     * Skills the student has that the role does not ask for.
     */
    additionalSkills: extraSkills(safeTwin, role),
  };
}

/**
 * Indexes the student's skills with canonical ontology resolution and anti-inference filtering.
 */
function indexSkills(skills) {
  const map = new Map();

  for (const skill of skills ?? []) {
    if (!skill || typeof skill !== 'object') continue;

    // Anti-Inference Guard: If a skill entry is solely an unconfirmed AI inference with 0 user/system evidence, reject it
    if (skill.provenance === 'ai_inference' && (!skill.evidence || skill.evidence.length === 0)) {
      continue;
    }

    const key = skill.key || (skill.name ? skillKey(skill.name) : '');
    if (!key) continue;

    const resolved = resolveCanonicalSkill(skill.key || skill.name);
    const canonicalId = resolved?.id || skill.skillId || null;

    const record = {
      ...skill,
      key,
      canonicalId,
      name: skill.name || (resolved?.name ?? key),
    };

    const storeUnder = (lookupKey) => {
      if (!lookupKey) return;
      const existing = map.get(lookupKey);
      if (!existing) {
        map.set(lookupKey, record);
      } else {
        const existingCredit = STRENGTH_CREDIT[existing.strength] ?? 0;
        const newCredit = STRENGTH_CREDIT[record.strength] ?? 0;
        if (newCredit > existingCredit) {
          map.set(lookupKey, record);
        } else if (
          newCredit === existingCredit &&
          Array.isArray(record.evidence) &&
          (!Array.isArray(existing.evidence) || record.evidence.length > existing.evidence.length)
        ) {
          map.set(lookupKey, record);
        }
      }
    };

    storeUnder(key);
    if (skill.skillId) storeUnder(skill.skillId);
    if (skill.canonicalSkillId) storeUnder(skill.canonicalSkillId);
  }

  return map;
}

/**
 * Assesses where one of the role's skills stands for this student.
 */
function assess(requiredName, importance, held, role) {
  const key = skillKey(requiredName);
  const name = skillDisplayName(requiredName);
  const resolvedCanonical = resolveCanonicalSkill(requiredName);
  const canonicalId = resolvedCanonical?.id || null;

  // Lookup in student's held skills by key or canonical ID
  const skill = held.get(key) || (canonicalId ? held.get(canonicalId) : null);

  // 1. Missing skill handling
  if (!skill) {
    const missingPrereqs = checkPrerequisites(resolvedCanonical, held);
    const suggested = suggestionsFor(name, GAP_STATUS.MISSING);

    return {
      key,
      canonicalId,
      name,
      importance,
      status: GAP_STATUS.MISSING,
      satisfactionState: SATISFACTION_STATE.MISSING,
      yourSkill: null,
      selfDeclaredLevel: null,
      expectedLevel: getExpectedLevel(role, key, canonicalId),
      proficiencyGap: {
        hasDeficit: true,
        expected: getExpectedLevel(role, key, canonicalId),
        actual: null,
        reason: 'Skill is completely missing from student evidence.',
      },
      prerequisiteGaps: missingPrereqs,
      hasPrerequisiteBlocker: missingPrereqs.length > 0,
      isStale: false,
      conflictingEvidence: { hasConflict: false, detail: null },
      evidence: [],
      reason: `${role?.title ?? 'This role'} asks for ${name}, and Nexora has not seen it anywhere in your profile or resumes.`,
      actionableRemediation: buildRemediation(name, GAP_STATUS.MISSING, missingPrereqs),
      suggestedEvidence: suggested,
    };
  }

  // 2. Skill is present in student state
  const status = STATUS_FOR_STRENGTH[skill.strength] ?? GAP_STATUS.CLAIMED;
  const expectedLevel = getExpectedLevel(role, key, canonicalId);
  const actualLevel = skill.selfDeclaredLevel || (skill.strength === 'verified' ? 'advanced' : 'beginner');

  // Proficiency deficit evaluation
  const proficiencyDeficit = evaluateProficiencyDeficit(actualLevel, expectedLevel);

  // Prerequisite evaluation
  const missingPrereqs = checkPrerequisites(resolvedCanonical, held);

  // Staleness check
  const staleness = checkStaleness(skill.evidence);

  // Conflicting evidence check
  const conflict = checkEvidenceConflict(skill);

  // Determine satisfaction state
  let satisfactionState = SATISFACTION_STATE.SATISFIED;
  if (status === GAP_STATUS.CLAIMED || proficiencyDeficit.hasDeficit || missingPrereqs.length > 0) {
    satisfactionState = SATISFACTION_STATE.PARTIALLY_SATISFIED;
  }

  const suggested = suggestionsFor(name, status);

  return {
    key,
    canonicalId,
    name,
    importance,
    status,
    satisfactionState,
    yourSkill: skill.name ?? name,
    selfDeclaredLevel: skill.selfDeclaredLevel ?? null,
    expectedLevel,
    proficiencyGap: proficiencyDeficit,
    prerequisiteGaps: missingPrereqs,
    hasPrerequisiteBlocker: missingPrereqs.length > 0,
    isStale: staleness.isStale,
    staleReason: staleness.reason,
    conflictingEvidence: conflict,
    evidence: Array.isArray(skill.evidence) ? skill.evidence.filter(Boolean) : [],
    reason: reasonFor(skill, status, name, proficiencyDeficit, staleness),
    actionableRemediation: buildRemediation(name, status, missingPrereqs, proficiencyDeficit, staleness),
    suggestedEvidence: suggested,
  };
}

/**
 * Checks if target canonical skill has unfulfilled prerequisites in the ontology DAG.
 */
function checkPrerequisites(canonicalSkillRecord, heldSkills) {
  if (!canonicalSkillRecord || !Array.isArray(canonicalSkillRecord.prerequisites)) {
    return [];
  }

  const missing = [];
  for (const prereqId of canonicalSkillRecord.prerequisites) {
    if (!satisfiesPrerequisite(prereqId, heldSkills)) {
      missing.push({
        prerequisiteId: prereqId,
        name: skillDisplayName(prereqId),
        status: GAP_STATUS.MISSING,
        reason: `Foundational prerequisite ${skillDisplayName(prereqId)} is required before mastering ${canonicalSkillRecord.name}.`,
      });
    }
  }

  return missing;
}

/**
 * Looks up role proficiency expectations for a skill.
 */
function getExpectedLevel(role, key, canonicalId) {
  const expectations = role?.proficiencyExpectations;
  if (!expectations || typeof expectations !== 'object') return null;

  const skillsMap = expectations.skills && typeof expectations.skills === 'object'
    ? expectations.skills
    : expectations;

  return (
    skillsMap[canonicalId] ||
    skillsMap[key] ||
    skillsMap[`sk_${key}`] ||
    skillsMap[key?.replace(/^sk_/, '')] ||
    expectations.overallMinimum ||
    null
  );
}

/**
 * Compares actual student proficiency level against role expected level.
 */
function evaluateProficiencyDeficit(actualLevel, expectedLevel) {
  if (!expectedLevel) {
    return { hasDeficit: false, expected: null, actual: actualLevel, reason: null };
  }

  const actualRank = PROFICIENCY_RANK[actualLevel?.toLowerCase()] ?? 1;
  const expectedRank = PROFICIENCY_RANK[expectedLevel?.toLowerCase()] ?? 2;

  if (actualRank < expectedRank) {
    return {
      hasDeficit: true,
      expected: expectedLevel,
      actual: actualLevel || 'unspecified',
      reason: `Role expects ${expectedLevel} proficiency, but current demonstrated level is ${actualLevel || 'beginner'}.`,
    };
  }

  return { hasDeficit: false, expected: expectedLevel, actual: actualLevel, reason: null };
}

/**
 * Checks whether evidence is older than 24 months without recent updates.
 */
function checkStaleness(evidenceList) {
  if (!Array.isArray(evidenceList) || evidenceList.length === 0) {
    return { isStale: false, reason: null };
  }

  const now = Date.now();
  let allStale = true;

  for (const item of evidenceList) {
    if (!item) continue;
    const rawDate = item?.completedAt || item?.date || item?.timestamp;
    if (rawDate) {
      const itemTime = new Date(rawDate).getTime();
      if (!isNaN(itemTime)) {
        const ageDays = (now - itemTime) / (1000 * 60 * 60 * 24);
        if (ageDays <= STALE_EVIDENCE_AGE_DAYS) {
          allStale = false;
          break;
        }
      } else {
        allStale = false;
      }
    } else {
      // Evidence without date is assumed active
      allStale = false;
    }
  }

  if (allStale && evidenceList.some((e) => e && (e.completedAt || e.date))) {
    return {
      isStale: true,
      reason: 'Evidence is older than 24 months without recent updates or refreshed assessment.',
    };
  }

  return { isStale: false, reason: null };
}

/**
 * Checks for discrepancies across evidence items (e.g. claimed expert vs failed assessment).
 */
function checkEvidenceConflict(skill) {
  const declared = skill.selfDeclaredLevel?.toLowerCase();
  const evidenceList = Array.isArray(skill.evidence) ? skill.evidence : [];

  for (const item of evidenceList) {
    if (item && item.source === 'assessment' && item.score !== undefined && item.score < 50) {
      if (declared === 'expert' || declared === 'advanced') {
        return {
          hasConflict: true,
          detail: `Assessment score (${item.score}%) contradicts self-declared ${declared} level.`,
        };
      }
    }
  }

  return { hasConflict: false, detail: null };
}

/**
 * Formulates the reason why a skill holds its current status.
 */
function reasonFor(skill, status, name, proficiencyDeficit, staleness) {
  const first = skill.evidence?.[0]?.detail;

  if (status === GAP_STATUS.CLAIMED) {
    return `You have listed ${name}, but Nexora has not seen you use it. ${first ?? ''}`.trim();
  }

  if (status === GAP_STATUS.SUPPORTED) {
    let base = `You have pointed at concrete work involving ${name}. ${first ?? ''}`.trim();
    if (proficiencyDeficit?.hasDeficit) {
      base += ` However, ${proficiencyDeficit.reason}`;
    }
    if (staleness?.isStale) {
      base += ` Warning: ${staleness.reason}`;
    }
    return base;
  }

  let base = `${name} has been independently checked. ${first ?? ''}`.trim();
  if (staleness?.isStale) {
    base += ` Warning: ${staleness.reason}`;
  }
  return base;
}

/**
 * Produces structured, actionable remediation guidance for closing the skill gap.
 */
function buildRemediation(name, status, missingPrereqs = [], proficiencyDeficit = null, staleness = null) {
  if (missingPrereqs.length > 0) {
    const prereqNames = missingPrereqs.map((p) => p.name).join(', ');
    return `Fulfill foundational prerequisite(s) first: ${prereqNames}.`;
  }

  if (status === GAP_STATUS.MISSING) {
    return `Build a project or complete a structured course in ${name} to establish applied competence.`;
  }

  if (status === GAP_STATUS.CLAIMED) {
    return `Back your claim with a portfolio project or certification demonstrating real use of ${name}.`;
  }

  if (staleness?.isStale) {
    return `Refresh your evidence by taking a modern assessment or building a current project with ${name}.`;
  }

  if (proficiencyDeficit?.hasDeficit) {
    return `Deepen practical implementation to advance from ${proficiencyDeficit.actual} to ${proficiencyDeficit.expected} level.`;
  }

  if (status === GAP_STATUS.SUPPORTED) {
    return `Take an independent assessment or technical interview in ${name} to achieve verified status.`;
  }

  return 'Skill requirement fully satisfied.';
}

/**
 * Concrete suggestions to move a skill up an evidence level.
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
  const leftRank = PRIORITY_RANK.get(`${left.importance}:${left.status}`) ?? -1;
  const rightRank = PRIORITY_RANK.get(`${right.importance}:${right.status}`) ?? -1;

  const byRank = (leftRank === -1 ? 99 : leftRank) - (rightRank === -1 ? 99 : rightRank);
  if (byRank !== 0) return byRank;

  return (
    left.name.localeCompare(right.name, 'en') ||
    (left.key ?? '').localeCompare(right.key ?? '', 'en')
  );
}

/**
 * Counts and summary metrics across all assessed skills.
 */
function summarise(skills) {
  const count = (importance, status) =>
    skills.filter((skill) => skill.importance === importance && skill.status === status).length;

  const countPartial = (importance) =>
    skills.filter(
      (skill) =>
        skill.importance === importance &&
        skill.satisfactionState === SATISFACTION_STATE.PARTIALLY_SATISFIED,
    ).length;

  const countPrereqBlockers = (importance) =>
    skills.filter((skill) => skill.importance === importance && skill.hasPrerequisiteBlocker).length;

  const totalPrereqBlockers = skills.filter((s) => s.hasPrerequisiteBlocker).length;
  const totalStale = skills.filter((s) => s.isStale).length;

  return {
    required: {
      total: skills.filter((skill) => skill.importance === GAP_IMPORTANCE.REQUIRED).length,
      missing: count(GAP_IMPORTANCE.REQUIRED, GAP_STATUS.MISSING),
      claimed: count(GAP_IMPORTANCE.REQUIRED, GAP_STATUS.CLAIMED),
      supported: count(GAP_IMPORTANCE.REQUIRED, GAP_STATUS.SUPPORTED),
      verified: count(GAP_IMPORTANCE.REQUIRED, GAP_STATUS.VERIFIED),
      partiallySatisfied: countPartial(GAP_IMPORTANCE.REQUIRED),
      prerequisiteBlockers: countPrereqBlockers(GAP_IMPORTANCE.REQUIRED),
    },
    preferred: {
      total: skills.filter((skill) => skill.importance === GAP_IMPORTANCE.PREFERRED).length,
      missing: count(GAP_IMPORTANCE.PREFERRED, GAP_STATUS.MISSING),
      claimed: count(GAP_IMPORTANCE.PREFERRED, GAP_STATUS.CLAIMED),
      supported: count(GAP_IMPORTANCE.PREFERRED, GAP_STATUS.SUPPORTED),
      verified: count(GAP_IMPORTANCE.PREFERRED, GAP_STATUS.VERIFIED),
      partiallySatisfied: countPartial(GAP_IMPORTANCE.PREFERRED),
      prerequisiteBlockers: countPrereqBlockers(GAP_IMPORTANCE.PREFERRED),
    },
    totalSkillsAssessed: skills.length,
    prerequisiteBlockersCount: totalPrereqBlockers,
    staleEvidenceCount: totalStale,
  };
}

/**
 * The student's skills that this role does not name, deduplicated with highest strength preserved.
 */
function extraSkills(twin, role) {
  const roleKeys = new Set(
    [...(role?.requiredSkills ?? []), ...(role?.preferredSkills ?? [])].map((name) => skillKey(name)),
  );

  const seen = new Map();
  for (const skill of twin?.skills ?? []) {
    if (!skill || typeof skill !== 'object') continue;
    const key = skill.key || (skill.name ? skillKey(skill.name) : '');
    if (!key || roleKeys.has(key)) continue;

    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, { name: skill.name ?? key, strength: skill.strength });
    } else {
      const existingCredit = STRENGTH_CREDIT[existing.strength] ?? 0;
      const newCredit = STRENGTH_CREDIT[skill.strength] ?? 0;
      if (newCredit > existingCredit) {
        seen.set(key, { name: skill.name ?? key, strength: skill.strength });
      }
    }
  }

  return [...seen.values()].sort((left, right) =>
    (left.name ?? '').localeCompare(right.name ?? '', 'en'),
  );
}
