import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Boots the whole stack for an end-to-end run: the real backend, the real
 * Vite dev server and a real headless Chrome.
 *
 * Nothing is mocked. These tests are about whether the browser, the token
 * and the API actually agree with each other, which a mocked fetch could
 * never tell us.
 */

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SERVER_DIR = join(REPO_ROOT, 'server');
const CLIENT_DIR = join(REPO_ROOT, 'client');

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

export function findChrome() {
  const found = CHROME_CANDIDATES.find((path) => existsSync(path));
  if (!found) {
    throw new Error(
      `No Chrome or Edge found. Looked in:\n${CHROME_CANDIDATES.join('\n')}`,
    );
  }
  return found;
}

/** Asks the OS for a free port, so parallel runs cannot collide. */
export async function findFreePort() {
  const probe = createServer();
  probe.listen(0);
  await once(probe, 'listening');
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

/** Resolves once a child's output contains `marker`, else throws with the log. */
function waitForOutput(child, marker, label, timeoutMs = 60_000) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(
      () => reject(new Error(`${label} did not start in ${timeoutMs}ms. Output:\n${output}`)),
      timeoutMs,
    );

    const onData = (chunk) => {
      output += chunk.toString();
      if (output.includes(marker)) {
        clearTimeout(timer);
        resolve();
      }
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`${label} exited early (code ${code}). Output:\n${output}`));
    });
  });
}

/**
 * Reads one key out of server/.env.
 *
 * The client has no dotenv dependency and does not need one: this is the
 * only value it borrows, and only when running tests.
 */
function readServerEnv(key) {
  const envPath = join(SERVER_DIR, '.env');
  if (!existsSync(envPath)) return null;

  const line = readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith(`${key}=`));

  return line ? line.slice(key.length + 1).trim() || null : null;
}

/**
 * Derives a dedicated e2e database, so the run never touches development
 * data and never collides with the backend suite's own `_test` database.
 */
function testDatabaseUri() {
  const explicit = process.env.MONGODB_URI_TEST?.trim();
  if (explicit) return explicit;

  const base = process.env.MONGODB_URI?.trim() || readServerEnv('MONGODB_URI');
  if (!base) {
    throw new Error(
      'No MongoDB connection string found. Set MONGODB_URI, or MONGODB_URI_TEST, or fill in server/.env.',
    );
  }

  const url = new URL(base);
  const name = url.pathname.replace(/^\//, '') || 'nexora';
  url.pathname = `/${name}_e2e_test`;
  return url.toString();
}

/**
 * Drops the e2e database so a run leaves nothing behind.
 *
 * Uses mongoose from the server package, in a child process, so the client
 * needs no database dependency of its own. Refuses anything not named
 * `_test`, and never fails the suite over cleanup.
 */
async function dropTestDatabase(uri) {
  const script = `
    const mongoose = require('mongoose');
    (async () => {
      const uri = process.argv[1];
      const name = new URL(uri).pathname.replace(/^\\//, '');
      if (!name.endsWith('_test')) throw new Error('refusing to drop ' + name);
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    })();
  `;

  const child = spawn(process.execPath, ['-e', script, uri], {
    cwd: SERVER_DIR,
    stdio: 'ignore',
  });
  await once(child, 'exit').catch(() => {});
}

/**
 * Starts backend + frontend + browser.
 *
 * @returns {Promise<{ apiUrl, appUrl, debugPort, mongoUri, stop }>}
 */
export async function startStack() {
  const apiPort = await findFreePort();
  const webPort = await findFreePort();
  const debugPort = await findFreePort();

  const apiUrl = `http://localhost:${apiPort}`;
  const appUrl = `http://localhost:${webPort}`;
  const mongoUri = testDatabaseUri();

  const children = [];
  const chromeProfile = mkdtempSync(join(tmpdir(), 'nexora-e2e-'));

  async function stop() {
    for (const child of children.reverse()) {
      if (child.exitCode === null) {
        child.kill('SIGKILL');
        await once(child, 'exit').catch(() => {});
      }
      // Piped stdio keeps the parent's event loop alive even after the child
      // is gone, so the runner would never exit. Release the handles.
      child.stdout?.destroy();
      child.stderr?.destroy();
    }
    rmSync(chromeProfile, { recursive: true, force: true });
    await dropTestDatabase(mongoUri);
  }

  try {
    // The backend must allow the Vite origin, or every request fails CORS.
    const api = spawn(process.execPath, ['server.js'], {
      cwd: SERVER_DIR,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        PORT: String(apiPort),
        CLIENT_URL: appUrl,
        MONGODB_URI: mongoUri,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(api);
    await waitForOutput(api, 'Nexora API listening', 'Backend');

    // Vite's JS entry is launched directly rather than through npx or a
    // shell. A shell wrapper makes the real Vite process a grandchild that
    // child.kill() cannot reach on Windows, leaving it alive with its stdio
    // pipe attached — which holds the test runner's event loop open forever.
    //
    // VITE_-prefixed variables are read from the environment, so the client
    // talks to this run's backend rather than whatever client/.env says.
    const web = spawn(
      process.execPath,
      [join(CLIENT_DIR, 'node_modules/vite/bin/vite.js'), '--port', String(webPort), '--strictPort'],
      {
        cwd: CLIENT_DIR,
        env: { ...process.env, VITE_API_URL: apiUrl },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    children.push(web);
    await waitForOutput(web, 'ready in', 'Vite dev server');

    const chrome = spawn(
      findChrome(),
      [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        `--remote-debugging-port=${debugPort}`,
        `--user-data-dir=${chromeProfile}`,
        'about:blank',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    children.push(chrome);

    return { apiUrl, appUrl, debugPort, mongoUri, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
