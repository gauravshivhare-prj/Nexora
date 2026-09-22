import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/**
 * Contract test: client resume constants vs server resume policy.
 *
 * The client mirrors a handful of server limits so the UI can give instant
 * feedback without a network round trip.  These values are UX guards, not
 * security boundaries — the server re-validates everything.  But if they
 * drift, a student types a long resume, waits, and gets a surprise rejection.
 *
 * This test imports both sides directly.  That is safe because:
 * - both packages are ESM (`"type": "module"`)
 * - the server file exports only plain JS values (no Node APIs, no Mongoose)
 * - the existing test infrastructure already crosses the client/server
 *   boundary (stack.js spawns from SERVER_DIR via import.meta.url)
 */

import {
  RESUME_TEXT_LIMITS,
  RESUME_LABEL_MAX,
  RESUMES_PER_USER,
  RESUME_UPLOAD_TYPES,
  RESUME_UPLOAD_MAX_BYTES,
} from '../src/constants/resumeOptions.js';

import {
  RESUME_LIMITS,
  ACCEPTED_UPLOAD_TYPES,
  UPLOAD_LIMITS,
} from '../../server/src/constants/resumePolicy.js';

describe('resume policy parity', () => {
  it('text limits match', () => {
    assert.equal(RESUME_TEXT_LIMITS.min, RESUME_LIMITS.text.min, 'text.min drifted');
    assert.equal(RESUME_TEXT_LIMITS.max, RESUME_LIMITS.text.max, 'text.max drifted');
  });

  it('label limit matches', () => {
    assert.equal(RESUME_LABEL_MAX, RESUME_LIMITS.label, 'label limit drifted');
  });

  it('per-user limit matches', () => {
    assert.equal(RESUMES_PER_USER, RESUME_LIMITS.perUser, 'perUser limit drifted');
  });

  it('upload max bytes matches', () => {
    assert.equal(RESUME_UPLOAD_MAX_BYTES, UPLOAD_LIMITS.maxBytes, 'maxBytes drifted');
  });

  it('accepted MIME types match', () => {
    const clientMimes = Object.keys(RESUME_UPLOAD_TYPES).sort();
    const serverMimes = Object.keys(ACCEPTED_UPLOAD_TYPES).sort();
    assert.deepEqual(clientMimes, serverMimes, 'accepted MIME types drifted');
  });

  it('accepted extensions match per MIME type', () => {
    for (const [mime, clientEntry] of Object.entries(RESUME_UPLOAD_TYPES)) {
      const serverEntry = ACCEPTED_UPLOAD_TYPES[mime];
      assert.ok(serverEntry, `server has no entry for ${mime}`);
      assert.deepEqual(
        clientEntry.extensions.slice().sort(),
        serverEntry.extensions.slice().sort(),
        `extensions for ${mime} drifted`,
      );
    }
  });
});
