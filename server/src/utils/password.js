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

// A verifyPassword() counterpart belongs here, but it is only needed by login.
// It will be added — and tested — alongside the login endpoint rather than
// sitting here unused.
