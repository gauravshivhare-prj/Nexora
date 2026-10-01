#!/usr/bin/env node
/**
 * Installs the pinned gitleaks release into .tools/ for the git hooks.
 *
 * Runs from `npm install` (the `prepare` script) so every clone gets the
 * scanner the pre-push hook requires. The archive's SHA-256 is checked
 * against the release's published checksums before anything is extracted.
 *
 * Never fails `npm install`: if the download is impossible (offline, proxy),
 * it says so, and the pre-push hook will refuse pushes until it succeeds.
 * Re-run with `node scripts/install-gitleaks.mjs`.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '8.30.1';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS = join(ROOT, '.tools');
const BINARY = join(TOOLS, process.platform === 'win32' ? 'gitleaks.exe' : 'gitleaks');

function assetName() {
  const arch = { x64: 'x64', arm64: 'arm64' }[process.arch];
  const os = { win32: 'windows', linux: 'linux', darwin: 'darwin' }[process.platform];
  if (!arch || !os) throw new Error(`no gitleaks build for ${process.platform}/${process.arch}`);
  return `gitleaks_${VERSION}_${os}_${arch}.${os === 'windows' ? 'zip' : 'tar.gz'}`;
}

function installedVersion() {
  try {
    return execFileSync(BINARY, ['version'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

async function download(url) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  if (installedVersion() === VERSION) return;

  const asset = assetName();
  const base = `https://github.com/gitleaks/gitleaks/releases/download/v${VERSION}`;
  const [archive, checksums] = await Promise.all([
    download(`${base}/${asset}`),
    download(`${base}/gitleaks_${VERSION}_checksums.txt`).then(String),
  ]);

  const expected = checksums
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .find(([, name]) => name === asset)?.[0];
  const actual = createHash('sha256').update(archive).digest('hex');
  if (!expected || expected !== actual) {
    throw new Error(`checksum mismatch for ${asset}; refusing to install`);
  }

  mkdirSync(TOOLS, { recursive: true });
  const archivePath = join(TOOLS, asset);
  writeFileSync(archivePath, archive);
  try {
    // Windows ships bsdtar (reads .zip) in System32; a Git Bash GNU tar on PATH
    // cannot. Relative names avoid "C:" being read as a remote host.
    const systemTar = process.env.SystemRoot && join(process.env.SystemRoot, 'System32', 'tar.exe');
    const tar = process.platform === 'win32' && systemTar && existsSync(systemTar) ? systemTar : 'tar';
    execFileSync(tar, ['-xf', asset, process.platform === 'win32' ? 'gitleaks.exe' : 'gitleaks'], { cwd: TOOLS });
  } finally {
    rmSync(archivePath, { force: true });
  }

  if (installedVersion() !== VERSION) throw new Error('installed binary did not run');
  console.log(`gitleaks ${VERSION} installed in .tools/ (checksum verified).`);
}

main().catch((error) => {
  console.warn(`\n[secret-scan] gitleaks could not be installed: ${error.message}`);
  console.warn('[secret-scan] Pushes are blocked until it is. Retry: node scripts/install-gitleaks.mjs\n');
  // Deliberately not a failing exit: npm install must still work offline.
  // The pre-push hook is what fails closed.
});
