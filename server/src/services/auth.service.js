import mongoose from 'mongoose';

import {
  EMAIL_MAX_LENGTH,
  EMAIL_PATTERN,
  NAME_POLICY,
  PASSWORD_POLICY,
  PASSWORD_REQUIREMENT_MESSAGE,
} from '../constants/authPolicy.js';
import { ERROR_CODES } from '../constants/errorCodes.js';
import { User, toPublicUser } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { signAccessToken } from '../utils/jwt.js';
import { getDummyPasswordHash, hashPassword, verifyPassword } from '../utils/password.js';
import {
  ValidationCollector,
  asTrimmedString,
  byteLength,
  normaliseEmail,
} from '../utils/validation.js';

/** MongoDB's duplicate-key error code. */
const DUPLICATE_KEY_ERROR = 11000;

/**
 * Validates and normalises a registration payload.
 *
 * Reads only the three fields registration owns. `role` and `isActive` are
 * never taken from the request: accepting them would let anyone register
 * themselves as an admin.
 *
 * @returns {{ name: string, email: string, password: string }}
 * @throws {ApiError} 400 listing every field that failed.
 */
export function validateRegistrationInput(payload) {
  const collector = new ValidationCollector();

  // A non-object body (array, string, null) has no fields to read.
  const body = payload !== null && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};

  const name = asTrimmedString(body.name);
  if (!name) {
    collector.add('name', 'Name is required');
  } else if (name.length < NAME_POLICY.minLength) {
    collector.add('name', `Name must be at least ${NAME_POLICY.minLength} characters`);
  } else if (name.length > NAME_POLICY.maxLength) {
    collector.add('name', `Name must be at most ${NAME_POLICY.maxLength} characters`);
  }

  const email = normaliseEmail(body.email);
  if (!email) {
    collector.add('email', 'Email is required');
  } else if (email.length > EMAIL_MAX_LENGTH) {
    collector.add('email', `Email must be at most ${EMAIL_MAX_LENGTH} characters`);
  } else if (!EMAIL_PATTERN.test(email)) {
    collector.add('email', 'Email format is invalid');
  }

  // Not trimmed: leading and trailing spaces are legitimate password
  // characters, and silently stripping them would change the secret.
  const password = typeof body.password === 'string' ? body.password : null;
  if (password === null || password.length === 0) {
    collector.add('password', 'Password is required');
  } else if (
    password.length < PASSWORD_POLICY.minLength ||
    byteLength(password) > PASSWORD_POLICY.maxBytes ||
    (PASSWORD_POLICY.requiresLetter && !/\p{L}/u.test(password)) ||
    (PASSWORD_POLICY.requiresDigit && !/\d/.test(password))
  ) {
    // One combined message: enumerating which rule failed tells an attacker
    // about the policy without helping a legitimate user any further.
    collector.add('password', PASSWORD_REQUIREMENT_MESSAGE);
  }

  collector.throwIfInvalid();

  return { name, email, password };
}

/**
 * Creates a new account.
 *
 * @param {unknown} payload Raw request body.
 * @returns {Promise<object>} The public user shape — never the hash.
 * @throws {ApiError} 400 on invalid input, 409 when the email is taken.
 */
export async function registerUser(payload) {
  const { name, email, password } = validateRegistrationInput(payload);

  const passwordHash = await hashPassword(password);

  try {
    // Explicit field list rather than spreading the request body: no client
    // can set role, isActive or any field added to the schema later.
    const user = await User.create({ name, email, passwordHash });
    return toPublicUser(user);
  } catch (error) {
    // The unique index is the authority on duplicates. Checking findOne()
    // first would still leave a window where two concurrent requests both
    // pass the check, so we let the write fail and translate the result.
    if (error?.code === DUPLICATE_KEY_ERROR) {
      throw ApiError.conflict(
        'An account with this email already exists.',
        ERROR_CODES.EMAIL_ALREADY_REGISTERED,
      );
    }
    throw error;
  }
}

/**
 * Validates a login payload.
 *
 * Checks only presence and type. The password is *not* held to the
 * registration policy: rejecting a login because the password looks weak
 * would tell an attacker the policy and would lock out accounts created
 * before a policy change. A wrong password simply fails verification.
 *
 * @returns {{ email: string, password: string }}
 * @throws {ApiError} 400
 */
export function validateLoginInput(payload) {
  const collector = new ValidationCollector();
  const body =
    payload !== null && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};

  const email = normaliseEmail(body.email);
  if (!email) {
    collector.add('email', 'Email is required');
  } else if (email.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(email)) {
    collector.add('email', 'Email format is invalid');
  }

  const password = typeof body.password === 'string' ? body.password : null;
  if (password === null || password.length === 0) {
    collector.add('password', 'Password is required');
  }

  collector.throwIfInvalid();

  return { email, password };
}

/** The one response every failed login produces, whatever the real reason. */
function invalidCredentials() {
  return ApiError.unauthorized(
    'Invalid email or password.',
    ERROR_CODES.INVALID_CREDENTIALS,
  );
}

/**
 * Authenticates a user and issues an access token.
 *
 * Unknown email, wrong password and deactivated account all produce the same
 * 401 with the same code and message. Distinguishing them would let anyone
 * discover which emails are registered, and which of those are disabled.
 *
 * @returns {Promise<{ user: object, token: string }>}
 * @throws {ApiError} 400 on malformed input, 401 on any authentication failure.
 */
export async function loginUser(payload) {
  const { email, password } = validateLoginInput(payload);

  // passwordHash is select:false on the schema, so it must be asked for
  // explicitly. This is the only query in the codebase that reads it.
  const user = await User.findOne({ email }).select('+passwordHash');

  // Always run a bcrypt comparison, even with no user, so that an unknown
  // email takes the same time as a known one. Returning early here would
  // make account enumeration possible by timing alone.
  const hashToCompare = user?.passwordHash ?? (await getDummyPasswordHash());
  const passwordMatches = await verifyPassword(password, hashToCompare);

  if (!user || !passwordMatches || !user.isActive) {
    throw invalidCredentials();
  }

  return {
    user: toPublicUser(user),
    token: signAccessToken({ id: user._id.toString() }),
  };
}

/**
 * Loads the account behind a verified token.
 *
 * The token proves who the caller was when it was issued; this re-reads the
 * account so a deletion or deactivation takes effect immediately instead of
 * waiting for the token to expire.
 *
 * @param {string} userId From requireAuth.
 * @returns {Promise<object>} The public user shape.
 * @throws {ApiError} 401 if the account no longer exists, 403 if deactivated.
 */
export async function getAuthenticatedUser(userId) {
  // A malformed id would make findById throw a CastError; treat an
  // unusable identifier as a bad token rather than a server fault.
  if (!mongoose.isValidObjectId(userId)) {
    throw ApiError.unauthorized(
      'Authentication token is invalid.',
      ERROR_CODES.AUTH_TOKEN_INVALID,
    );
  }

  const user = await User.findById(userId);

  if (!user) {
    throw ApiError.unauthorized(
      'This account no longer exists.',
      ERROR_CODES.AUTH_TOKEN_INVALID,
    );
  }

  if (!user.isActive) {
    // Safe to be specific here: the caller has already proved they hold a
    // valid token for this account, so this reveals nothing to an outsider.
    throw ApiError.forbidden('This account has been deactivated.', ERROR_CODES.ACCOUNT_INACTIVE);
  }

  return toPublicUser(user);
}
