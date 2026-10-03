import { GAP_STATUS } from '../skillGap/computeSkillGap.js';

const STATUS_RANK = Object.freeze({
  [GAP_STATUS.VERIFIED]: 3,
  [GAP_STATUS.SUPPORTED]: 2,
  [GAP_STATUS.CLAIMED]: 1,
  [GAP_STATUS.MISSING]: 0,
});

const EVIDENCE_STATUS_RANK = Object.freeze({
  verified: 3,
  supported: 2,
  partial: 1,
  insufficient_data: 0,
});

/**
 * Computes a deterministic delta comparison between a previous readiness snapshot
 * and the current readiness calculation.
 *
 * Pure function: No side effects, no database access, no clock, no AI.
 *
 * @param {object|null} previous Snapshot or prior readiness result.
 * @param {object} current Current readiness result.
 * @returns {object} Change attribution delta.
 */
export function computeReadinessDelta(previous, current) {
  const currentStatus = current?.evidenceStatus ?? 'insufficient_data';
  const currentScoreVal = extractScoreValue(current);

  if (!previous) {
    return {
      hasPrevious: false,
      scoreDelta: 0,
      currentScore: currentScoreVal,
      previousScore: null,
      statusDelta: {
        from: null,
        to: currentStatus,
        changed: false,
        direction: 'unchanged',
      },
      skills: {
        improved: [],
        degraded: [],
        unchanged: [],
        newlyResolved: [],
        newlyBlocking: [],
      },
      summary: 'Initial readiness assessment established. No previous baseline.',
    };
  }

  const previousStatus = previous.evidenceStatus ?? 'insufficient_data';
  const previousScoreVal = extractScoreValue(previous);

  const scoreDelta = (currentScoreVal !== null && previousScoreVal !== null)
    ? currentScoreVal - previousScoreVal
    : 0;

  const prevStatusRank = EVIDENCE_STATUS_RANK[previousStatus] ?? 0;
  const currStatusRank = EVIDENCE_STATUS_RANK[currentStatus] ?? 0;

  let overallDirection = 'unchanged';
  if (scoreDelta > 0 || currStatusRank > prevStatusRank) {
    overallDirection = 'improved';
  } else if (scoreDelta < 0 || currStatusRank < prevStatusRank) {
    overallDirection = 'degraded';
  }

  // Build maps of skill states
  const prevSkillsMap = extractSkillMap(previous);
  const currSkillsMap = extractSkillMap(current);

  const improved = [];
  const degraded = [];
  const unchanged = [];

  const allKeys = new Set([...prevSkillsMap.keys(), ...currSkillsMap.keys()]);

  for (const key of allKeys) {
    const prevSkill = prevSkillsMap.get(key);
    const currSkill = currSkillsMap.get(key);

    const name = currSkill?.name || prevSkill?.name || key;
    const prevStatus = prevSkill?.status ?? GAP_STATUS.MISSING;
    const currStatus = currSkill?.status ?? GAP_STATUS.MISSING;

    const prevRank = STATUS_RANK[prevStatus] ?? 0;
    const currRank = STATUS_RANK[currStatus] ?? 0;

    if (currRank > prevRank) {
      improved.push({
        key,
        name,
        from: prevStatus,
        to: currStatus,
        tier: currSkill?.tier || prevSkill?.tier || 'required',
      });
    } else if (currRank < prevRank) {
      degraded.push({
        key,
        name,
        from: prevStatus,
        to: currStatus,
        tier: currSkill?.tier || prevSkill?.tier || 'required',
      });
    } else if (prevSkill && currSkill) {
      unchanged.push({
        key,
        name,
        status: currStatus,
        tier: currSkill.tier || 'required',
      });
    }
  }

  // Blocking skills attribution
  const prevBlockingKeys = new Set(
    (previous.blockingSkills || []).map((s) => s.key || s.name?.toLowerCase()).filter(Boolean),
  );
  const currBlocking = current.blockingSkills || [];
  const currBlockingKeys = new Set(
    currBlocking.map((s) => s.key || s.name?.toLowerCase()).filter(Boolean),
  );

  const newlyResolved = [];
  for (const key of prevBlockingKeys) {
    if (!currBlockingKeys.has(key)) {
      const prevSkill = (previous.blockingSkills || []).find(
        (s) => (s.key || s.name?.toLowerCase()) === key,
      );
      newlyResolved.push({
        key,
        name: prevSkill?.name || key,
        status: currSkillsMap.get(key)?.status || GAP_STATUS.VERIFIED,
      });
    }
  }

  const newlyBlocking = [];
  for (const skill of currBlocking) {
    const key = skill.key || skill.name?.toLowerCase();
    if (key && !prevBlockingKeys.has(key)) {
      newlyBlocking.push({
        key,
        name: skill.name || key,
        status: skill.status || GAP_STATUS.MISSING,
        reason: skill.reason || null,
      });
    }
  }

  // Compose human-readable summary
  const summary = composeSummary({
    scoreDelta,
    currentScoreVal,
    previousScoreVal,
    previousStatus,
    currentStatus,
    improvedCount: improved.length,
    degradedCount: degraded.length,
    newlyResolvedCount: newlyResolved.length,
    newlyBlockingCount: newlyBlocking.length,
  });

  return {
    hasPrevious: true,
    scoreDelta,
    currentScore: currentScoreVal,
    previousScore: previousScoreVal,
    statusDelta: {
      from: previousStatus,
      to: currentStatus,
      changed: previousStatus !== currentStatus,
      direction: overallDirection,
    },
    skills: {
      improved,
      degraded,
      unchanged,
      newlyResolved,
      newlyBlocking,
    },
    summary,
  };
}

function extractScoreValue(obj) {
  if (!obj) return null;
  if (typeof obj.score === 'number') return obj.score;
  if (typeof obj.value === 'number') return obj.value;
  if (obj.score && typeof obj.score.score === 'number') return obj.score.score;
  if (obj.score && typeof obj.score.value === 'number') return obj.score.value;
  return null;
}

function extractSkillMap(source) {
  const map = new Map();
  if (!source) return map;

  if (Array.isArray(source.skillStates) && source.skillStates.length > 0) {
    for (const s of source.skillStates) {
      const key = (s.skillKey || s.key || s.name || '').toLowerCase().trim();
      if (key) {
        map.set(key, {
          key,
          name: s.name || key,
          status: s.status || GAP_STATUS.MISSING,
          tier: s.tier || 'required',
        });
      }
    }
  } else if (Array.isArray(source.blockingSkills)) {
    for (const s of source.blockingSkills) {
      const key = (s.key || s.name || '').toLowerCase().trim();
      if (key) {
        map.set(key, {
          key,
          name: s.name || key,
          status: s.status || GAP_STATUS.CLAIMED,
          tier: s.importance || 'required',
        });
      }
    }
  }

  return map;
}

function composeSummary({
  scoreDelta,
  currentScoreVal,
  previousScoreVal,
  previousStatus,
  currentStatus,
  improvedCount,
  degradedCount,
  newlyResolvedCount,
  newlyBlockingCount,
}) {
  const parts = [];

  if (previousScoreVal !== null && currentScoreVal !== null) {
    if (scoreDelta > 0) {
      parts.push(`Readiness score improved by +${scoreDelta} points (${previousScoreVal} → ${currentScoreVal}).`);
    } else if (scoreDelta < 0) {
      parts.push(`Readiness score changed by ${scoreDelta} points (${previousScoreVal} → ${currentScoreVal}).`);
    } else {
      parts.push(`Readiness score held steady at ${currentScoreVal}.`);
    }
  }

  if (previousStatus !== currentStatus) {
    parts.push(`Evidence status shifted from ${previousStatus} to ${currentStatus}.`);
  }

  if (newlyResolvedCount > 0) {
    parts.push(`${newlyResolvedCount} blocking skill${newlyResolvedCount > 1 ? 's' : ''} resolved.`);
  }

  if (improvedCount > 0) {
    parts.push(`${improvedCount} skill${improvedCount > 1 ? 's' : ''} advanced in evidence strength.`);
  }

  if (degradedCount > 0) {
    parts.push(`${degradedCount} skill${degradedCount > 1 ? 's' : ''} degraded in evidence strength.`);
  }

  if (newlyBlockingCount > 0) {
    parts.push(`${newlyBlockingCount} new skill${newlyBlockingCount > 1 ? 's' : ''} require attention.`);
  }

  if (parts.length === 0) {
    return `No evidential changes detected against role baseline (Score: ${currentScoreVal ?? 0}).`;
  }

  return parts.join(' ');
}
