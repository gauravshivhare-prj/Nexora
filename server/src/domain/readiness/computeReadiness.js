import {
  READINESS_CONTRACT_VERSION,
  READINESS_DATA_STATUS,
  READINESS_EVIDENCE_STATUS,
} from './readinessContract.js';
import { GAP_IMPORTANCE, GAP_STATUS } from '../skillGap/computeSkillGap.js';

const NON_VERIFIED_STATUSES = new Set([
  GAP_STATUS.MISSING,
  GAP_STATUS.CLAIMED,
  GAP_STATUS.SUPPORTED,
]);

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

  const required = countsFor(gap.summary?.required, GAP_IMPORTANCE.REQUIRED, gap.skills);
  const preferred = countsFor(gap.summary?.preferred, GAP_IMPORTANCE.PREFERRED, gap.skills);
  const requiredSkills = gap.skills.filter((skill) => skill.importance === GAP_IMPORTANCE.REQUIRED);

  return {
    roleId: gap.roleId,
    evidenceStatus: statusFor(requiredSkills),
    dataStatus: validDataStatus(dataStatus),
    required,
    preferred,
    blockingSkills: requiredSkills
      .filter((skill) => NON_VERIFIED_STATUSES.has(skill.status))
      .map((skill) => ({
        key: skill.key,
        name: skill.name,
        importance: skill.importance,
        status: skill.status,
        reason: skill.reason ?? '',
        evidence: skill.evidence ?? [],
      })),
    basedOn: provenance(basedOn),
  };
}

function statusFor(requiredSkills) {
  if (requiredSkills.length === 0) return READINESS_EVIDENCE_STATUS.INSUFFICIENT_DATA;
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
  const relevant = skills.filter((skill) => skill.importance === importance);
  return {
    total: summary?.total ?? relevant.length,
    missing: summary?.missing ?? countStatus(relevant, GAP_STATUS.MISSING),
    claimed: summary?.claimed ?? countStatus(relevant, GAP_STATUS.CLAIMED),
    supported: summary?.supported ?? countStatus(relevant, GAP_STATUS.SUPPORTED),
    verified: summary?.verified ?? countStatus(relevant, GAP_STATUS.VERIFIED),
  };
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
    careerTwinGeneratedAt: basedOn.careerTwinGeneratedAt ?? null,
    catalogueVersion: basedOn.catalogueVersion ?? null,
    contractVersion: READINESS_CONTRACT_VERSION,
  };
}