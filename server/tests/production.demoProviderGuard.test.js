import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ENV_MODULE = new URL('../src/config/env.js', import.meta.url).href;
const SERVER_DIR = fileURLToPath(new URL('..', import.meta.url));

/**
 * Environment validation runs when config/env.js is first imported, so each
 * case loads it in a fresh process with a controlled environment.
 */
function loadEnvWith(overrides) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(ENV_MODULE)});`], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      MONGODB_URI: 'mongodb://127.0.0.1:27017/nexora_env_guard_test',
      JWT_SECRET: 'a'.repeat(24) + 'Zq9!vT3#mK7$wP2&xR5*nL8^',
      GEMINI_API_KEY: '',
      ...overrides,
    },
    encoding: 'utf8',
  });
}

describe('demo AI provider production guard', () => {
  it('refuses to start in production with the demo provider', () => {
    const result = loadEnvWith({ NODE_ENV: 'production', AI_PROVIDER: 'demo' });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /AI_PROVIDER "demo" is not allowed when NODE_ENV is "production"/);
  });

  it('still allows the demo provider outside production', () => {
    const result = loadEnvWith({ NODE_ENV: 'development', AI_PROVIDER: 'demo' });

    assert.equal(result.status, 0, result.stderr);
  });

  it('still allows production with AI disabled', () => {
    const result = loadEnvWith({ NODE_ENV: 'production', AI_PROVIDER: '' });

    assert.equal(result.status, 0, result.stderr);
  });
});
