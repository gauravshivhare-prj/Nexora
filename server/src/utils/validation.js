import { ERROR_CODES } from '../constants/errorCodes.js';
import { ApiError } from './ApiError.js';

/**
 * Small validation primitives for request bodies.
 *
 * Deliberately not a schema library: the API surface is still tiny, and these
 * helpers keep the failure shape identical to every other error in the app.
 * Revisit if a later phase needs deeply nested validation.
 */

/**
 * Collects field errors and raises a single ApiError describing all of them,
 * so a caller fixes every problem in one round trip instead of one per request.
 */
export class ValidationCollector {
  constructor() {
    this.errors = [];
  }

  add(field, message) {
    this.errors.push({ field, message });
  }

  get hasErrors() {
    return this.errors.length > 0;
  }

  /** Throws if anything was collected. No-op otherwise. */
  throwIfInvalid() {
    if (!this.hasErrors) return;

    const summary = this.errors.map(({ field, message }) => `${field}: ${message}`).join('; ');
    const error = ApiError.badRequest(
      `Request data failed validation — ${summary}`,
      ERROR_CODES.VALIDATION_ERROR,
    );
    // Structured detail so the client can highlight individual fields rather
    // than parsing the message.
    error.details = this.errors;
    throw error;
  }
}

/**
 * Narrows an unknown value to a trimmed, non-empty string.
 *
 * Returns null for anything that is not a usable string, which lets callers
 * distinguish "absent or wrong type" from "present but invalid".
 */
export function asTrimmedString(value) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Normalises an email for storage and comparison: trimmed and lowercased.
 *
 * Only the case is changed. Provider-specific rules (stripping Gmail dots or
 * +tags) are deliberately not applied — they would silently merge addresses
 * their owners consider distinct.
 */
export function normaliseEmail(value) {
  const trimmed = asTrimmedString(value);
  return trimmed ? trimmed.toLowerCase() : null;
}

/** Byte length, which is what bcrypt's 72-byte limit actually counts. */
export function byteLength(value) {
  return Buffer.byteLength(value, 'utf8');
}
