import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';

import { postJson, postRaw, resolveTestDatabaseUri } from './helpers/testServer.js';

/**
 * Verifies the production error contract by running the real server with
 * NODE_ENV=production in a child process.
 *
 * It cannot be checked in-process: `isProduction` is resolved once when
 * config/env.js loads, so reassigning process.env afterwards proves nothing.
 * Booting the actual entry point also confirms the server still starts
 * cleanly with the Phase 1 configuration in place.
 */

const SERVER_ENTRY = fileURLToPath(new URL('../server.js', import.meta.url));

/** Asks the OS for a free port so parallel runs cannot collide. */
async function findFreePort() {
  const probe = createServer();
  probe.listen(0);
  await once(probe, 'listening');
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

describe('production error contract', () => {
  let child;
  let baseUrl;

  before(async () => {
    const port = await findFreePort();
    baseUrl = `http://127.0.0.1:${port}`;

    child = spawn(process.execPath, [SERVER_ENTRY], {
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: String(port),
        MONGODB_URI: resolveTestDatabaseUri(),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Wait for the real "listening" log line rather than a fixed sleep.
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Server did not start within 20s. Output:\n${output}`)),
        20_000,
      );
      let output = '';

      const onData = (chunk) => {
        output += chunk.toString();
        if (output.includes('Nexora API listening')) {
          clearTimeout(timer);
          resolve();
        }
      };

      child.stdout.on('data', onData);
      child.stderr.on('data', onData);
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Server exited early with code ${code}. Output:\n${output}`));
      });
    });
  });

  after(async () => {
    if (child && child.exitCode === null) {
      child.kill('SIGKILL');
      await once(child, 'exit');
    }
  });

  it('starts successfully in production mode', async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.environment, 'production');
  });

  it('omits the stack trace from a validation error', async () => {
    const { status, body } = await postJson(baseUrl, '/api/auth/register', {});

    assert.equal(status, 400);
    assert.equal(body.stack, undefined, 'stack trace exposed in production');
    // Field-level detail is still returned: it is the caller's own input.
    assert.equal(body.details.length, 3);
  });

  it('omits the stack trace from a malformed body', async () => {
    const { status, body } = await postRaw(baseUrl, '/api/auth/register', '{oops');

    assert.equal(status, 400);
    assert.equal(body.stack, undefined, 'stack trace exposed in production');
    assert.deepEqual(Object.keys(body).sort(), ['errorCode', 'message', 'success']);
  });

  it('omits the stack trace from a 404', async () => {
    const response = await fetch(`${baseUrl}/api/nope`);
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.stack, undefined, 'stack trace exposed in production');
  });
});
