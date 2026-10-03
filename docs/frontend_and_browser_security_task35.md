# Task 35 — Frontend Security, CSP, Permissions-Policy & Subresource Integrity

## Overview

Task 35 hardens Nexora's frontend and browser attack surface by implementing robust Content-Security-Policy (CSP) headers, restricting browser device permissions, establishing a CSP violation reporting pipeline, and automating Subresource Integrity (SRI) for production client assets.

---

## 1. Content-Security-Policy (CSP) Directives

### Implementation: `server/src/middleware/securityHeaders.js`
All HTTP responses carry a comprehensive, layered CSP header:
```http
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self' <configured-client-origins>; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

### Protection Summary:
- **`default-src 'self'`**: Locks all resource loading to the origin by default.
- **`object-src 'none'`**: Completely blocks legacy plugins, Flash, Java applets, and ActiveX objects.
- **`frame-ancestors 'none'`**: Complements `X-Frame-Options: DENY` to defend against clickjacking across all modern browsers.
- **`base-uri 'self'`**: Prevents `<base>` tag hijacking which could otherwise redirect relative URL resolutions.
- **`form-action 'self'`**: Ensures forms cannot submit data to external malicious endpoints.
- **`connect-src`**: Restricts fetch, XHR, and WebSocket destinations strictly to the current origin and configured client URLs (`env.clientUrl`).

---

## 2. Permissions-Policy & Isolation Headers

### Header: `Permissions-Policy`
Nexora explicitly disables browser hardware API access for APIs not required by a career platform:
```http
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
```

### Framing & Opener Isolation:
- **`X-Content-Type-Options: nosniff`**: Prevents MIME-confusion attacks.
- **`X-Frame-Options: DENY`**: Prohibits iframe embedding.
- **`Referrer-Policy: no-referrer`**: Prevents token or sensitive path leakage via the `Referer` header.
- **`Cross-Origin-Opener-Policy: same-origin`**: Isolates the top-level browsing context from cross-origin popups and Spectre-style side-channel leaks.

---

## 3. CSP Violation Reporting Endpoint

### Endpoint: `POST /api/csp-report`
- Accepts incoming `application/csp-report` and `application/json` violation payloads from browsers when directives are triggered.
- Sanitizes and truncates report fields (`blocked-uri`, `violated-directive`, `document-uri`).
- Emits structured warnings to `logger.warn` for observability and incident response.
- Returns `HTTP 204 No Content`.

---

## 4. Subresource Integrity (SRI)

### Implementation: `client/vite.config.js`
A zero-dependency Vite build plugin computes SHA-384 cryptographic digests over all compiled JavaScript chunks and CSS bundles during `npm run build`:
- Generates `integrity="sha384-<hash>"` attributes on all `<script type="module">`, `<link rel="modulepreload">`, and `<link rel="stylesheet">` elements in `dist/index.html`.
- Sets `crossorigin="anonymous"` on each asset to ensure browser validation succeeds.
- Protects users against tampering, CDN cache poisoning, or unauthorized proxy asset modifications.

---

## 5. Verification & Test Coverage

The implementation is verified by:
- `server/tests/security.browserHeaders.test.js`: 6 unit and integration tests verifying CSP directives, Permissions-Policy, isolation invariants, CSP reporting endpoint (204), and dist/index.html SHA-384 integrity attributes.
- `server/tests/production.configuration.test.js`: Production headers and CORS configuration.
- `server/tests/security.hardening.test.js`: Security hardening invariants.
- `server/tests/security.regressionSuite.test.js`: Security regression suite.
- `server/tests/security.idorAudit.test.js`: RBAC and authorization isolation.
- `npm run build --prefix client`: Confirms production build passes and produces SRI tags.
