import mongoose from 'mongoose';

import { createApp } from '../../src/app.js';
import { ensureModelIndexes } from '../../src/models/index.js';

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
 * Connects to the test database and starts the app on an ephemeral port.
 *
 * @returns {Promise<{ baseUrl: string, close: () => Promise<void> }>}
 */
export async function startTestServer() {
  await mongoose.connect(resolveTestDatabaseUri(), { serverSelectionTimeoutMS: 5000 });
  await ensureModelIndexes();

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

/**
 * POSTs a raw body so tests can send malformed JSON, not just valid objects.
 *
 * @returns {Promise<{ status: number, body: unknown }>}
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

  return { status: response.status, body };
}

/** POSTs a JSON payload. */
export function postJson(baseUrl, path, payload) {
  return postRaw(baseUrl, path, JSON.stringify(payload));
}
