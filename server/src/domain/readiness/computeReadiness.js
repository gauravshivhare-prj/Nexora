import {
  READINESS_CONTRACT_VERSION,
  READINESS_DATA_STATUS,
  READINESS_EVIDENCE_STATUS,
} from './readinessContract.js';
import { GAP_IMPORTANCE, GAP_STATUS } from '../skillGap/computeSkillGap.js';
import { skillKey } from '../skills/skillKey.js';

const NON_VERIFIED_STATUSES = new Set([
  GAP_STATUS.MISSING,
  GAP_STATUS.CLAIMED,
  GAP_STATUS.SUPPORTED,
]);

const STATUS_RANK = {
  [GAP_STATUS.VERIFIED]: 3,
  [GAP_STATUS.SUPPORTED]: 2,
  [GAP_STATUS.CLAIMED]: 1,
  [GAP_STATUS.MISSING]: 0,
};

/**
 * Projects an existing skill gap into an explainable readiness result.
 *
 * Pure by design: callers provide the already-derived gap and freshness
 * status. No database, clock, AI output, score, or percentage is involved.
 */
export function computeReadiness(gap, { dataStatus = READINESS_DATA_STATUS.FRESH, basedOn = {} } = {}) {
  if (!gap?.roleId || !Array.isArray(gap.skills)) {
    return {
      roleId: gap?.roleId ?? null,
      evidenceStatus: READINESS_EVIDENCE_STATUS.INSUFFICIENT_DATA,
      dataStatus: validDataStatus(dataStatus),
      required: emptyCounts(),
      preferred: emptyCounts(),
      blockingSkills: [],
      basedOn: provenance(basedOn),
    };
  }

  const validSkills = deduplicateSkills(gap.skills.filter((s) => s && typeof s === 'object'));
  const required = countsFor(gap.summary?.required, GAP_IMPORTANCE.REQUIRED, validSkills);
  const preferred = countsFor(gap.summary?.preferred, GAP_IMPORTANCE.PREFERRED, validSkills);
  const requiredSkills = validSkills.filter((skill) => skill.importance === GAP_IMPORTANCE.REQUIRED);

  return {
    roleId: gap.roleId,
    evidenceStatus: statusFor(requiredSkills),
    dataStatus: validDataStatus(dataStatus),
    required,
    preferred,
    blockingSkills: requiredSkills
      .filter((skill) => NON_VERIFIED_STATUSES.has(skill.status))
      .map((skill) => ({
        key: skill.key || (skill.name ? skillKey(skill.name) : ''),
        name: skill.name ?? skill.key ?? '',
        importance: skill.importance ?? GAP_IMPORTANCE.REQUIRED,
        status: skill.status,
        reason: explanationFor(skill),
        evidence: Array.isArray(skill.evidence) ? skill.evidence.filter(Boolean) : [],
      })),
    basedOn: provenance(basedOn),
  };
}

/**
 * Resolves contradictory duplicates in skills, preserving the entry with the highest evidence status.
 */
function deduplicateSkills(skills) {
  const map = new Map();
  for (const s of skills) {
    if (!s || typeof s !== 'object') continue;
    const key = s.key || (s.name ? skillKey(s.name) : '');
    if (!key) continue;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, s);
    } else {
      const existingRank = STATUS_RANK[existing.status] ?? -1;
      const newRank = STATUS_RANK[s.status] ?? -1;
      if (newRank > existingRank) {
        map.set(key, s);
      } else if (
        newRank === existingRank &&
        Array.isArray(s.evidence) &&
        (!Array.isArray(existing.evidence) || s.evidence.length > existing.evidence.length)
      ) {
        map.set(key, s);
      }
    }
  }
  return [...map.values()];
}

function explanationFor(skill) {
  if (typeof skill.reason === 'string' && skill.reason.trim().length > 0) {
    return skill.reason.trim();
  }
  const name = skill.name ?? skill.key ?? 'This skill';
  if (skill.status === GAP_STATUS.MISSING) {
    return `${name} is required for this role and has not been demonstrated.`;
  }
  if (skill.status === GAP_STATUS.CLAIMED) {
    return `${name} is claimed on your profile but has not been demonstrated with project work.`;
  }
  if (skill.status === GAP_STATUS.SUPPORTED) {
    return `${name} is supported by project work but has not been independently verified.`;
  }
  return `${name} evidence requires independent verification.`;
}

function statusFor(requiredSkills) {
  if (!requiredSkills || requiredSkills.length === 0) return READINESS_EVIDENCE_STATUS.INSUFFICIENT_DATA;
  if (
    requiredSkills.some(
      (skill) => skill.status === GAP_STATUS.MISSING || skill.status === GAP_STATUS.CLAIMED,
    )
  ) {
    return READINESS_EVIDENCE_STATUS.PARTIAL;
  }
  if (requiredSkills.every((skill) => skill.status === GAP_STATUS.VERIFIED)) {
    return READINESS_EVIDENCE_STATUS.VERIFIED;
  }
  return READINESS_EVIDENCE_STATUS.SUPPORTED;
}

function countsFor(summary, importance, skills) {
  const relevant = skills.filter((skill) => skill && skill.importance === importance);
  const derived = {
    total: relevant.length,
    missing: countStatus(relevant, GAP_STATUS.MISSING),
    claimed: countStatus(relevant, GAP_STATUS.CLAIMED),
    supported: countStatus(relevant, GAP_STATUS.SUPPORTED),
    verified: countStatus(relevant, GAP_STATUS.VERIFIED),
  };

  // If summary is provided and its sum matches total and matches relevant skills, use it.
  if (
    summary &&
    typeof summary.total === 'number' &&
    typeof summary.missing === 'number' &&
    typeof summary.claimed === 'number' &&
    typeof summary.supported === 'number' &&
    typeof summary.verified === 'number' &&
    summary.missing + summary.claimed + summary.supported + summary.verified === summary.total &&
    summary.total === relevant.length
  ) {
    return {
      total: summary.total,
      missing: summary.missing,
      claimed: summary.claimed,
      supported: summary.supported,
      verified: summary.verified,
    };
  }

  return derived;
}

function countStatus(skills, status) {
  return skills.filter((skill) => skill.status === status).length;
}

function emptyCounts() {
  return { total: 0, missing: 0, claimed: 0, supported: 0, verified: 0 };
}

function validDataStatus(dataStatus) {
  return Object.values(READINESS_DATA_STATUS).includes(dataStatus)
    ? dataStatus
    : READINESS_DATA_STATUS.INCOMPLETE;
}

function provenance(basedOn) {
  return {
    careerTwinGeneratedAt: basedOn?.careerTwinGeneratedAt ?? null,
    catalogueVersion: basedOn?.catalogueVersion ?? null,
    contractVersion: READINESS_CONTRACT_VERSION,
  };
}