/**
 * Public vocabulary for the deterministic Career Readiness projection.
 *
 * This file defines the contract only. The service that computes it must use
 * existing skill-gap evidence and must not add a score or percentage.
 */
export const READINESS_CONTRACT_VERSION = 1;

export const READINESS_EVIDENCE_STATUS = Object.freeze({
  INSUFFICIENT_DATA: 'insufficient_data',
  PARTIAL: 'partial',
  SUPPORTED: 'supported',
  VERIFIED: 'verified',
});

export const READINESS_DATA_STATUS = Object.freeze({
  FRESH: 'fresh',
  STALE: 'stale',
  INCOMPLETE: 'incomplete',
});

export const READINESS_REQUIRED_FIELDS = Object.freeze([
  'roleId',
  'evidenceStatus',
  'dataStatus',
  'required',
  'preferred',
  'blockingSkills',
  'basedOn',
]);

export const READINESS_COUNT_FIELDS = Object.freeze([
  'total',
  'missing',
  'claimed',
  'supported',
  'verified',
]);