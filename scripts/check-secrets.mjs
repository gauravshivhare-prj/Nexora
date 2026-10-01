#!/usr/bin/env node
/**
 * Fallback secret check for staged changes, used by .githooks/pre-commit
 * only when gitleaks is not installed. CI always runs gitleaks itself.
 *
 * Blocks the commit when a staged file is a real environment file, or when an
 * added line contains a credential-shaped value. Matches are never printed.
 */
import { execFileSync } from 'node:child_process';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 });

const PATTERNS = [
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/],
  ['OpenAI / Anthropic key', /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}/],
  ['GitHub token', /\bgh[pousr]_[0-9A-Za-z]{30,}/],
  ['AWS access key', /\bAKIA(?!IOSFODNN7EXAMPLE)[0-9A-Z]{16}\b/],
  ['Private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['JSON Web Token', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  [
    'Credentialed connection string',
    /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|rediss?|amqps?):\/\/[^\s:@/"'`<>]+:[^\s@/"'`<>]+@/i,
  ],
];

const problems = [];

for (const file of git('diff', '--cached', '--name-only', '--diff-filter=ACMR').split('\n').filter(Boolean)) {
  if (/(^|\/)\.env(\.|$)/.test(file) && !file.endsWith('.env.example')) {
    problems.push(`${file}: environment files must never be committed`);
  }
}

let file = null;
let line = 0;
for (const row of git('diff', '--cached', '-U0', '--no-color').split('\n')) {
  if (row.startsWith('+++ ')) {
    file = row.slice(6);
  } else if (row.startsWith('@@')) {
    line = Number(/\+(\d+)/.exec(row)?.[1] ?? 0) - 1;
  } else if (row.startsWith('+')) {
    line += 1;
    if (row.includes('gitleaks:allow')) continue;
    for (const [label, pattern] of PATTERNS) {
      if (pattern.test(row)) problems.push(`${file}:${line}: looks like a ${label}`);
    }
  }
}

if (problems.length > 0) {
  console.error('\nCommit blocked: possible secret in staged changes (values not shown).\n');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    '\nKeep real credentials in server/.env (git-ignored). In tests, use the fakes in',
    'server/tests/helpers/fakeSecrets.js. See README → "Secrets and configuration".\n',
  );
  process.exit(1);
}
