import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EVIDENCE_WEIGHT,
  INTERVIEW_BOOST,
  SCORE_BANDS,
  computeReadinessScore,
  READINESS_SCORE_CONTRACT_VERSION,
} from '../src/domain/readiness/computeReadinessScore.js';
import { GAP_IMPORTANCE, GAP_STATUS } from '../src/domain/skillGap/computeSkillGap.js';

/**
 * Task 17 â€” Career Readiness Score Engine Reconstruction
 *
 * Tests the deterministic, evidence-weighted readiness score. The key
 * contracts:
 *
 * 1. Score is [0, 100] â€” integers only, no floats.
 * 2. Required skills contribute 70%, preferred 30%.
 * 3. Evidence multipliers: missing=0, claimed=0.25, supported=0.65, verified=1.
 * 4. Passed interviews boost a skill by INTERVIEW_BOOST (capped at 1.0).
 * 5. Confidence reflects evidence corroboration, not score magnitude.
 * 6. nextMilestone identifies the highest-impact action.
 * 7. Method block states deterministic=true, usesAi=false.
 * 8. Null/empty gap returns 0-score empty result without throwing.
 * 9. Score is deterministic: same inputs â†’ same output.
 */

// â”€â”€â”€ Fixtures â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function gapSkill(name, importance, status) {
  return {
    key: name.toLowerCase().replace(/[^a-z0-9]/g, ''),
    name,
    importance,
    status,
    reason: `${name} is ${status} for ${importance} requirement.`,
    evidence: [],
  };
}

function backendGap(requiredStatuses = [], preferredStatuses = []) {
  const REQ_NAMES = ['JavaScript', 'Node.js', 'REST APIs', 'SQL'];
  const PREF_NAMES = ['Docker', 'Express.js', 'MongoDB', 'Git'];

  const skills = [
    ...REQ_NAMES.slice(0, requiredStatuses.length).map((name, i) =>
      gapSkill(name, GAP_IMPORTANCE.REQUIRED, requiredStatuses[i]),
    ),
    ...PREF_NAMES.slice(0, preferredStatuses.length).map((name, i) =>
      gapSkill(name, GAP_IMPORTANCE.PREFERRED, preferredStatuses[i]),
    ),
  ];

  return {
    roleId: 'backend-developer',
    roleTitle: 'Backend Developer',
    skills,
  };
}

// â”€â”€â”€ 1. Contract & Schema â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('Task 17 â€” readiness score contract & schema', () => {
  it('returns all required top-level fields', () => {
    const result = computeReadinessScore(
      backendGap(
        [GAP_STATUS.VERIFIED, GAP_STATUS.VERIFIED, GAP_STATUS.VERIFIED, GAP_STATUS.VERIFIED],
        [],
      ),
    );

    assert.ok('roleId' in result);
    assert.ok('value' in result);
    assert.ok('band' in result);
    assert.ok('confidence' in result);
    assert.ok('breakdown' in result);
    assert.ok('nextMilestone' in result);
    assert.ok('method' in result);
  });

  it('value is an integer in [0, 100]', () => {
    const gap = backendGap(
      [GAP_STATUS.SUPPORTED, GAP_STATUS.CLAIMED, GAP_STATUS.MISSING, GAP_STATUS.VERIFIED],
      [GAP_STATUS.MISSING, GAP_STATUS.SUPPORTED],
    );
    const result = computeReadinessScore(gap);

    assert.equal(typeof result.value, 'number');
    assert.ok(Number.isInteger(result.value), `value must be integer, got ${result.value}`);
    assert.ok(result.value >= 0 && result.value <= 100);
  });

  it('method block is deterministic and uses no AI', () => {
    const result = computeReadinessScore(backendGap([GAP_STATUS.VERIFIED], []));
    assert.equal(result.method.deterministic, true);
    assert.equal(result.method.usesAi, false);
    assert.equal(result.method.contractVersion, READINESS_SCORE_CONTRACT_VERSION);
  });

  it('band is one of the known SCORE_BANDS labels', () => {
    const labels = SCORE_BANDS.map((b) => b.label);
    const gap = backendGap([GAP_STATUS.SUPPORTED, GAP_STATUS.CLAIMED], []);
    const result = computeReadinessScore(gap);
    assert.ok(labels.includes(result.band), `Unexpected band: ${result.band}`);
  });

  it('breakdown contains required and preferred sub-objects', () => {
    const result = computeReadinessScore(
      backendGap([GAP_STATUS.VERIFIED], [GAP_STATUS.MISSING]),
    );
    assert.ok(typeof result.breakdown.required === 'object');
    assert.ok(typeof result.breakdown.preferred === 'object');
    assert.ok(typeof result.breakdown.required.contribution === 'number');
    assert.ok(typeof result.breakdown.preferred.contribution === 'number');
  });
});

// â”€â”€â”€ 2. Score Arithmetic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('Task 17 â€” score arithmetic', () => {
  it('all-verified required + no preferred â†’ 70 (70% of 100 from required, 0 from preferred)', () => {
    const gap = backendGap(
      [GAP_STATUS.VERIFIED, GAP_STATUS.VERIFIED, GAP_STATUS.VERIFIED, GAP_STATUS.VERIFIED],
      [],
    );
    const result = computeReadinessScore(gap);

    // required contribution = 1.0 * 0.70 * 100 = 70
    // preferred contribution = 0 (no preferred skills, so groupScore=0 â†’ 0*0.30*100=0)
    assert.equal(result.breakdown.required.contribution, 70);
    assert.equal(result.breakdown.preferred.contribution, 0);
    assert.equal(result.value, 70);
  });

  it('all-verified required + all-verified preferred â†’ 100', () => {
    const gap = backendGap(
      [GAP_STATUS.VERIFIED, GAP_STATUS.VERIFIED, GAP_STATUS.VERIFIED, GAP_STATUS.VERIFIED],
      [GAP_STATUS.VERIFIED, GAP_STATUS.VERIFIED, GAP_STATUS.VERIFIED, GAP_STATUS.VERIFIED],
    );
    const result = computeReadinessScore(gap);

    assert.equal(result.value, 100);
    assert.equal(result.band, 'interview-ready');
  });

  it('all-missing required â†’ 0', () => {
    const gap = backendGap(
      [GAP_STATUS.MISSING, GAP_STATUS.MISSING, GAP_STATUS.MISSING, GAP_STATUS.MISSING],
      [],
    );
    const result = computeReadinessScore(gap);

    assert.equal(result.value, 0);
    assert.equal(result.band, 'beginning');
  });

  it('single claimed required skill â†’ score = round(0.25 * 0.70 * 100) = 18', () => {
    // One required skill claimed: groupScore = 0.25 / 1 = 0.25, contribution = round(0.25 * 0.70 * 100) = 18
    const gap = backendGap([GAP_STATUS.CLAIMED], []);
    const result = computeReadinessScore(gap);

    assert.equal(result.breakdown.required.contribution, Math.round(0.25 * 0.70 * 100));
    assert.equal(result.breakdown.preferred.contribution, 0);
    assert.equal(result.value, Math.round(0.25 * 0.70 * 100));
  });

  it('single supported required skill â†’ score = round(0.65 * 0.70 * 100) = 46', () => {
    const gap = backendGap([GAP_STATUS.SUPPORTED], []);
    const result = computeReadinessScore(gap);

    assert.equal(result.value, Math.round(0.65 * 0.70 * 100));
    assert.equal(result.band, 'developing');
  });

  it('mixed required skills compute proportional weighted average', () => {
    // 2 verified, 1 claimed, 1 missing â†’ groupScore = (1+1+0.25+0) / 4 = 0.5625
    // contribution = round(0.5625 * 0.70 * 100) = round(39.375) = 39
    const gap = backendGap(
      [GAP_STATUS.VERIFIED, GAP_STATUS.VERIFIED, GAP_STATUS.CLAIMED, GAP_STATUS.MISSING],
      [],
    );
    const result = computeReadinessScore(gap);

    const expectedContrib = Math.round(((1 + 1 + 0.25 + 0) / 4) * 0.70 * 100);
    assert.equal(result.breakdown.required.contribution, expectedContrib);
  });

  it('preferred skills contribute at most 30 points', () => {
    const gap = backendGap(
      [GAP_STATUS.MISSING, GAP_STATUS.MISSING, GAP_STATUS.MISSING, GAP_STATUS.MISSING],
      [GAP_STATUS.VERIFIED, GAP_STATUS.VERIFIED, GAP_STATUS.VERIFIED, GAP_STATUS.VERIFIED],
    );
    const result = computeReadinessScore(gap);

    // required contribution = 0, preferred = round(1.0 * 0.30 * 100) = 30
    assert.equal(result.breakdown.required.contribution, 0);
    assert.equal(result.breakdown.preferred.contribution, 30);
    assert.equal(result.value, 30);
    assert.equal(result.band, 'developing');
  });
});

// â”€â”€â”€ 3. Interview Boost â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('Task 17 â€” interview boost', () => {
  it('passing interview boosts skill from supported toward verified', () => {
    const gap = backendGap([GAP_STATUS.SUPPORTED], []);
    const skillKey = gap.skills[0].key;

    const withoutBoost = computeReadinessScore(gap);
    const withBoost = computeReadinessScore(gap, {
      interviewPassedSkillKeys: new Set([skillKey]),
    });

    assert.ok(withBoost.value > withoutBoost.value, 'Interview boost must increase score');
  });

  it('interview boost is capped at 1.0 (verified ceiling)', () => {
    // Verified + interview boost should not exceed 100 on required contribution
    const gap = backendGap([GAP_STATUS.VERIFIED], []);
    const skillKey = gap.skills[0].key;

    const result = computeReadinessScore(gap, {
      interviewPassedSkillKeys: new Set([skillKey]),
    });

    assert.equal(result.value, 70); // 1.0 * 0.70 * 100 = 70, no higher
  });

  it('supported + interview boost reaches (0.65 + 0.35 = 1.0) â†’ full verified credit', () => {
    const gap = backendGap([GAP_STATUS.SUPPORTED], []);
    const skillKey = gap.skills[0].key;

    const result = computeReadinessScore(gap, {
      interviewPassedSkillKeys: new Set([skillKey]),
    });

    // should be equal to all-verified single-skill score
    const verifiedResult = computeReadinessScore(backendGap([GAP_STATUS.VERIFIED], []));
    assert.equal(result.value, verifiedResult.value);
  });

  it('interview boost increments are exactly INTERVIEW_BOOST', () => {
    assert.equal(INTERVIEW_BOOST, 0.35);

    const gap = backendGap([GAP_STATUS.MISSING], []);
    const skillKey = gap.skills[0].key;

    const withBoost = computeReadinessScore(gap, {
      interviewPassedSkillKeys: new Set([skillKey]),
    });

    // missing(0) + 0.35 boost = 0.35 â†’ same as between-claimed-and-supported
    const expectedMult = Math.min(1.0, 0 + INTERVIEW_BOOST);
    const expectedScore = Math.round(expectedMult * 0.70 * 100);
    assert.equal(withBoost.value, expectedScore);
  });

  it('reflects interviewBoostApplied=true when keys are provided', () => {
    const gap = backendGap([GAP_STATUS.SUPPORTED], []);
    const skillKey = gap.skills[0].key;

    const result = computeReadinessScore(gap, {
      interviewPassedSkillKeys: new Set([skillKey]),
    });

    assert.equal(result.breakdown.interviewBoostApplied, true);
  });

  it('reflects interviewBoostApplied=false when no keys provided', () => {
    const gap = backendGap([GAP_STATUS.SUPPORTED], []);
    const result = computeReadinessScore(gap);
    assert.equal(result.breakdown.interviewBoostApplied, false);
  });
});

// â”€â”€â”€ 4. Score Bands â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('Task 17 â€” score bands', () => {
  it('score=90+ â†’ interview-ready', () => {
    // All 4 required verified + all 4 preferred verified â†’ 100
    const gap = backendGap(
      [GAP_STATUS.VERIFIED, GAP_STATUS.VERIFIED, GAP_STATUS.VERIFIED, GAP_STATUS.VERIFIED],
      [GAP_STATUS.VERIFIED, GAP_STATUS.VERIFIED, GAP_STATUS.VERIFIED, GAP_STATUS.VERIFIED],
    );
    const result = computeReadinessScore(gap);
    assert.equal(result.band, 'interview-ready');
    assert.ok(result.value >= 90);
  });

  it('score=75â€“89 â†’ strong', () => {
    // 4 required verified (70) + 2 preferred verified out of 4 (0.5*0.30*100=15) = 85
    const gap = backendGap(
      [GAP_STATUS.VERIFIED, GAP_STATUS.VERIFIED, GAP_STATUS.VERIFIED, GAP_STATUS.VERIFIED],
      [GAP_STATUS.VERIFIED, GAP_STATUS.VERIFIED, GAP_STATUS.MISSING, GAP_STATUS.MISSING],
    );
    const result = computeReadinessScore(gap);
    assert.ok(result.value >= 75 && result.value < 90, `Expected 75-89, got ${result.value}`);
    assert.equal(result.band, 'strong');
  });

  it('score=0â€“24 â†’ beginning', () => {
    const gap = backendGap(
      [GAP_STATUS.MISSING, GAP_STATUS.CLAIMED, GAP_STATUS.MISSING, GAP_STATUS.MISSING],
      [],
    );
    const result = computeReadinessScore(gap);
    assert.ok(result.value < 25, `Expected <25, got ${result.value}`);
    assert.equal(result.band, 'beginning');
  });
});

// â”€â”€â”€ 5. Confidence â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('Task 17 â€” confidence', () => {
  it('high confidence when 70%+ skills are supported or verified', () => {
    const gap = backendGap(
      [GAP_STATUS.VERIFIED, GAP_STATUS.VERIFIED, GAP_STATUS.SUPPORTED, GAP_STATUS.VERIFIED],
      [GAP_STATUS.SUPPORTED, GAP_STATUS.VERIFIED, GAP_STATUS.SUPPORTED, GAP_STATUS.VERIFIED],
    );
    const result = computeReadinessScore(gap);
    assert.equal(result.confidence, 'high');
  });

  it('low confidence when most skills are claimed or missing', () => {
    const gap = backendGap(
      [GAP_STATUS.CLAIMED, GAP_STATUS.MISSING, GAP_STATUS.CLAIMED, GAP_STATUS.MISSING],
      [GAP_STATUS.MISSING, GAP_STATUS.CLAIMED],
    );
    const result = computeReadinessScore(gap);
    assert.equal(result.confidence, 'low');
  });

  it('medium confidence when 35-70% skills are corroborated', () => {
    // 2/4 required supported â†’ 50% â†’ medium
    const gap = backendGap(
      [GAP_STATUS.SUPPORTED, GAP_STATUS.SUPPORTED, GAP_STATUS.CLAIMED, GAP_STATUS.MISSING],
      [],
    );
    const result = computeReadinessScore(gap);
    assert.equal(result.confidence, 'medium');
  });
});

// â”€â”€â”€ 6. nextMilestone â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('Task 17 â€” nextMilestone', () => {
  it('returns achievable=false at interview-ready band (nothing higher)', () => {
    const gap = backendGap(
      [GAP_STATUS.VERIFIED, GAP_STATUS.VERIFIED, GAP_STATUS.VERIFIED, GAP_STATUS.VERIFIED],
      [GAP_STATUS.VERIFIED, GAP_STATUS.VERIFIED, GAP_STATUS.VERIFIED, GAP_STATUS.VERIFIED],
    );
    const result = computeReadinessScore(gap);

    assert.equal(result.nextMilestone.achievable, false);
    assert.ok(result.nextMilestone.action.length > 0);
  });

  it('identifies the lowest-evidence required skill as the priority action', () => {
    const gap = backendGap(
      [GAP_STATUS.MISSING, GAP_STATUS.VERIFIED, GAP_STATUS.SUPPORTED, GAP_STATUS.CLAIMED],
      [],
    );
    const result = computeReadinessScore(gap);

    // The missing skill (JavaScript) has the lowest multiplier â†’ highest impact
    assert.equal(result.nextMilestone.skill.name, 'JavaScript');
    assert.ok(result.nextMilestone.action.length > 0);
    assert.ok(typeof result.nextMilestone.pointsNeeded === 'number');
    assert.equal(result.nextMilestone.achievable, true);
  });

  it('action mentions adding a project when skill is missing', () => {
    const gap = backendGap([GAP_STATUS.MISSING], []);
    const result = computeReadinessScore(gap);
    assert.match(result.nextMilestone.action, /project|profile/i);
  });

  it('action mentions verification when skill is supported', () => {
    const gap = backendGap(
      [GAP_STATUS.SUPPORTED, GAP_STATUS.VERIFIED, GAP_STATUS.VERIFIED, GAP_STATUS.VERIFIED],
      [],
    );
    const result = computeReadinessScore(gap);
    // Supported skill is the lowest â†’ verification action
    assert.match(result.nextMilestone.action, /verif|assessment|interview/i);
  });
});

// â”€â”€â”€ 7. Edge Cases & Determinism â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('Task 17 â€” edge cases & determinism', () => {
  it('handles null gap without throwing', () => {
    const result = computeReadinessScore(null);
    assert.equal(result.value, 0);
    assert.equal(result.band, 'beginning');
    assert.equal(result.confidence, 'low');
    assert.equal(result.breakdown.interviewBoostApplied, false);
  });

  it('handles gap with no skills without throwing', () => {
    const result = computeReadinessScore({ roleId: 'backend-developer', skills: [] });
    assert.equal(result.value, 0);
    assert.equal(result.roleId, 'backend-developer');
  });

  it('produces identical output for identical inputs', () => {
    const gap = backendGap(
      [GAP_STATUS.SUPPORTED, GAP_STATUS.CLAIMED, GAP_STATUS.MISSING, GAP_STATUS.VERIFIED],
      [GAP_STATUS.SUPPORTED, GAP_STATUS.VERIFIED],
    );
    const keys = new Set(['javascript', 'nodejs']);

    const first = computeReadinessScore(gap, { interviewPassedSkillKeys: keys });
    const second = computeReadinessScore(gap, { interviewPassedSkillKeys: keys });

    assert.deepEqual(first, second);
  });

  it('EVIDENCE_WEIGHT constants match documented multipliers', () => {
    assert.equal(EVIDENCE_WEIGHT[GAP_STATUS.MISSING], 0);
    assert.equal(EVIDENCE_WEIGHT[GAP_STATUS.CLAIMED], 0.25);
    assert.equal(EVIDENCE_WEIGHT[GAP_STATUS.SUPPORTED], 0.65);
    assert.equal(EVIDENCE_WEIGHT[GAP_STATUS.VERIFIED], 1.0);
  });

  it('empty interviewPassedSkillKeys Set is treated the same as no boost', () => {
    const gap = backendGap([GAP_STATUS.SUPPORTED], []);
    const withEmpty = computeReadinessScore(gap, { interviewPassedSkillKeys: new Set() });
    const withUndefined = computeReadinessScore(gap);
    assert.deepEqual(withEmpty, withUndefined);
  });

  it('non-Set interviewPassedSkillKeys falls back to empty set', () => {
    const gap = backendGap([GAP_STATUS.SUPPORTED], []);
    // Should not throw with invalid input
    const result = computeReadinessScore(gap, { interviewPassedSkillKeys: ['javascript'] });
    assert.ok(typeof result.value === 'number');
  });
});

// â”€â”€â”€ Task 17 â€” Duplicate Skill Deduplication Regression â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('Task 17 â€” duplicate skill deduplication (regression)', () => {
  const R = GAP_IMPORTANCE.REQUIRED;
  const P = GAP_IMPORTANCE.PREFERRED;

  function skill(name, status, importance) {
    return {
      key: name.toLowerCase().replace(/[^a-z0-9]/g, ''),
      name,
      status,
      importance,
    };
  }

  it('duplicate required-verified skill does not inflate the score (EC7 regression)', () => {
    // Without duplicate: 1 verified out of 2 required = 0.5 * 0.70 * 100 = 35
    const noDup = computeReadinessScore({
      roleId: 'r',
      skills: [skill('JavaScript', GAP_STATUS.VERIFIED, R), skill('Node.js', GAP_STATUS.MISSING, R)],
    });

    // With duplicate: same JS appears twice â€” must still score the same as without duplicate
    const withDup = computeReadinessScore({
      roleId: 'r',
      skills: [
        skill('JavaScript', GAP_STATUS.VERIFIED, R),
        skill('JavaScript', GAP_STATUS.VERIFIED, R), // duplicate
        skill('Node.js', GAP_STATUS.MISSING, R),
      ],
    });

    assert.equal(noDup.value, 35, 'baseline should be 35');
    assert.equal(withDup.value, noDup.value, 'duplicate must not inflate the score');
  });

  it('duplicate preferred-verified skill does not inflate the preferred contribution', () => {
    // 1 required missing = 0 * 0.70 * 100 = 0
    // 1 preferred verified without dup = 1.0 * 0.30 * 100 = 30
    const noDup = computeReadinessScore({
      roleId: 'r',
      skills: [skill('JavaScript', GAP_STATUS.MISSING, R), skill('SQL', GAP_STATUS.VERIFIED, P)],
    });

    const withDup = computeReadinessScore({
      roleId: 'r',
      skills: [
        skill('JavaScript', GAP_STATUS.MISSING, R),
        skill('SQL', GAP_STATUS.VERIFIED, P),
        skill('SQL', GAP_STATUS.VERIFIED, P), // duplicate preferred
      ],
    });

    assert.equal(noDup.value, 30, 'baseline preferred contribution should be 30');
    assert.equal(withDup.value, noDup.value, 'duplicate preferred must not inflate the score');
  });

  it('duplicate mixed-status keeps the highest-quality entry', () => {
    // JS appears as both MISSING and VERIFIED â€” dedup must keep VERIFIED (quality=3)
    // 1 required verified = 1.0 * 0.70 * 100 = 70
    const result = computeReadinessScore({
      roleId: 'r',
      skills: [
        skill('JavaScript', GAP_STATUS.MISSING, R),  // lower quality
        skill('JavaScript', GAP_STATUS.VERIFIED, R), // higher quality â€” must win
      ],
    });

    assert.equal(result.value, 70, 'highest-quality entry should win in deduplication');
  });

  it('duplicate CLAIMED vs SUPPORTED keeps SUPPORTED', () => {
    // SUPPORTED(0.65) wins over CLAIMED(0.25)
    const withDup = computeReadinessScore({
      roleId: 'r',
      skills: [
        skill('JavaScript', GAP_STATUS.CLAIMED, R),
        skill('JavaScript', GAP_STATUS.SUPPORTED, R),
      ],
    });

    const unique = computeReadinessScore({
      roleId: 'r',
      skills: [skill('JavaScript', GAP_STATUS.SUPPORTED, R)],
    });

    assert.equal(withDup.value, unique.value, 'SUPPORTED should win over CLAIMED in deduplication');
  });

  it('unique skills are unaffected by deduplication logic', () => {
    const unique = computeReadinessScore({
      roleId: 'r',
      skills: [
        skill('JavaScript', GAP_STATUS.VERIFIED, R),
        skill('Node.js', GAP_STATUS.SUPPORTED, R),
        skill('SQL', GAP_STATUS.CLAIMED, P),
      ],
    });

    // EC14 formula:
    //   required avg = (1.0 + 0.65) / 2 = 0.825
    //   preferred avg = 0.25
    //   composite = round(0.825 * 0.70 * 100 + 0.25 * 0.30 * 100) = round(57.75 + 7.5) = round(65.25) = 65
    const expected = Math.round(((1.0 + 0.65) / 2) * 0.70 * 100 + 0.25 * 0.30 * 100);
    assert.equal(unique.value, expected, 'unique skills must score correctly without deduplication side effects');
  });

  it('duplicate with null/empty key is safely ignored', () => {
    // Skills with empty key after normalization should not crash
    const result = computeReadinessScore({
      roleId: 'r',
      skills: [
        skill('JavaScript', GAP_STATUS.VERIFIED, R),
        { key: '', name: '', status: GAP_STATUS.MISSING, importance: R }, // invalid â€” empty key
        skill('Node.js', GAP_STATUS.MISSING, R),
      ],
    });

    // The empty-key entry is dropped by deduplicateSkills
    // 1 of 2 valid required skills verified = 35
    assert.equal(result.value, 35, 'empty-key skills must be silently ignored');
  });
});
