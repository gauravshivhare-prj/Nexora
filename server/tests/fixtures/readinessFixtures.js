import { GAP_IMPORTANCE, GAP_STATUS } from '../../src/domain/skillGap/computeSkillGap.js';
import { skillKey } from '../../src/domain/skills/skillKey.js';

function skill(name, importance, status, reason = undefined) {
  const key = skillKey(name);
  return {
    key,
    name,
    importance,
    status,
    reason: reason === undefined ? `${name} is currently ${status}.` : reason,
    evidence:
      status === GAP_STATUS.MISSING
        ? []
        : [
            {
              source: status === GAP_STATUS.CLAIMED ? 'self_declared' : status === GAP_STATUS.SUPPORTED ? 'project' : 'assessment',
              strength: status,
              detail: `${status} evidence for ${name}.`,
              reference: status === GAP_STATUS.SUPPORTED ? 'Portfolio Project' : null,
            },
          ],
  };
}

function buildGap(roleId, skills, customSummary = null) {
  const relevantReq = skills.filter((s) => s.importance === GAP_IMPORTANCE.REQUIRED);
  const relevantPref = skills.filter((s) => s.importance === GAP_IMPORTANCE.PREFERRED);

  const countStatus = (arr, st) => arr.filter((s) => s.status === st).length;

  const defaultSummary = {
    required: {
      total: relevantReq.length,
      missing: countStatus(relevantReq, GAP_STATUS.MISSING),
      claimed: countStatus(relevantReq, GAP_STATUS.CLAIMED),
      supported: countStatus(relevantReq, GAP_STATUS.SUPPORTED),
      verified: countStatus(relevantReq, GAP_STATUS.VERIFIED),
    },
    preferred: {
      total: relevantPref.length,
      missing: countStatus(relevantPref, GAP_STATUS.MISSING),
      claimed: countStatus(relevantPref, GAP_STATUS.CLAIMED),
      supported: countStatus(relevantPref, GAP_STATUS.SUPPORTED),
      verified: countStatus(relevantPref, GAP_STATUS.VERIFIED),
    },
  };

  return {
    roleId,
    skills,
    summary: customSummary ?? defaultSummary,
  };
}

export const READINESS_FIXTURES = {
  verifiedCandidate: buildGap('backend-developer', [
    skill('JavaScript', GAP_IMPORTANCE.REQUIRED, GAP_STATUS.VERIFIED),
    skill('Node.js', GAP_IMPORTANCE.REQUIRED, GAP_STATUS.VERIFIED),
    skill('SQL', GAP_IMPORTANCE.REQUIRED, GAP_STATUS.VERIFIED),
    skill('REST APIs', GAP_IMPORTANCE.REQUIRED, GAP_STATUS.VERIFIED),
    skill('Docker', GAP_IMPORTANCE.PREFERRED, GAP_STATUS.SUPPORTED),
    skill('Redis', GAP_IMPORTANCE.PREFERRED, GAP_STATUS.MISSING),
  ]),

  supportedCandidate: buildGap('backend-developer', [
    skill('JavaScript', GAP_IMPORTANCE.REQUIRED, GAP_STATUS.VERIFIED),
    skill('Node.js', GAP_IMPORTANCE.REQUIRED, GAP_STATUS.SUPPORTED),
    skill('SQL', GAP_IMPORTANCE.REQUIRED, GAP_STATUS.SUPPORTED),
    skill('REST APIs', GAP_IMPORTANCE.REQUIRED, GAP_STATUS.VERIFIED),
    skill('Docker', GAP_IMPORTANCE.PREFERRED, GAP_STATUS.SUPPORTED),
  ]),

  partialCandidate: buildGap('backend-developer', [
    skill('JavaScript', GAP_IMPORTANCE.REQUIRED, GAP_STATUS.VERIFIED),
    skill('Node.js', GAP_IMPORTANCE.REQUIRED, GAP_STATUS.SUPPORTED),
    skill('SQL', GAP_IMPORTANCE.REQUIRED, GAP_STATUS.CLAIMED),
    skill('REST APIs', GAP_IMPORTANCE.REQUIRED, GAP_STATUS.MISSING),
    skill('Docker', GAP_IMPORTANCE.PREFERRED, GAP_STATUS.SUPPORTED),
    skill('Git', GAP_IMPORTANCE.PREFERRED, GAP_STATUS.MISSING),
  ]),

  preferredOnlyGaps: buildGap('backend-developer', [
    skill('JavaScript', GAP_IMPORTANCE.REQUIRED, GAP_STATUS.VERIFIED),
    skill('Node.js', GAP_IMPORTANCE.REQUIRED, GAP_STATUS.VERIFIED),
    skill('SQL', GAP_IMPORTANCE.REQUIRED, GAP_STATUS.VERIFIED),
    skill('REST APIs', GAP_IMPORTANCE.REQUIRED, GAP_STATUS.VERIFIED),
    skill('Docker', GAP_IMPORTANCE.PREFERRED, GAP_STATUS.MISSING),
    skill('Git', GAP_IMPORTANCE.PREFERRED, GAP_STATUS.MISSING),
    skill('Redis', GAP_IMPORTANCE.PREFERRED, GAP_STATUS.MISSING),
  ]),

  contradictorySummary: buildGap(
    'backend-developer',
    [
      skill('JavaScript', GAP_IMPORTANCE.REQUIRED, GAP_STATUS.CLAIMED),
      skill('Node.js', GAP_IMPORTANCE.REQUIRED, GAP_STATUS.MISSING),
    ],
    {
      // Contradictory: claims all are verified and total is 10
      required: { total: 10, missing: 0, claimed: 0, supported: 0, verified: 10 },
      preferred: { total: 0, missing: 0, claimed: 0, supported: 0, verified: 0 },
    },
  ),

  duplicateConflictingSkills: buildGap('backend-developer', [
    skill('SQL', GAP_IMPORTANCE.REQUIRED, GAP_STATUS.MISSING),
    skill('SQL', GAP_IMPORTANCE.REQUIRED, GAP_STATUS.VERIFIED),
    skill('Node.js', GAP_IMPORTANCE.REQUIRED, GAP_STATUS.CLAIMED),
    skill('Node.js', GAP_IMPORTANCE.REQUIRED, GAP_STATUS.SUPPORTED),
    skill('JavaScript', GAP_IMPORTANCE.REQUIRED, GAP_STATUS.VERIFIED),
    skill('REST APIs', GAP_IMPORTANCE.REQUIRED, GAP_STATUS.VERIFIED),
  ]),

  missingReasonExplanations: buildGap('backend-developer', [
    skill('JavaScript', GAP_IMPORTANCE.REQUIRED, GAP_STATUS.MISSING, ''),
    skill('Node.js', GAP_IMPORTANCE.REQUIRED, GAP_STATUS.CLAIMED, '   '),
    skill('SQL', GAP_IMPORTANCE.REQUIRED, GAP_STATUS.SUPPORTED, null),
    skill('REST APIs', GAP_IMPORTANCE.REQUIRED, GAP_STATUS.VERIFIED, undefined),
  ]),
};
