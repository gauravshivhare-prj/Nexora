import { randomBytes } from 'node:crypto';

import bcrypt from 'bcryptjs';

import { PASSWORD_POLICY } from '../constants/authPolicy.js';
import { byteLength } from './validation.js';

/**
 * The only place passwords are hashed or compared.
 *
 * No custom cryptography: bcrypt handles salt generation and storage, and the
 * cost factor comes from the shared policy so it can be raised in one edit.
 *
 * Nothing in this module logs, returns or re-throws the plaintext password.
 */

/**
 * @param {string} plainPassword Already validated against PASSWORD_POLICY.
 * @returns {Promise<string>} A bcrypt hash, salt included.
 */
export async function hashPassword(plainPassword) {
  // Defence in depth: validation should have rejected this already, but a
  // silently truncated password is too dangerous to risk on call-order alone.
  if (byteLength(plainPassword) > PASSWORD_POLICY.maxBytes) {
    throw new Error(
      `Refusing to hash a password longer than ${PASSWORD_POLICY.maxBytes} bytes: bcrypt would truncate it.`,
    );
  }

  return bcrypt.hash(plainPassword, PASSWORD_POLICY.saltRounds);
}

/**
 * Checks a candidate password against a stored bcrypt hash.
 *
 * bcrypt.compare is constant-time for a given hash, so it does not leak the
 * correct password through response timing.
 *
 * @returns {Promise<boolean>} False for a missing or malformed hash rather
 *   than throwing, so a corrupt record fails closed as a normal login failure
 *   instead of surfacing as a 500 that distinguishes it from a wrong password.
 */
export async function verifyPassword(plainPassword, passwordHash) {
  if (typeof plainPassword !== 'string' || typeof passwordHash !== 'string') return false;
  if (plainPassword.length === 0 || passwordHash.length === 0) return false;

  try {
    return await bcrypt.compare(plainPassword, passwordHash);
  } catch {
    return false;
  }
}

/**
 * A hash of an unguessable random value, used to spend the same CPU time on a
 * login for an unknown email as for a known one.
 *
 * Without this, "no such user" returns in ~1ms while a real user costs the
 * ~250ms of a bcrypt comparison — a timing difference large enough to
 * enumerate registered emails over the network, which would defeat the
 * deliberately generic error message.
 *
 * Built once, lazily, so startup does not pay for it.
 */
let dummyHashPromise = null;

export function getDummyPasswordHash() {
  dummyHashPromise ??= bcrypt.hash(randomBytes(32).toString('hex'), PASSWORD_POLICY.saltRounds);
  return dummyHashPromise;
}
