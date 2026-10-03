# Task 33 — API Security, Request Tracing, Response Timing & Declarative Validation

## Overview

Task 33 enhances Nexora's HTTP layer with production-grade distributed tracing, observability headers, and declarative request-body schema validation while preserving existing invariants and error envelope consistency.

---

## 1. Request ID & Distributed Tracing

### Middleware: `src/middleware/requestId.js`
- **Correlation ID Assignment**: Every incoming request is assigned a unique `req.id`.
- **Client Passthrough & Sanitization**: If the client supplies an `X-Request-Id` header matching `/^[a-zA-Z0-9_-]{1,64}$/`, it is preserved. If the client ID is missing or contains invalid characters (newlines, delimiters, script tags) or exceeds 64 characters, it is safely substituted with `crypto.randomUUID()`.
- **Response Header**: Emits `X-Request-Id: <req.id>` on every response.
- **Error Body Propagation**: `errorHandler.js` includes `requestId: req.id` directly in the client-facing error envelope (`{ success: false, message, errorCode, requestId, ... }`), enabling immediate correlation between frontend error reports and backend server logs.
- **Log Correlation**: Both `requestLogger.js` and `errorHandler.js` prepend `[${req.id}]` to log entries.

---

## 2. Response Timing & API Versioning

### Middleware: `src/middleware/responseTiming.js`
- **High-Precision Performance Measurement**: Uses `process.hrtime.bigint()` to measure request processing duration in sub-millisecond precision.
- **Response Headers**:
  - `X-API-Version: 1.0.0`: Declares the stable API contract version.
  - `X-Response-Time: <ms>ms`: Injected via `res.writeHead` interceptor before headers are committed.
- **Slow Request Detection**: Listens on response `finish`. Any request taking $\ge 2000\text{ms}$ automatically logs a warning:
  `Slow request detected: [<req.id>] GET /api/path took 2154.2ms`
- **CORS Exposure**: `app.js` configures `cors` to expose `X-Request-Id`, `X-Response-Time`, `X-API-Version`, and `Retry-After` in `Access-Control-Expose-Headers`.

---

## 3. Declarative Schema Validation Middleware

### Middleware: `src/middleware/validateBody.js`
Provides a clean, declarative alternative to ad-hoc controller validation without introducing heavy external runtime dependencies:

```javascript
import { validateBody } from '../middleware/validateBody.js';

router.post('/example', validateBody({
  name: { type: 'string', required: true, minLength: 2, maxLength: 50 },
  role: { type: 'string', enum: ['student', 'admin'] },
  age: { type: 'number' },
  customCode: {
    custom: (val, body) => val === 'VALID' ? true : 'Invalid code supplied'
  }
}, { allowUnknown: false }));
```

### Capabilities:
- **Type Checking**: Validates `string`, `number`, `boolean`, `array`, `object`.
- **Required Fields**: Rejects missing or blank fields (`required: true`).
- **Length Bounds**: Enforces `minLength` and `maxLength` on strings.
- **Enumerations**: Validates against allowed sets (`enum: [...]`).
- **Custom Functions**: Accepts `(value, body) => boolean | string` for contextual or domain rules.
- **Unknown Field Rejection**: Configurable via `allowUnknown: false` (default) to block prototype pollution and unexpected payload smuggling.
- **Batch Error Collection**: Integrates directly with `ValidationCollector` so all validation failures are collected and returned in a single HTTP 400 response with structured `details: [{ field, message }]`.

---

## 4. Verification & Regression Coverage

The implementation is verified by:
- `server/tests/apiSecurity.validation.test.js`: 14 unit and integration tests covering UUID generation, client passthrough, malformed ID replacement, timing headers, error envelope tracing, schema validation, and CORS exposure.
- `server/tests/validation.payloadLimits.test.js`: Payload limit regression suite.
- `server/tests/security.hardening.test.js`: Core security invariants.
- `server/tests/security.regressionSuite.test.js`: Security regression tests.
- `server/tests/security.idorAudit.test.js`: RBAC and authorization isolation.
