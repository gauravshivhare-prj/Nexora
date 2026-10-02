import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  IMPACT_DOMAINS,
  buildAssessmentImpact,
} from '../src/domain/assessment/assessmentImpact.js';

/**
 * Task 19 — Assessment Evidence Lifecycle: Cross-Feature Consistency
 *
 * Tests the buildAssessmentImpact domain function that computes the
 * downstream staleness signal after an assessment submission.
 *
 * Contracts:
 * 1. Failed assessment → no evidence, no staleness, retry nextActions.
 * 2. Passed + eligibleForVerified + !isPractice → all 5 domains stale (incl. roadmap).
 * 3. Passed + isPractice → careerTwin + skillGap stale (not readiness/opportunities).
 * 4. Passed + !eligibleForVerified (beginner) → careerTwin + skillGap stale.
 * 5. careerTwinWillRefresh is true in all passing cases.
 * 6. nextActions are non-empty strings.
 * 7. message is non-empty and skill-specific.
 * 8. Output is deterministic.
 * 9. IMPACT_DOMAINS constants are stable.
 */

// ─── 1. IMPACT_DOMAINS contract ───────────────────────────────────────────────

describe('Task 19 — IMPACT_DOMAINS constants', () => {
  it('exposes all expected domain keys', () => {
    assert.equal(IMPACT_DOMAINS.CAREER_TWIN, 'careerTwin');
    assert.equal(IMPACT_DOMAINS.SKILL_GAP, 'skillGap');
    assert.equal(IMPACT_DOMAINS.READINESS, 'readiness');
    assert.equal(IMPACT_DOMAINS.OPPORTUNITIES, 'opportunities');
    assert.equal(IMPACT_DOMAINS.ROADMAP, 'roadmap');
  });

  it('IMPACT_DOMAINS is frozen (immutable)', () => {
    assert.throws(() => {
      IMPACT_DOMAINS.NEW_DOMAIN = 'test';
    }, TypeError);
  });
});

// ─── 2. Failed assessment ─────────────────────────────────────────────────────

describe('Task 19 — failed assessment impact', () => {
  const failedResult = buildAssessmentImpact({
    passed: false,
    eligibleForVerified: false,
    skillKey: 'JavaScript',
    evidenceCheckId: null,
    isPractice: false,
  });

  it('returns passed=false', () => {
    assert.equal(failedResult.passed, false);
  });

  it('returns eligibleForVerified=false', () => {
    assert.equal(failedResult.eligibleForVerified, false);
  });

  it('returns no evidenceCheckId', () => {
    assert.equal(failedResult.evidenceCheckId, null);
  });

  it('returns careerTwinWillRefresh=false', () => {
    assert.equal(failedResult.careerTwinWillRefresh, false);
  });

  it('returns empty staleDomains', () => {
    assert.deepEqual(failedResult.staleDomains, []);
  });

  it('returns skill-specific message', () => {
    assert.ok(failedResult.message.includes('JavaScript'));
    assert.ok(failedResult.message.length > 0);
  });

  it('returns retry-focused nextActions', () => {
    assert.ok(Array.isArray(failedResult.nextActions));
    assert.ok(failedResult.nextActions.length > 0);
    const allActions = failedResult.nextActions.join(' ');
    assert.ok(allActions.toLowerCase().includes('javascript') || allActions.toLowerCase().includes('retry') || allActions.toLowerCase().includes('review'));
  });
});

// ─── 3. Verified pass (intermediate/advanced, not practice) ──────────────────

describe('Task 19 — verified pass impact', () => {
  const verifiedResult = buildAssessmentImpact({
    passed: true,
    eligibleForVerified: true,
    skillKey: 'Node.js',
    evidenceCheckId: 'check_abc123',
    isPractice: false,
  });

  it('returns passed=true', () => {
    assert.equal(verifiedResult.passed, true);
  });

  it('returns eligibleForVerified=true', () => {
    assert.equal(verifiedResult.eligibleForVerified, true);
  });

  it('returns the provided evidenceCheckId', () => {
    assert.equal(verifiedResult.evidenceCheckId, 'check_abc123');
  });

  it('returns careerTwinWillRefresh=true', () => {
    assert.equal(verifiedResult.careerTwinWillRefresh, true);
  });

  it('marks all 5 downstream domains as stale (including roadmap)', () => {
    const domains = verifiedResult.staleDomains;
    assert.ok(domains.includes(IMPACT_DOMAINS.CAREER_TWIN));
    assert.ok(domains.includes(IMPACT_DOMAINS.SKILL_GAP));
    assert.ok(domains.includes(IMPACT_DOMAINS.READINESS));
    assert.ok(domains.includes(IMPACT_DOMAINS.OPPORTUNITIES));
    assert.ok(domains.includes(IMPACT_DOMAINS.ROADMAP), 'ROADMAP must be stale after a verified pass');
    assert.equal(domains.length, 5);
  });

  it('message mentions the skill and verification', () => {
    assert.ok(verifiedResult.message.includes('Node.js'));
    assert.match(verifiedResult.message, /verified/i);
  });

  it('nextActions mention refresh and opportunities', () => {
    const actions = verifiedResult.nextActions.join(' ');
    assert.match(actions, /refresh|skill gap|opportunities/i);
  });
});

// ─── 4. Practice pass ─────────────────────────────────────────────────────────

describe('Task 19 — practice pass impact', () => {
  const practiceResult = buildAssessmentImpact({
    passed: true,
    eligibleForVerified: false,
    skillKey: 'React',
    evidenceCheckId: 'check_practice_456',
    isPractice: true,
  });

  it('returns careerTwinWillRefresh=true', () => {
    assert.equal(practiceResult.careerTwinWillRefresh, true);
  });

  it('only marks careerTwin and skillGap as stale (not readiness or opportunities)', () => {
    const domains = practiceResult.staleDomains;
    assert.ok(domains.includes(IMPACT_DOMAINS.CAREER_TWIN));
    assert.ok(domains.includes(IMPACT_DOMAINS.SKILL_GAP));
    assert.equal(domains.includes(IMPACT_DOMAINS.READINESS), false);
    assert.equal(domains.includes(IMPACT_DOMAINS.OPPORTUNITIES), false);
    assert.equal(domains.length, 2);
  });

  it('message mentions practice evidence', () => {
    assert.match(practiceResult.message, /practice/i);
    assert.ok(practiceResult.message.includes('React'));
  });

  it('nextActions recommend upgrading to intermediate assessment', () => {
    const actions = practiceResult.nextActions.join(' ');
    assert.match(actions, /intermediate|advanced/i);
  });
});

// ─── 5. Beginner pass (passed but not eligible for verified) ──────────────────

describe('Task 19 — beginner pass impact (not eligible for verified)', () => {
  const beginnerResult = buildAssessmentImpact({
    passed: true,
    eligibleForVerified: false,
    skillKey: 'CSS',
    evidenceCheckId: null,
    isPractice: false,
  });

  it('returns careerTwinWillRefresh=true', () => {
    assert.equal(beginnerResult.careerTwinWillRefresh, true);
  });

  it('marks careerTwin and skillGap as stale only', () => {
    const domains = beginnerResult.staleDomains;
    assert.ok(domains.includes(IMPACT_DOMAINS.CAREER_TWIN));
    assert.ok(domains.includes(IMPACT_DOMAINS.SKILL_GAP));
    assert.equal(domains.includes(IMPACT_DOMAINS.READINESS), false);
    assert.equal(domains.length, 2);
  });

  it('message mentions the need to pass intermediate assessment', () => {
    assert.match(beginnerResult.message, /intermediate|advanced/i);
  });
});

// ─── 6. Output schema invariants ─────────────────────────────────────────────

describe('Task 19 — output schema invariants', () => {
  it('all required fields present for failing case', () => {
    const result = buildAssessmentImpact({
      passed: false,
      eligibleForVerified: false,
      skillKey: 'SQL',
      evidenceCheckId: null,
      isPractice: false,
    });
    assert.ok('passed' in result);
    assert.ok('eligibleForVerified' in result);
    assert.ok('skillKey' in result);
    assert.ok('evidenceCheckId' in result);
    assert.ok('careerTwinWillRefresh' in result);
    assert.ok('staleDomains' in result);
    assert.ok('message' in result);
    assert.ok('nextActions' in result);
  });

  it('all required fields present for passing case', () => {
    const result = buildAssessmentImpact({
      passed: true,
      eligibleForVerified: true,
      skillKey: 'Docker',
      evidenceCheckId: 'check_789',
      isPractice: false,
    });
    for (const key of ['passed', 'eligibleForVerified', 'skillKey', 'evidenceCheckId',
      'careerTwinWillRefresh', 'staleDomains', 'message', 'nextActions']) {
      assert.ok(key in result, `Missing field: ${key}`);
    }
  });

  it('staleDomains is always an array', () => {
    const failing = buildAssessmentImpact({ passed: false, eligibleForVerified: false, skillKey: 'Git', evidenceCheckId: null, isPractice: false });
    const passing = buildAssessmentImpact({ passed: true, eligibleForVerified: true, skillKey: 'Git', evidenceCheckId: 'id', isPractice: false });
    assert.ok(Array.isArray(failing.staleDomains));
    assert.ok(Array.isArray(passing.staleDomains));
  });

  it('nextActions is always a non-empty array', () => {
    for (const opts of [
      { passed: false, eligibleForVerified: false, skillKey: 'Git', evidenceCheckId: null, isPractice: false },
      { passed: true, eligibleForVerified: true, skillKey: 'Git', evidenceCheckId: 'id', isPractice: false },
      { passed: true, eligibleForVerified: false, skillKey: 'Git', evidenceCheckId: null, isPractice: true },
    ]) {
      const result = buildAssessmentImpact(opts);
      assert.ok(Array.isArray(result.nextActions));
      assert.ok(result.nextActions.length > 0);
      for (const action of result.nextActions) {
        assert.ok(typeof action === 'string' && action.length > 0);
      }
    }
  });

  it('is deterministic — same input always gives same output', () => {
    const opts = {
      passed: true,
      eligibleForVerified: true,
      skillKey: 'JavaScript',
      evidenceCheckId: 'check_det_test',
      isPractice: false,
    };
    const first = buildAssessmentImpact(opts);
    const second = buildAssessmentImpact(opts);
    assert.deepEqual(first, second);
  });
});
