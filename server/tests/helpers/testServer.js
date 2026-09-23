import mongoose from 'mongoose';

import { createApp } from '../../src/app.js';
import { ensureModelIndexes } from '../../src/models/index.js';
import { loginLimiter, registerLimiter } from '../../src/routes/auth.routes.js';
import { generateLimiter } from '../../src/routes/careerTwin.routes.js';
import { analysisLimiter, uploadLimiter } from '../../src/routes/resume.routes.js';

/**
 * Integration-test harness.
 *
 * Runs the real Express app against a real MongoDB, because the behaviour
 * under test — unique indexes, duplicate-key handling, what actually lands in
 * the database — cannot be verified against a mock.
 */

/**
 * Resolves the test database URI.
 *
 * Refuses to run against anything not clearly marked as a test database. A
 * suite that drops collections must never be one typo away from deleting
 * development data.
 */
export function resolveTestDatabaseUri() {
  const explicit = process.env.MONGODB_URI_TEST?.trim();
  const uri = explicit || deriveTestUri(process.env.MONGODB_URI?.trim());

  if (!uri) {
    throw new Error('Set MONGODB_URI (or MONGODB_URI_TEST) before running the tests.');
  }

  const databaseName = new URL(uri).pathname.replace(/^\//, '');
  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `Refusing to run tests against database "${databaseName}": its name must end with "_test".`,
    );
  }

  return uri;
}

/** Appends "_test" to the database name of a connection string. */
function deriveTestUri(baseUri) {
  if (!baseUri) return null;

  const url = new URL(baseUri);
  const databaseName = url.pathname.replace(/^\//, '') || 'nexora';
  url.pathname = `/${databaseName}_test`;
  return url.toString();
}

/**
 * Clears all in-memory rate-limit counters so tests start from a clean slate.
 *
 * Called automatically by `startTestServer()` and should also be called in
 * `beforeEach()` hooks in any test suite that exercises rate-limited endpoints
 * — otherwise counters accumulated in earlier tests can cause unexpected 429s.
 */
export function resetRateLimiters() {
  // Every limiter in the app. A new one that is not reset here leaks
  // counters between tests, which shows up as an unrelated suite failing
  // with a 429 once it happens to run late enough.
  loginLimiter.reset();
  registerLimiter.reset();
  analysisLimiter.reset();
  uploadLimiter.reset();
  generateLimiter.reset();
}

/**
 * Connects to the test database and starts the app on an ephemeral port.
 *
 * @returns {Promise<{ baseUrl: string, close: () => Promise<void> }>}
 */
export async function startTestServer() {
  await mongoose.connect(resolveTestDatabaseUri(), { serverSelectionTimeoutMS: 5000 });
  await ensureModelIndexes();
  resetRateLimiters();

  const server = createApp().listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const { port } = server.address();

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    },
  };
}

/** Removes all users so each test starts from a known state. */
export async function clearUsers() {
  await mongoose.connection.collection('users').deleteMany({});
}

/** Removes all student profiles. Separate collection, so separate reset. */
export async function clearProfiles() {
  await mongoose.connection.collection('studentprofiles').deleteMany({});
}

/** Removes all resumes. */
export async function clearResumes() {
  await mongoose.connection.collection('resumes').deleteMany({});
}

/** Removes persisted assessment/interview results. */
export async function clearSkillEvidenceChecks() {
  return mongoose.connection.collection('skillevidencechecks').deleteMany({});
}

/** Removes persisted assessments. */
export async function clearAssessments() {
  try {
    await mongoose.connection.collection('assessments').deleteMany({});
  } catch {
    // Collection might not exist yet
  }
}

/** Removes persisted assessment attempts. */
export async function clearAssessmentAttempts() {
  try {
    await mongoose.connection.collection('assessmentattempts').deleteMany({});
  } catch {
    // Collection might not exist yet
  }
}

/**
 * POSTs a raw body so tests can send malformed JSON, not just valid objects.
 *
 * @returns {Promise<{ status: number, headers: Headers, body: unknown }>}
 */
export async function postRaw(baseUrl, path, rawBody, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: rawBody,
  });

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  return { status: response.status, headers: response.headers, body };
}

/** POSTs a JSON payload. */
export function postJson(baseUrl, path, payload) {
  return postRaw(baseUrl, path, JSON.stringify(payload));
}

/**
 * Sends a request with arbitrary headers, for exercising Authorization
 * handling.
 *
 * @returns {Promise<{ status: number, body: unknown }>}
 */
export async function requestWithHeaders(baseUrl, path, { method = 'GET', headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers });

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  return { status: response.status, body };
}

/** GETs a path with a Bearer token attached. */
export function getWithToken(baseUrl, path, token) {
  return requestWithHeaders(baseUrl, path, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/** Sends a body-less request with a Bearer token — DELETE, or a bare POST. */
export function sendWithToken(baseUrl, path, { method, token }) {
  return requestWithHeaders(baseUrl, path, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

/**
 * Sends a JSON body with a Bearer token, for the authenticated write
 * endpoints. `token` may be omitted to exercise the unauthenticated path.
 *
 * @returns {Promise<{ status: number, body: unknown }>}
 */
export async function sendJsonWithToken(baseUrl, path, { method, token, payload }) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  return { status: response.status, body };
}


/**
 * Sends a multipart form with a Bearer token, for the upload endpoint.
 *
 * Built on the platform's own FormData and Blob rather than a multipart
 * library: the boundary and the part headers are then produced by the same
 * machinery a browser uses, so the test exercises the shape the server will
 * actually receive rather than one a helper invented.
 *
 * @param {{ token?: string, file?: { buffer: Buffer, filename: string, type: string },
 *           files?: object[], fields?: Record<string, string>, fieldName?: string }} options
 */
export async function uploadWithToken(
  baseUrl,
  path,
  { token, file, files, fields = {}, fieldName = 'file' } = {},
) {
  const form = new FormData();

  for (const [key, value] of Object.entries(fields)) form.append(key, value);

  for (const part of files ?? (file ? [file] : [])) {
    form.append(
      part.fieldName ?? fieldName,
      new Blob([part.buffer], { type: part.type }),
      part.filename,
    );
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    // Content-Type is left to fetch, which appends the generated boundary.
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  return { status: response.status, body };
}
