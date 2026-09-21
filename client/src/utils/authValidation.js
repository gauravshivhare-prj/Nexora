/**
 * Client-side validation for the authentication forms.
 *
 * These rules mirror server/src/constants/authPolicy.js. They exist to give
 * immediate feedback, not to enforce anything: the server validates every
 * request independently and is the only authority. If the two ever disagree,
 * the server wins and its per-field `details` are shown instead.
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;
export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 100;

export const PASSWORD_HINT =
  'At least 8 characters, including a letter and a number.';

/** Matches the server's deliberately pragmatic pattern. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** UTF-8 byte length, which is what bcrypt's 72-byte limit counts. */
function byteLength(value) {
  return new TextEncoder().encode(value).length;
}

export function validateName(value) {
  const name = value.trim();
  if (!name) return 'Name is required.';
  if (name.length < NAME_MIN_LENGTH) return `Name must be at least ${NAME_MIN_LENGTH} characters.`;
  if (name.length > NAME_MAX_LENGTH) return `Name must be at most ${NAME_MAX_LENGTH} characters.`;
  return null;
}

export function validateEmail(value) {
  const email = value.trim();
  if (!email) return 'Email is required.';
  if (!EMAIL_PATTERN.test(email)) return 'Enter a valid email address.';
  return null;
}

/** Full policy check — for registration, where a new password is being set. */
export function validateNewPassword(value) {
  if (!value) return 'Password is required.';
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (byteLength(value) > PASSWORD_MAX_BYTES) {
    return `Password must be no longer than ${PASSWORD_MAX_BYTES} bytes.`;
  }
  if (!/\p{L}/u.test(value)) return 'Password must contain at least one letter.';
  if (!/\d/.test(value)) return 'Password must contain at least one number.';
  return null;
}

/**
 * Presence check only — for login.
 *
 * Applying the registration policy here would lock out any account created
 * before a policy change, and would tell an attacker what the rules are.
 */
export function validateExistingPassword(value) {
  return value ? null : 'Password is required.';
}

export function validatePasswordConfirmation(password, confirmation) {
  if (!confirmation) return 'Confirm your password.';
  if (password !== confirmation) return 'Passwords do not match.';
  return null;
}

/**
 * Runs a field-name → validator map and returns only the failures.
 *
 * @returns {Record<string, string>} Empty when every field passes.
 */
export function collectErrors(validators) {
  return Object.entries(validators).reduce((errors, [field, check]) => {
    const message = check();
    if (message) errors[field] = message;
    return errors;
  }, {});
}
