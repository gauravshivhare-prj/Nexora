import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  INTERVIEW_IMPACT_DOMAINS,
  buildInterviewImpact,
} from '../src/domain/evidence/interviewImpact.js';

/**
 * Task 20 — Interview Session Cross-Feature Consistency
 *
 * Tests the buildInterviewImpact domain function.
 *
 * Contracts:
 * 1. Failed interview → no evidence, no staleness, retry nextActions.
 * 2. AI-evaluated pass → supported evidence, careerTwin+skillGap stale.
 * 3. Human-evaluated pass → verified evidence, all 4 domains stale.
 * 4. Per-skill skillImpacts array with correct outcome/eligibleForVerified per skill.
 * 5. careerTwinWillRefresh is true in all passing cases.
 * 6. INTERVIEW_IMPACT_DOMAINS constants are stable and frozen.
 * 7. Output is deterministic.
 */

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function evidenceResult(skillKey, skillName, outcome, eligible, score = 0.8) {
  return { skillKey, skillName, outcome, eligibleForVerified: eligible, score };
}

const PASS_MARK = 0.75;

// ─── 1. INTERVIEW_IMPACT_DOMAINS ─────────────────────────────────────────────

describe('Task 20 — INTERVIEW_IMPACT_DOMAINS constants', () => {
  it('exposes all expected domain keys', () => {
    assert.equal(INTERVIEW_IMPACT_DOMAINS.CAREER_TWIN, 'careerTwin');
    assert.equal(INTERVIEW_IMPACT_DOMAINS.SKILL_GAP, 'skillGap');
    assert.equal(INTERVIEW_IMPACT_DOMAINS.READINESS, 'readiness');
    assert.equal(INTERVIEW_IMPACT_DOMAINS.OPPORTUNITIES, 'opportunities');
  });

  it('is frozen (immutable)', () => {
    assert.throws(() => { INTERVIEW_IMPACT_DOMAINS.X = 'y'; }, TypeError);
  });
});

// ─── 2. Failed interview ──────────────────────────────────────────────────────

describe('Task 20 — failed interview impact', () => {
  const result = buildInterviewImpact({
    overallScore: 0.5,
    eligibleForVerified: false,
    evaluatorType: 'human',
    evidenceResults: [evidenceResult('javascript', 'JavaScript', 'fail', false, 0.5)],
    passMark: PASS_MARK,
  });

  it('returns passed=false', () => assert.equal(result.passed, false));
  it('returns eligibleForVerified=false', () => assert.equal(result.eligibleForVerified, false));
  it('returns careerTwinWillRefresh=false', () => assert.equal(result.careerTwinWillRefresh, false));
  it('returns empty staleDomains', () => assert.deepEqual(result.staleDomains, []));
  it('message mentions the score and pass mark', () => {
    assert.match(result.message, /50%|pass mark|score/i);
  });
  it('nextActions are non-empty', () => {
    assert.ok(Array.isArray(result.nextActions) && result.nextActions.length > 0);
  });
});

// ─── 3. AI-evaluated pass ─────────────────────────────────────────────────────

describe('Task 20 — AI-evaluated pass impact', () => {
  const result = buildInterviewImpact({
    overallScore: 0.8,
    eligibleForVerified: false,
    evaluatorType: 'ai',
    evidenceResults: [
      evidenceResult('javascript', 'JavaScript', 'pass', false, 0.8),
      evidenceResult('nodejs', 'Node.js', 'pass', false, 0.8),
    ],
    passMark: PASS_MARK,
  });

  it('returns passed=true', () => assert.equal(result.passed, true));
  it('returns careerTwinWillRefresh=true', () => assert.equal(result.careerTwinWillRefresh, true));
  it('marks careerTwin and skillGap stale but NOT readiness/opportunities', () => {
    assert.ok(result.staleDomains.includes(INTERVIEW_IMPACT_DOMAINS.CAREER_TWIN));
    assert.ok(result.staleDomains.includes(INTERVIEW_IMPACT_DOMAINS.SKILL_GAP));
    assert.equal(result.staleDomains.includes(INTERVIEW_IMPACT_DOMAINS.READINESS), false);
    assert.equal(result.staleDomains.includes(INTERVIEW_IMPACT_DOMAINS.OPPORTUNITIES), false);
  });
  it('eligibleForVerified=false for AI evaluation', () => {
    assert.equal(result.eligibleForVerified, false);
  });
  it('nextActions recommend human interview for verification', () => {
    const actions = result.nextActions.join(' ');
    assert.match(actions, /human|advisory/i);
  });
  it('skillImpacts has 2 entries', () => {
    assert.equal(result.skillImpacts.length, 2);
  });
  it('all skillImpacts have outcome pass and eligibleForVerified=false', () => {
    for (const s of result.skillImpacts) {
      assert.equal(s.outcome, 'pass');
      assert.equal(s.eligibleForVerified, false);
    }
  });
});

// ─── 4. Human-evaluated verified pass ─────────────────────────────────────────

describe('Task 20 — human-evaluated verified pass impact', () => {
  const result = buildInterviewImpact({
    overallScore: 0.85,
    eligibleForVerified: true,
    evaluatorType: 'human',
    evidenceResults: [
      evidenceResult('javascript', 'JavaScript', 'pass', true, 0.85),
      evidenceResult('nodejs', 'Node.js', 'pass', true, 0.85),
    ],
    passMark: PASS_MARK,
  });

  it('returns passed=true', () => assert.equal(result.passed, true));
  it('returns eligibleForVerified=true', () => assert.equal(result.eligibleForVerified, true));
  it('returns careerTwinWillRefresh=true', () => assert.equal(result.careerTwinWillRefresh, true));
  it('marks all 4 domains stale', () => {
    assert.ok(result.staleDomains.includes(INTERVIEW_IMPACT_DOMAINS.CAREER_TWIN));
    assert.ok(result.staleDomains.includes(INTERVIEW_IMPACT_DOMAINS.SKILL_GAP));
    assert.ok(result.staleDomains.includes(INTERVIEW_IMPACT_DOMAINS.READINESS));
    assert.ok(result.staleDomains.includes(INTERVIEW_IMPACT_DOMAINS.OPPORTUNITIES));
  });
  it('message mentions verified and skill count', () => {
    assert.match(result.message, /verified/i);
    assert.match(result.message, /2 of 2/);
  });
  it('skillImpacts messages mention verification', () => {
    for (const s of result.skillImpacts) {
      assert.match(s.message, /verified/i);
    }
  });
  it('nextActions recommend refreshing skill gap and checking opportunities', () => {
    const actions = result.nextActions.join(' ');
    assert.match(actions, /skill gap|opportunities/i);
  });
});

// ─── 5. Mixed pass/fail skills ─────────────────────────────────────────────────

describe('Task 20 — mixed pass/fail skills in one session', () => {
  const result = buildInterviewImpact({
    overallScore: 0.8,
    eligibleForVerified: false,
    evaluatorType: 'human',
    evidenceResults: [
      evidenceResult('javascript', 'JavaScript', 'pass', false, 0.9),
      evidenceResult('sql', 'SQL', 'fail', false, 0.5),
    ],
    passMark: PASS_MARK,
  });

  it('returns passed=true (overall score passes)', () => assert.equal(result.passed, true));
  it('skillImpacts has correct per-skill outcomes', () => {
    const js = result.skillImpacts.find((s) => s.skillKey === 'javascript');
    const sql = result.skillImpacts.find((s) => s.skillKey === 'sql');
    assert.ok(js);
    assert.ok(sql);
    assert.equal(js.outcome, 'pass');
    assert.equal(sql.outcome, 'fail');
  });
  it('careerTwin stale because at least one skill passed', () => {
    assert.equal(result.careerTwinWillRefresh, true);
    assert.ok(result.staleDomains.includes(INTERVIEW_IMPACT_DOMAINS.CAREER_TWIN));
  });
});

// ─── 6. No evidence results ────────────────────────────────────────────────────

describe('Task 20 — edge cases', () => {
  it('handles empty evidenceResults without throwing', () => {
    const result = buildInterviewImpact({
      overallScore: 0.8,
      eligibleForVerified: false,
      evaluatorType: 'ai',
      evidenceResults: [],
      passMark: PASS_MARK,
    });
    assert.ok(typeof result === 'object');
    assert.ok(Array.isArray(result.skillImpacts));
    assert.equal(result.skillImpacts.length, 0);
  });

  it('is deterministic — same input gives same output', () => {
    const opts = {
      overallScore: 0.85,
      eligibleForVerified: true,
      evaluatorType: 'human',
      evidenceResults: [evidenceResult('git', 'Git', 'pass', true, 0.85)],
      passMark: PASS_MARK,
    };
    const first = buildInterviewImpact(opts);
    const second = buildInterviewImpact(opts);
    assert.deepEqual(first, second);
  });

  it('output always contains required schema fields', () => {
    const result = buildInterviewImpact({
      overallScore: 0.4,
      eligibleForVerified: false,
      evaluatorType: 'human',
      evidenceResults: [],
      passMark: PASS_MARK,
    });
    for (const field of ['passed', 'overallScore', 'evaluatorType', 'eligibleForVerified',
      'careerTwinWillRefresh', 'staleDomains', 'skillImpacts', 'message', 'nextActions']) {
      assert.ok(field in result, `Missing field: ${field}`);
    }
  });
});
