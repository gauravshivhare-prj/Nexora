/**
 * Evidence Architecture & Evidence Lifecycle Engine (Task 04)
 *
 * Implements Claim -> Support -> Verification lifecycle for student competencies.
 * Enforces strict provenance, confidence scoring, staleness horizons,
 * non-downgrade invariants, dispute detection, and anti-AI-promotion boundaries.
 */

import { resolveCanonicalSkill } from '../skills/skillOntology.js';
import { skillKey, skillDisplayName } from '../skills/skillKey.js';
import {
  EVIDENCE_SOURCES,
  EVIDENCE_STRENGTH,
  EVIDENCE_STRENGTH_ORDER,
  meetsStrength,
} from './evidence.js';

export const EVIDENCE_STATUS = Object.freeze({
  ACTIVE: 'active',
  STALE: 'stale',
  DISPUTED: 'disputed',
  INVALIDATED: 'invalidated',
  SUPERSEDED: 'superseded',
});

/**
 * Staleness Horizons in Milliseconds.
 * How long a piece of evidence remains fresh before requiring refresher/re-verification.
 */
export const STALENESS_HORIZONS_MS = Object.freeze({
  [EVIDENCE_SOURCES.ASSESSMENT]: 180 * 24 * 60 * 60 * 1000, // 180 days (assessments test current retention)
  [EVIDENCE_SOURCES.INTERVIEW]: 365 * 24 * 60 * 60 * 1000,  // 365 days
  [EVIDENCE_SOURCES.PROJECT]: 365 * 24 * 60 * 60 * 1000,    // 365 days
  [EVIDENCE_SOURCES.CERTIFICATION]: 730 * 24 * 60 * 60 * 1000, // 2 years
  [EVIDENCE_SOURCES.SELF_DECLARED]: 90 * 24 * 60 * 60 * 1000, // 90 days if uncorroborated
  [EVIDENCE_SOURCES.RESUME]: 180 * 24 * 60 * 60 * 1000,      // 180 days
});

export const DEFAULT_STALENESS_HORIZON_MS = 180 * 24 * 60 * 60 * 1000;

/**
 * Base Confidence Calibration Table.
 */
export const BASE_CONFIDENCE_TABLE = Object.freeze({
  [EVIDENCE_STRENGTH.CLAIMED]: 0.35,
  [EVIDENCE_STRENGTH.SUPPORTED]: 0.70,
  [EVIDENCE_STRENGTH.VERIFIED]: 0.90,
});

export class EvidenceEngineError extends Error {
  constructor(message, code = 'EVIDENCE_ERROR') {
    super(message);
    this.name = 'EvidenceEngineError';
    this.code = code;
  }
}

/**
 * Validates and normalizes an incoming evidence submission.
 * Enforces ontology validity, evidence-channel eligibility, and anti-AI boundaries.
 */
export function validateEvidenceIntake({
  skill,
  source,
  score = 1.0,
  passMark = 0.7,
  evaluatedBy = 'user',
  reference,
  detail,
  isPractice = false,
  metadata = {},
  completedAt = new Date(),
}) {
  if (!skill) throw new EvidenceEngineError('Skill is required.', 'INVALID_SKILL');
  const canonical = resolveCanonicalSkill(skill);
  if (!canonical) {
    throw new EvidenceEngineError(`Skill "${skill}" is not recognized in the canonical ontology.`, 'UNKNOWN_SKILL');
  }

  if (!Object.values(EVIDENCE_SOURCES).includes(source)) {
    throw new EvidenceEngineError(`Unknown evidence source: "${source}".`, 'INVALID_SOURCE');
  }

  if (typeof reference !== 'string' || reference.trim() === '') {
    throw new EvidenceEngineError('Reference string is required for evidentiary provenance.', 'INVALID_REFERENCE');
  }

  const dateObj = new Date(completedAt);
  if (Number.isNaN(dateObj.getTime())) {
    throw new EvidenceEngineError('completedAt must be a valid date.', 'INVALID_DATE');
  }

  // Determine baseline strength
  let strength = EVIDENCE_STRENGTH.CLAIMED;
  let isAdvisory = false;
  let eligibleForVerified = false;
  let outcome = 'pass';

  if (source === EVIDENCE_SOURCES.ASSESSMENT) {
    if (isPractice || evaluatedBy === 'ai' || canonical.difficulty === 1 && metadata.isBeginner) {
      strength = EVIDENCE_STRENGTH.SUPPORTED;
      isAdvisory = evaluatedBy === 'ai';
      eligibleForVerified = false;
      outcome = score >= passMark ? 'pass' : 'fail';
    } else if (score >= passMark) {
      strength = EVIDENCE_STRENGTH.VERIFIED;
      eligibleForVerified = true;
      outcome = 'pass';
    } else {
      strength = EVIDENCE_STRENGTH.CLAIMED;
      outcome = 'fail';
      eligibleForVerified = false;
    }
  } else if (source === EVIDENCE_SOURCES.INTERVIEW) {
    if (evaluatedBy === 'ai') {
      // AI interview invariant: NEVER produces verified evidence
      strength = EVIDENCE_STRENGTH.SUPPORTED;
      isAdvisory = true;
      eligibleForVerified = false;
      outcome = 'uncertain';
    } else if (evaluatedBy === 'human') {
      if (score >= passMark && passMark >= 0.75) {
        strength = EVIDENCE_STRENGTH.VERIFIED;
        eligibleForVerified = true;
        outcome = 'pass';
      } else {
        strength = EVIDENCE_STRENGTH.CLAIMED;
        outcome = 'fail';
        eligibleForVerified = false;
      }
    } else {
      throw new EvidenceEngineError('Interview evaluator must be "human" or "ai".', 'INVALID_EVALUATOR');
    }
  } else if (source === EVIDENCE_SOURCES.PROJECT || source === EVIDENCE_SOURCES.CERTIFICATION) {
    strength = EVIDENCE_STRENGTH.SUPPORTED;
    outcome = 'pass';
    eligibleForVerified = false;
  } else if (source === EVIDENCE_SOURCES.SELF_DECLARED || source === EVIDENCE_SOURCES.RESUME) {
    strength = EVIDENCE_STRENGTH.CLAIMED;
    outcome = 'pass';
    eligibleForVerified = false;
  }

  // Calculate Expiration
  const horizon = STALENESS_HORIZONS_MS[source] || DEFAULT_STALENESS_HORIZON_MS;
  const expiresAt = new Date(dateObj.getTime() + horizon);
  const isStale = Date.now() > expiresAt.getTime();

  // Calculate Calibrated Confidence (0.0 to 1.0)
  let confidence = BASE_CONFIDENCE_TABLE[strength] || 0.35;
  if (strength === EVIDENCE_STRENGTH.VERIFIED) {
    const margin = Math.max(0, (score - passMark) / Math.max(0.01, 1.0 - passMark));
    confidence = Math.min(1.0, 0.85 + 0.15 * margin);
  } else if (strength === EVIDENCE_STRENGTH.SUPPORTED) {
    if (metadata.repoVerified || metadata.credentialVerified) {
      confidence = 0.80;
    } else if (isAdvisory) {
      confidence = 0.60;
    }
  } else if (strength === EVIDENCE_STRENGTH.CLAIMED && outcome === 'fail') {
    confidence = 0.10;
  }

  if (isStale) {
    confidence = Number((confidence * 0.80).toFixed(3)); // 20% staleness decay
  } else {
    confidence = Number(confidence.toFixed(3));
  }

  const generatedDetail =
    detail ||
    `${strength.toUpperCase()} from ${source}: ${canonical.name} (${outcome === 'pass' ? 'completed' : outcome})`;

  return {
    canonicalSkillId: canonical.id,
    skillKey: canonical.key,
    skillName: canonical.name,
    category: canonical.category,
    source,
    strength,
    status: isStale ? EVIDENCE_STATUS.STALE : EVIDENCE_STATUS.ACTIVE,
    score,
    passMark,
    outcome,
    eligibleForVerified,
    isAdvisory,
    confidence,
    isStale,
    evaluatedBy,
    reference,
    detail: generatedDetail,
    metadata,
    completedAt: dateObj,
    expiresAt,
  };
}

/**
 * Recomputes the unified evidence state for a single canonical skill across all its historical records.
 * Enforces Non-Downgrade Invariants, Dispute Detection, and Chronological Audit Ledger.
 *
 * @param {Array<object>} records - All evidence records belonging to this skill for a user
 * @param {object} canonical - The canonical skill ontology record
 * @returns {object} Canonical evidence state for the skill
 */
export function recomputeSkillEvidenceState(records = [], canonical) {
  if (!canonical) throw new EvidenceEngineError('Canonical skill record is required for recomputation.');

  // Exclude invalidated records from active evaluation
  const activeRecords = records.filter((r) => r.status !== EVIDENCE_STATUS.INVALIDATED);

  if (activeRecords.length === 0) {
    return {
      canonicalSkillId: canonical.id,
      skillKey: canonical.key,
      skillName: canonical.name,
      category: canonical.category,
      effectiveStrength: null,
      status: 'none',
      compositeConfidence: 0.0,
      isStale: false,
      isDisputed: false,
      highestEvidence: null,
      recordCount: 0,
      evidenceItems: [],
      nextRefreshDue: null,
      auditTrail: [
        {
          action: 'EVALUATION',
          timestamp: new Date(),
          details: 'No active evidence found.',
        },
      ],
    };
  }

  // Sort records: Newest first
  const sorted = [...activeRecords].sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

  // Determine highest achieved strength among valid non-downgraded items
  let bestStrength = null;
  let bestStrengthRank = -1;
  let highestRecord = null;
  let hasActiveVerified = false;
  let hasActiveSupported = false;
  let hasFailedProctoredCheck = false;
  let allRecordsStale = true;

  const now = Date.now();

  for (const rec of sorted) {
    const isCurrentRecordStale = rec.expiresAt ? now > new Date(rec.expiresAt).getTime() : false;
    if (!isCurrentRecordStale) {
      allRecordsStale = false;
    }

    if (rec.outcome === 'fail' && (rec.source === EVIDENCE_SOURCES.ASSESSMENT || rec.source === EVIDENCE_SOURCES.INTERVIEW)) {
      hasFailedProctoredCheck = true;
    }

    const rank = EVIDENCE_STRENGTH_ORDER.indexOf(rec.strength);
    if (rank > bestStrengthRank) {
      bestStrengthRank = rank;
      bestStrength = rec.strength;
      highestRecord = rec;
    }

    if (rec.strength === EVIDENCE_STRENGTH.VERIFIED && rec.outcome === 'pass') {
      hasActiveVerified = true;
    } else if (rec.strength === EVIDENCE_STRENGTH.SUPPORTED) {
      hasActiveSupported = true;
    }
  }

  // Non-Downgrade Invariant:
  // If an active verified pass exists, effectiveStrength remains VERIFIED even if a subsequent claim or test failed
  let effectiveStrength = bestStrength;
  if (hasActiveVerified) {
    effectiveStrength = EVIDENCE_STRENGTH.VERIFIED;
  } else if (hasActiveSupported && effectiveStrength !== EVIDENCE_STRENGTH.VERIFIED) {
    effectiveStrength = EVIDENCE_STRENGTH.SUPPORTED;
  }

  // Dispute Detection:
  // If the student claimed a skill, but has failed proctored assessments without any verified pass, flag as DISPUTED
  const isDisputed = !hasActiveVerified && hasFailedProctoredCheck && sorted.some((r) => r.source === EVIDENCE_SOURCES.SELF_DECLARED || r.source === EVIDENCE_SOURCES.RESUME);

  // Overall status
  let overallStatus = EVIDENCE_STATUS.ACTIVE;
  if (isDisputed) {
    overallStatus = EVIDENCE_STATUS.DISPUTED;
  } else if (allRecordsStale) {
    overallStatus = EVIDENCE_STATUS.STALE;
  }

  // Composite Confidence Calculation
  let baseConfidence = BASE_CONFIDENCE_TABLE[effectiveStrength] || 0.35;
  if (highestRecord && highestRecord.confidence) {
    baseConfidence = Math.max(baseConfidence, highestRecord.confidence);
  }

  // If disputed, severely penalize confidence
  if (isDisputed) {
    baseConfidence = Math.min(baseConfidence, 0.25);
  } else if (allRecordsStale) {
    baseConfidence = Number((baseConfidence * 0.80).toFixed(3));
  }

  // Calculate next refresh due date (earliest upcoming expiration among active items)
  const futureExpirations = sorted
    .map((r) => r.expiresAt ? new Date(r.expiresAt).getTime() : null)
    .filter((time) => time && time > now)
    .sort((a, b) => a - b);

  const nextRefreshDue = futureExpirations.length > 0 ? new Date(futureExpirations[0]) : null;

  // Build Chronological Audit Trail
  const auditTrail = sorted.map((rec) => ({
    evidenceId: rec._id ? String(rec._id) : rec.id || 'rec',
    action: `RECORD_${rec.strength.toUpperCase()}`,
    source: rec.source,
    outcome: rec.outcome,
    strength: rec.strength,
    confidence: rec.confidence,
    timestamp: rec.completedAt,
    reference: rec.reference,
    isStale: rec.expiresAt ? now > new Date(rec.expiresAt).getTime() : false,
  }));

  return {
    canonicalSkillId: canonical.id,
    skillKey: canonical.key,
    skillName: canonical.name,
    category: canonical.category,
    effectiveStrength,
    status: overallStatus,
    compositeConfidence: Number(baseConfidence.toFixed(3)),
    isStale: allRecordsStale,
    isDisputed,
    highestEvidence: highestRecord ? {
      source: highestRecord.source,
      strength: highestRecord.strength,
      score: highestRecord.score,
      completedAt: highestRecord.completedAt,
      reference: highestRecord.reference,
      detail: highestRecord.detail,
    } : null,
    recordCount: sorted.length,
    evidenceItems: sorted.map((r) => ({
      id: r._id ? String(r._id) : r.id,
      source: r.source,
      strength: r.strength,
      score: r.score,
      passMark: r.passMark,
      outcome: r.outcome,
      confidence: r.confidence,
      completedAt: r.completedAt,
      expiresAt: r.expiresAt,
      reference: r.reference,
      detail: r.detail,
    })),
    nextRefreshDue,
    auditTrail,
  };
}

/**
 * Recomputes the entire evidence ledger for a student across all known skills.
 *
 * @param {Array<object>} allUserRecords - All historical evidence check records for the user
 * @returns {{ skills: object, summary: object }}
 */
export function recomputeStudentEvidenceLedger(allUserRecords = []) {
  const recordsBySkillKey = new Map();

  for (const record of allUserRecords) {
    const key = record.skillKey || skillKey(record.skillName);
    if (!key) continue;
    if (!recordsBySkillKey.has(key)) {
      recordsBySkillKey.set(key, []);
    }
    recordsBySkillKey.get(key).push(record);
  }

  const skills = {};
  let verifiedCount = 0;
  let supportedCount = 0;
  let claimedCount = 0;
  let disputedCount = 0;
  let staleCount = 0;

  for (const [key, records] of recordsBySkillKey.entries()) {
    const sample = records[0];
    const canonical = resolveCanonicalSkill(sample.canonicalSkillId || sample.skillKey || sample.skillName);
    if (!canonical) continue;

    const state = recomputeSkillEvidenceState(records, canonical);
    skills[canonical.key] = state;

    if (state.effectiveStrength === EVIDENCE_STRENGTH.VERIFIED) {
      verifiedCount++;
    } else if (state.effectiveStrength === EVIDENCE_STRENGTH.SUPPORTED) {
      supportedCount++;
    } else if (state.effectiveStrength === EVIDENCE_STRENGTH.CLAIMED) {
      claimedCount++;
    }

    if (state.isDisputed) disputedCount++;
    if (state.isStale) staleCount++;
  }

  return {
    skills,
    summary: {
      totalTrackedSkills: Object.keys(skills).length,
      verifiedCount,
      supportedCount,
      claimedCount,
      disputedCount,
      staleCount,
      recomputedAt: new Date(),
    },
  };
}
