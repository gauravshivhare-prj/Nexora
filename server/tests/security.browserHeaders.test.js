import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';

import { startTestServer } from './helpers/testServer.js';
import { buildCspHeader } from '../src/middleware/securityHeaders.js';

let server;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distHtmlPath = path.resolve(__dirname, '../../client/dist/index.html');

describe('Task 35 — Browser Security, CSP, Permissions-Policy & Subresource Integrity Suite', () => {
  before(async () => {
    server = await startTestServer('browsersec_t35');
  });

  after(async () => {
    await server.close();
  });

  describe('1. Content-Security-Policy & Defensive Directives', () => {
    it('serves Content-Security-Policy header on API responses', async () => {
      const res = await fetch(`${server.baseUrl}/api/health`);
      const csp = res.headers.get('content-security-policy');

      assert.ok(csp, 'Content-Security-Policy header must be present');
      assert.match(csp, /default-src 'self'/);
      assert.match(csp, /script-src 'self'/);
      assert.match(csp, /style-src 'self'/);
      assert.match(csp, /object-src 'none'/);
      assert.match(csp, /frame-ancestors 'none'/);
      assert.match(csp, /base-uri 'self'/);
      assert.match(csp, /form-action 'self'/);
    });

    it('buildCspHeader generates a valid CSP policy string supporting client origins', () => {
      const single = buildCspHeader('http://localhost:5173');
      assert.match(single, /connect-src 'self' http:\/\/localhost:5173/);

      const multi = buildCspHeader('http://localhost:5173, https://app.nexora.dev');
      assert.match(multi, /connect-src 'self' http:\/\/localhost:5173 https:\/\/app.nexora.dev/);
    });
  });

  describe('2. Permissions-Policy & Isolation Headers', () => {
    it('restricts browser hardware and sensor permissions via Permissions-Policy', async () => {
      const res = await fetch(`${server.baseUrl}/api/health`);
      const permissions = res.headers.get('permissions-policy');

      assert.ok(permissions, 'Permissions-Policy header must be present');
      assert.match(permissions, /camera=\(\)/);
      assert.match(permissions, /microphone=\(\)/);
      assert.match(permissions, /geolocation=\(\)/);
      assert.match(permissions, /payment=\(\)/);
    });

    it('preserves existing security invariants (nosniff, DENY, no-referrer, same-origin COOP)', async () => {
      const res = await fetch(`${server.baseUrl}/api/health`);

      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(res.headers.get('x-frame-options'), 'DENY');
      assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
      assert.equal(res.headers.get('cross-origin-opener-policy'), 'same-origin');
    });
  });

  describe('3. CSP Violation Reporting Endpoint', () => {
    it('accepts CSP violation report and returns HTTP 204 No Content', async () => {
      const cspReportPayload = {
        'csp-report': {
          'document-uri': 'http://localhost:5173/dashboard',
          'violated-directive': 'script-src',
          'blocked-uri': 'http://malicious.cdn.test/evil.js',
          'status-code': 200,
        },
      };

      const res = await fetch(`${server.baseUrl}/api/csp-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/csp-report',
        },
        body: JSON.stringify(cspReportPayload),
      });

      assert.equal(res.status, 204);
    });
  });

  describe('4. Client Subresource Integrity (SRI) Verification', () => {
    it('includes valid SHA-384 integrity attributes in production client build', () => {
      assert.ok(fs.existsSync(distHtmlPath), 'client/dist/index.html must exist from build');

      const html = fs.readFileSync(distHtmlPath, 'utf8');

      // Check for integrity attribute on script
      assert.match(
        html,
        /<script[^>]+integrity="sha384-[A-Za-z0-9+/=]+"[^>]*crossorigin="anonymous"/,
        'Production bundle scripts must carry SHA-384 SRI integrity and crossorigin attributes',
      );

      // Check for integrity attribute on stylesheet link
      assert.match(
        html,
        /<link[^>]+integrity="sha384-[A-Za-z0-9+/=]+"[^>]*crossorigin="anonymous"/,
        'Production bundle stylesheets must carry SHA-384 SRI integrity and crossorigin attributes',
      );
    });
  });
});
