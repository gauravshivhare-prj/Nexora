import { skillKey } from '../skills/skillKey.js';

/**
 * Task 30 — Cross-Feature Intelligence Consistency & Reconciliation Engine
 *
 * Validates cross-feature invariants between:
 *  1. CanonicalStudentState (ledger of truth)
 *  2. CareerTwin (derived student representation)
 *  3. SkillGap (role requirements comparison)
 *  4. Readiness (evaluation blockers)
 *  5. Institutional SkillEvidenceChecks (authoritative verifications)
 *  6. Career Recommendations (matched role rankings)
 *
 * Pure and deterministic by design. No DB, clock, or AI models.
 */

export const VIOLATION_CODES = Object.freeze({
  TWIN_GAP_SKILL_MISMATCH: 'TWIN_GAP_SKILL_MISMATCH',
  UNVERIFIED_EVIDENCE_IN_TWIN: 'UNVERIFIED_EVIDENCE_IN_TWIN',
  INVALIDATED_EVIDENCE_IN_TWIN: 'INVALIDATED_EVIDENCE_IN_TWIN',
  READINESS_GAP_BLOCKER_MISMATCH: 'READINESS_GAP_BLOCKER_MISMATCH',
  RECOMMENDATION_SCORE_INCONSISTENCY: 'RECOMMENDATION_SCORE_INCONSISTENCY',
  STALE_CAREER_TWIN: 'STALE_CAREER_TWIN',
  CANONICAL_TWIN_DIVERGENCE: 'CANONICAL_TWIN_DIVERGENCE',
  CONTRADICTORY_EVIDENCE: 'CONTRADICTORY_EVIDENCE',
  MISSING_CAREER_TWIN: 'MISSING_CAREER_TWIN',
});

export const RECONCILIATION_ACTIONS = Object.freeze({
  REBUILD_TWIN: 'REBUILD_TWIN',
  REFRESH_GAP: 'REFRESH_GAP',
  RECOMPUTE_READINESS: 'RECOMPUTE_READINESS',
  REFRESH_RECOMMENDATIONS: 'REFRESH_RECOMMENDATIONS',
});

/**
 * Inspects all cross-feature artifacts for contradictions and invariants.
 *
 * @param {object} inputs
 * @param {object} [inputs.canonicalStudent] Assembled canonical student state.
 * @param {object} [inputs.twin] Stored or derived CareerTwin.
 * @param {object} [inputs.gap] Single skill gap analysis.
 * @param {Array<object>} [inputs.gaps] Multiple skill gap analyses.
 * @param {object} [inputs.readiness] Single readiness result.
 * @param {Array<object>} [inputs.readinessList] Multiple readiness results.
 * @param {Array<object>|object} [inputs.recommendations] Recommendations matches array or object.
 * @param {Array<object>} [inputs.evidenceChecks] Authoritative institutional evidence checks.
 * @returns {object} Consistency report with violations and reconciliation actions.
 */
export function checkConsistency({
  canonicalStudent = null,
  twin = null,
  gap = null,
  gaps = [],
  readiness = null,
  readinessList = [],
  recommendations = null,
  evidenceChecks = [],
} = {}) {
  const violations = [];
  const allGaps = [
    ...(gap && typeof gap === 'object' ? [gap] : []),
    ...(Array.isArray(gaps) ? gaps.filter(Boolean) : []),
  ];
  const allReadiness = [
    ...(readiness && typeof readiness === 'object' ? [readiness] : []),
    ...(Array.isArray(readinessList) ? readinessList.filter(Boolean) : []),
  ];
  const checks = Array.isArray(evidenceChecks) ? evidenceChecks.filter(Boolean) : [];

  // 1. Missing CareerTwin check when student has inputs
  if (!twin && (canonicalStudent?.skills?.length || checks.length > 0)) {
    violations.push({
      code: VIOLATION_CODES.MISSING_CAREER_TWIN,
      severity: 'warning',
      entity: 'CareerTwin',
      expected: 'Active CareerTwin derived from available profile/evidence',
      actual: 'null',
      message: 'Student has profile skills or verified evidence, but no CareerTwin has been generated.',
    });
  }

  // 2. Canonical Student to CareerTwin Consistency
  if (canonicalStudent && twin) {
    checkCanonicalTwinConsistency(canonicalStudent, twin, violations);
  }

  // 3. Institutional Evidence Check to CareerTwin Verification
  if (twin) {
    checkEvidenceTwinConsistency(twin, checks, violations);
  }

  // 4. CareerTwin to SkillGap Consistency
  if (twin && allGaps.length > 0) {
    checkTwinGapConsistency(twin, allGaps, violations);
  }

  // 5. Readiness to SkillGap Blocker Consistency
  if (allReadiness.length > 0 && allGaps.length > 0) {
    checkReadinessGapConsistency(allReadiness, allGaps, violations);
  }

  // 6. Recommendation Plausibility & Monotonicity
  if (twin && recommendations) {
    checkRecommendationConsistency(twin, recommendations, violations);
  }

  // 7. Staleness checks
  if (twin) {
    checkTwinStaleness(twin, { canonicalStudent, evidenceChecks: checks }, violations);
  }

  // Determine reconciliation actions
  const reconciliationActions = determineReconciliationActions(violations);

  const errorCount = violations.filter((v) => v.severity === 'error').length;
  const isConsistent = errorCount === 0;

  let status = 'consistent';
  if (errorCount > 0) {
    status = 'inconsistent';
  } else if (violations.some((v) => v.code === VIOLATION_CODES.STALE_CAREER_TWIN)) {
    status = 'stale';
  }

  return {
    isConsistent,
    status,
    violationCount: violations.length,
    violations,
    reconciliationActions,
    evaluatedAt: new Date().toISOString(),
  };
}

/**
 * Validates that skills marked as verified in CareerTwin are backed by passing institutional checks.
 */
function checkEvidenceTwinConsistency(twin, evidenceChecks, violations) {
  const twinSkills = Array.isArray(twin.skills) ? twin.skills : [];

  for (const skill of twinSkills) {
    if (!skill || typeof skill !== 'object') continue;
    const isVerifiedInTwin =
      skill.strength === 'verified' ||
      (Array.isArray(skill.evidence) && skill.evidence.some((e) => e && (e.verified === true || e.strength === 'verified')));

    if (!isVerifiedInTwin) continue;

    const sKey = skillKey(skill.key || skill.name || '');
    const matchingChecks = evidenceChecks.filter((check) => {
      if (!check || typeof check !== 'object') return false;
      const cKey = skillKey(check.skillKey || check.skillName || check.skill || '');
      const cCanonical = check.canonicalSkillId;
      return (cKey && cKey === sKey) || (cCanonical && skill.skillId && cCanonical === skill.skillId);
    });

    if (matchingChecks.length === 0) {
      violations.push({
        code: VIOLATION_CODES.UNVERIFIED_EVIDENCE_IN_TWIN,
        severity: 'error',
        entity: `CareerTwin:skill:${skill.key || skill.name}`,
        expected: 'Institutional SkillEvidenceCheck with eligibleForVerified=true and outcome=pass',
        actual: 'No evidence check record found',
        message: `CareerTwin reports skill "${skill.name || skill.key}" as verified, but no matching institutional evidence check exists.`,
      });
      continue;
    }

    const hasInvalidated = matchingChecks.some((c) => c.status === 'invalidated' || c.status === 'disputed');
    const hasPassing = matchingChecks.some((c) => {
      const outcome = (c.outcome || '').toLowerCase();
      const eligible = c.eligibleForVerified === true;
      const active = !c.status || c.status === 'active';
      return eligible && outcome === 'pass' && active;
    });

    if (hasInvalidated && !hasPassing) {
      violations.push({
        code: VIOLATION_CODES.INVALIDATED_EVIDENCE_IN_TWIN,
        severity: 'error',
        entity: `CareerTwin:skill:${skill.key || skill.name}`,
        expected: 'Active passing evidence check',
        actual: 'Invalidated or disputed evidence check',
        message: `CareerTwin retains verified status for "${skill.name || skill.key}", but matching institutional check is invalidated or disputed.`,
      });
    } else if (!hasPassing) {
      violations.push({
        code: VIOLATION_CODES.UNVERIFIED_EVIDENCE_IN_TWIN,
        severity: 'error',
        entity: `CareerTwin:skill:${skill.key || skill.name}`,
        expected: 'Passing outcome with eligibleForVerified=true',
        actual: 'No passing eligible check found',
        message: `CareerTwin reports verified strength for "${skill.name || skill.key}", but none of the ${matchingChecks.length} matching checks passed with eligible verification.`,
      });
    }
  }
}

/**
 * Validates that skills in CareerTwin match skill gap statuses without contradictions.
 */
function checkTwinGapConsistency(twin, gaps, violations) {
  const twinSkillMap = new Map();
  for (const s of twin.skills || []) {
    if (!s || typeof s !== 'object') continue;
    const key = skillKey(s.key || s.name || '');
    if (key) twinSkillMap.set(key, s);
    if (s.skillId) twinSkillMap.set(s.skillId, s);
  }

  for (const gap of gaps) {
    if (!gap || !Array.isArray(gap.skills)) continue;
    const roleId = gap.roleId || 'unknown_role';
    const roleTitle = gap.roleTitle || roleId;

    for (const gapSkill of gap.skills) {
      if (!gapSkill || typeof gapSkill !== 'object') continue;
      const gKey = skillKey(gapSkill.key || gapSkill.name || '');
      const twinSkill = twinSkillMap.get(gKey) || (gapSkill.canonicalId ? twinSkillMap.get(gapSkill.canonicalId) : null);

      if (twinSkill) {
        // If CareerTwin has verified skill, gap cannot report it missing or claimed
        if (twinSkill.strength === 'verified' && gapSkill.status !== 'verified') {
          violations.push({
            code: VIOLATION_CODES.TWIN_GAP_SKILL_MISMATCH,
            severity: 'error',
            entity: `SkillGap:${roleId}:${gapSkill.key || gapSkill.name}`,
            expected: 'verified',
            actual: gapSkill.status,
            message: `Skill "${gapSkill.name || gapSkill.key}" is verified in CareerTwin, but reported as "${gapSkill.status}" in gap analysis for "${roleTitle}".`,
          });
        }
        // If CareerTwin has supported skill, gap cannot report it missing
        else if (twinSkill.strength === 'supported' && gapSkill.status === 'missing') {
          violations.push({
            code: VIOLATION_CODES.TWIN_GAP_SKILL_MISMATCH,
            severity: 'error',
            entity: `SkillGap:${roleId}:${gapSkill.key || gapSkill.name}`,
            expected: 'supported',
            actual: 'missing',
            message: `Skill "${gapSkill.name || gapSkill.key}" is supported in CareerTwin, but reported as "missing" in gap analysis for "${roleTitle}".`,
          });
        }
        // If gap reports verified, twin must have verified strength
        else if (gapSkill.status === 'verified' && twinSkill.strength !== 'verified') {
          violations.push({
            code: VIOLATION_CODES.TWIN_GAP_SKILL_MISMATCH,
            severity: 'error',
            entity: `SkillGap:${roleId}:${gapSkill.key || gapSkill.name}`,
            expected: twinSkill.strength,
            actual: 'verified',
            message: `Skill "${gapSkill.name || gapSkill.key}" is marked verified in gap analysis for "${roleTitle}", but only has strength "${twinSkill.strength}" in CareerTwin.`,
          });
        }
      }
    }
  }
}

/**
 * Validates that readiness blocking skills strictly reflect non-verified required skills in skill gap.
 */
function checkReadinessGapConsistency(readinessList, gaps, violations) {
  const gapMap = new Map();
  for (const gap of gaps) {
    if (gap?.roleId) gapMap.set(gap.roleId, gap);
  }

  for (const readiness of readinessList) {
    if (!readiness || !readiness.roleId) continue;
    const gap = gapMap.get(readiness.roleId);
    if (!gap || !Array.isArray(gap.skills)) continue;

    const gapSkillsMap = new Map();
    for (const gs of gap.skills) {
      if (!gs) continue;
      const key = skillKey(gs.key || gs.name || '');
      if (key) gapSkillsMap.set(key, gs);
    }

    const blockers = Array.isArray(readiness.blockingSkills) ? readiness.blockingSkills : [];
    const blockerKeys = new Set();

    for (const blocker of blockers) {
      if (!blocker) continue;
      const bKey = skillKey(blocker.key || blocker.name || '');
      blockerKeys.add(bKey);
      const gapSkill = gapSkillsMap.get(bKey);

      if (!gapSkill) {
        violations.push({
          code: VIOLATION_CODES.READINESS_GAP_BLOCKER_MISMATCH,
          severity: 'error',
          entity: `Readiness:${readiness.roleId}:blocker:${blocker.key || blocker.name}`,
          expected: 'Skill present in role skill gap',
          actual: 'Skill absent from role skill gap',
          message: `Readiness reports blocking skill "${blocker.name || blocker.key}", but this skill does not exist in skill gap for role "${readiness.roleId}".`,
        });
      } else if (gapSkill.status === 'verified') {
        violations.push({
          code: VIOLATION_CODES.READINESS_GAP_BLOCKER_MISMATCH,
          severity: 'error',
          entity: `Readiness:${readiness.roleId}:blocker:${blocker.key || blocker.name}`,
          expected: 'Non-verified status (missing, claimed, or supported)',
          actual: 'verified',
          message: `Readiness lists "${blocker.name || blocker.key}" as a blocking skill, but skill gap reports it as verified.`,
        });
      }
    }

    // Every required non-verified skill in gap must be in readiness blockers
    for (const gapSkill of gap.skills) {
      if (!gapSkill) continue;
      const isRequired = gapSkill.importance === 'required';
      const isUnsatisfied = ['missing', 'claimed', 'supported'].includes(gapSkill.status);

      if (isRequired && isUnsatisfied) {
        const gKey = skillKey(gapSkill.key || gapSkill.name || '');
        if (!blockerKeys.has(gKey)) {
          violations.push({
            code: VIOLATION_CODES.READINESS_GAP_BLOCKER_MISMATCH,
            severity: 'error',
            entity: `Readiness:${readiness.roleId}:omitted_blocker:${gapSkill.key || gapSkill.name}`,
            expected: `Skill "${gapSkill.name || gapSkill.key}" present in blockingSkills`,
            actual: 'Skill omitted from blockingSkills',
            message: `Required skill "${gapSkill.name || gapSkill.key}" is ${gapSkill.status} in skill gap, but omitted from readiness blockingSkills for role "${readiness.roleId}".`,
          });
        }
      }
    }
  }
}

/**
 * Validates recommendation score plausibility against twin skills.
 */
function checkRecommendationConsistency(twin, recommendations, violations) {
  const matches = Array.isArray(recommendations)
    ? recommendations
    : Array.isArray(recommendations?.matches)
      ? recommendations.matches
      : [];

  const twinSkillKeys = new Set(
    (twin.skills || []).map((s) => skillKey(s.key || s.name || '')).filter(Boolean),
  );

  for (const match of matches) {
    if (!match || typeof match !== 'object') continue;
    const roleId = match.roleId || match.role?.id || 'unknown_role';
    const roleTitle = match.title || match.role?.title || roleId;
    const score = typeof match.score === 'number' ? match.score : match.score?.overall ?? 0;

    let matchedCount = 0;
    if (Array.isArray(match.matchedRequired)) {
      matchedCount += match.matchedRequired.length;
    }
    if (Array.isArray(match.matchedPreferred)) {
      matchedCount += match.matchedPreferred.length;
    }

    if (!Array.isArray(match.matchedRequired) && !Array.isArray(match.matchedPreferred)) {
      const required = Array.isArray(match.role?.requiredSkills) ? match.role.requiredSkills : [];
      const preferred = Array.isArray(match.role?.preferredSkills) ? match.role.preferredSkills : [];
      matchedCount = [...required, ...preferred].filter((s) => twinSkillKeys.has(skillKey(s))).length;
    }

    // Student has 0 matched skills and score is higher than background/interest dimension max (~30)
    if (matchedCount === 0 && score > 35) {
      violations.push({
        code: VIOLATION_CODES.RECOMMENDATION_SCORE_INCONSISTENCY,
        severity: 'warning',
        entity: `Recommendation:${roleId}`,
        expected: 'Score <= 35 when zero required or preferred skills are held in CareerTwin',
        actual: `Score ${score}`,
        message: `Recommendation for "${roleTitle}" produced score ${score} despite 0 matched skills held in CareerTwin.`,
      });
    }
  }
}

/**
 * Validates CanonicalStudentState against CareerTwin to prevent state drift.
 */
function checkCanonicalTwinConsistency(canonicalStudent, twin, violations) {
  const twinSkillMap = new Map();
  for (const s of twin.skills || []) {
    if (!s || typeof s !== 'object') continue;
    const key = skillKey(s.key || s.name || '');
    if (key) twinSkillMap.set(key, s);
  }

  for (const canonicalSkill of canonicalStudent.skills || []) {
    if (!canonicalSkill || typeof canonicalSkill !== 'object') continue;
    if (canonicalSkill.strength === 'verified') {
      const key = skillKey(canonicalSkill.key || canonicalSkill.name || '');
      const twinSkill = twinSkillMap.get(key);

      if (!twinSkill) {
        violations.push({
          code: VIOLATION_CODES.CANONICAL_TWIN_DIVERGENCE,
          severity: 'error',
          entity: `CareerTwin:missing_skill:${canonicalSkill.key || canonicalSkill.name}`,
          expected: `Skill "${canonicalSkill.name || canonicalSkill.key}" present in CareerTwin`,
          actual: 'Skill missing from CareerTwin',
          message: `Canonical student state holds verified skill "${canonicalSkill.name || canonicalSkill.key}", but it is missing from CareerTwin.`,
        });
      } else if (twinSkill.strength !== 'verified') {
        violations.push({
          code: VIOLATION_CODES.CANONICAL_TWIN_DIVERGENCE,
          severity: 'error',
          entity: `CareerTwin:skill_strength:${canonicalSkill.key || canonicalSkill.name}`,
          expected: 'verified',
          actual: twinSkill.strength,
          message: `Canonical student state has verified strength for "${canonicalSkill.name || canonicalSkill.key}", but CareerTwin reports "${twinSkill.strength}".`,
        });
      }
    }
  }
}

/**
 * Checks if CareerTwin is stale compared to latest evidence or canonical student updates.
 */
function checkTwinStaleness(twin, { canonicalStudent, evidenceChecks }, violations) {
  const generatedAt = twin.generatedAt ? new Date(twin.generatedAt).getTime() : 0;

  for (const check of evidenceChecks) {
    if (!check?.completedAt) continue;
    const checkTime = new Date(check.completedAt).getTime();
    if (checkTime > generatedAt) {
      violations.push({
        code: VIOLATION_CODES.STALE_CAREER_TWIN,
        severity: 'warning',
        entity: 'CareerTwin',
        expected: `generatedAt >= ${new Date(checkTime).toISOString()}`,
        actual: `generatedAt = ${twin.generatedAt || 'unknown'}`,
        message: 'CareerTwin was generated before recent institutional evidence was verified.',
      });
      break; // Only flag once for evidence timestamps
    }
  }

  if (canonicalStudent?.metadata?.sourceCounts?.evidenceChecksCount !== undefined) {
    const canonicalCount = canonicalStudent.metadata.sourceCounts.evidenceChecksCount;
    const twinCount = twin.sources?.verifiedEvidenceCount ?? 0;
    if (canonicalCount > twinCount) {
      violations.push({
        code: VIOLATION_CODES.STALE_CAREER_TWIN,
        severity: 'warning',
        entity: 'CareerTwin:sources:verifiedEvidenceCount',
        expected: canonicalCount,
        actual: twinCount,
        message: `Canonical student has ${canonicalCount} evidence checks, but CareerTwin recorded ${twinCount}.`,
      });
    }
  }
}

/**
 * Deterministically computes required reconciliation actions from detected violations.
 */
function determineReconciliationActions(violations) {
  const actionsMap = new Map();

  for (const v of violations) {
    switch (v.code) {
      case VIOLATION_CODES.MISSING_CAREER_TWIN:
      case VIOLATION_CODES.STALE_CAREER_TWIN:
      case VIOLATION_CODES.UNVERIFIED_EVIDENCE_IN_TWIN:
      case VIOLATION_CODES.INVALIDATED_EVIDENCE_IN_TWIN:
      case VIOLATION_CODES.CANONICAL_TWIN_DIVERGENCE:
        if (!actionsMap.has(RECONCILIATION_ACTIONS.REBUILD_TWIN)) {
          actionsMap.set(RECONCILIATION_ACTIONS.REBUILD_TWIN, {
            action: RECONCILIATION_ACTIONS.REBUILD_TWIN,
            reason: 'CareerTwin is missing, stale, or diverged from verified evidence checks.',
          });
        }
        break;

      case VIOLATION_CODES.TWIN_GAP_SKILL_MISMATCH:
        if (!actionsMap.has(RECONCILIATION_ACTIONS.REFRESH_GAP)) {
          actionsMap.set(RECONCILIATION_ACTIONS.REFRESH_GAP, {
            action: RECONCILIATION_ACTIONS.REFRESH_GAP,
            reason: 'Skill gap analysis holds out-of-sync skill statuses compared to CareerTwin.',
          });
        }
        break;

      case VIOLATION_CODES.READINESS_GAP_BLOCKER_MISMATCH:
        if (!actionsMap.has(RECONCILIATION_ACTIONS.RECOMPUTE_READINESS)) {
          actionsMap.set(RECONCILIATION_ACTIONS.RECOMPUTE_READINESS, {
            action: RECONCILIATION_ACTIONS.RECOMPUTE_READINESS,
            reason: 'Readiness evaluation blockers do not match current skill gap analysis.',
          });
        }
        break;

      case VIOLATION_CODES.RECOMMENDATION_SCORE_INCONSISTENCY:
        if (!actionsMap.has(RECONCILIATION_ACTIONS.REFRESH_RECOMMENDATIONS)) {
          actionsMap.set(RECONCILIATION_ACTIONS.REFRESH_RECOMMENDATIONS, {
            action: RECONCILIATION_ACTIONS.REFRESH_RECOMMENDATIONS,
            reason: 'Career recommendations reflect inconsistent or ungrounded scores.',
          });
        }
        break;

      default:
        break;
    }
  }

  return Array.from(actionsMap.values());
}
