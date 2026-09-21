import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

import { ERROR_CODES } from '../src/constants/errorCodes.js';
import { clearUsers, postJson, postRaw, startTestServer } from './helpers/testServer.js';

const VALID_PAYLOAD = {
  name: 'Gaurav Shivhare',
  email: 'gaurav@example.com',
  password: 'Str0ngPassphrase',
};

/** Reads a user straight from MongoDB, bypassing the model's select rules. */
function findRawUser(email) {
  return mongoose.connection.collection('users').findOne({ email });
}

/** Asserts a response carries a validation failure for one field. */
function assertFieldRejected(response, field) {
  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.equal(response.body.errorCode, ERROR_CODES.VALIDATION_ERROR);
  assert.ok(
    response.body.details?.some((detail) => detail.field === field),
    `expected a validation error for "${field}", got ${JSON.stringify(response.body.details)}`,
  );
}

describe('POST /api/auth/register', () => {
  let server;

  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.close();
  });

  beforeEach(async () => {
    await clearUsers();
  });

  it('creates an account and returns the public user', async () => {
    const { status, body } = await postJson(server.baseUrl, '/api/auth/register', VALID_PAYLOAD);

    assert.equal(status, 201);
    assert.equal(body.success, true);
    assert.equal(body.message, 'Registration successful');

    const { user } = body.data;
    assert.equal(user.name, VALID_PAYLOAD.name);
    assert.equal(user.email, VALID_PAYLOAD.email);
    assert.equal(user.role, 'student');
    assert.equal(user.isActive, true);
    assert.ok(user.id, 'expected an id');
    assert.ok(user.createdAt, 'expected createdAt');
  });

  it('never returns the password or its hash', async () => {
    const { body } = await postJson(server.baseUrl, '/api/auth/register', VALID_PAYLOAD);

    const serialised = JSON.stringify(body);
    assert.ok(!serialised.includes(VALID_PAYLOAD.password), 'plaintext password leaked');
    assert.ok(!serialised.includes('passwordHash'), 'passwordHash key leaked');
    assert.ok(!serialised.includes('$2'), 'a bcrypt hash leaked');
    assert.deepEqual(Object.keys(body.data.user).sort(), [
      'createdAt',
      'email',
      'id',
      'isActive',
      'name',
      'role',
    ]);
  });

  it('stores a bcrypt hash, never the plaintext password', async () => {
    await postJson(server.baseUrl, '/api/auth/register', VALID_PAYLOAD);

    const stored = await findRawUser(VALID_PAYLOAD.email);
    assert.ok(stored, 'user was not persisted');
    assert.notEqual(stored.passwordHash, VALID_PAYLOAD.password);
    assert.match(stored.passwordHash, /^\$2[aby]\$\d{2}\$/, 'not a bcrypt hash');
    assert.equal(await bcrypt.compare(VALID_PAYLOAD.password, stored.passwordHash), true);

    // No stray plaintext field anywhere on the document.
    assert.equal(stored.password, undefined);
    assert.ok(
      !JSON.stringify(stored).includes(VALID_PAYLOAD.password),
      'plaintext password found in the stored document',
    );
  });

  it('normalises email case and surrounding whitespace', async () => {
    const { status, body } = await postJson(server.baseUrl, '/api/auth/register', {
      ...VALID_PAYLOAD,
      email: '  GAURAV@Example.COM  ',
    });

    assert.equal(status, 201);
    assert.equal(body.data.user.email, 'gaurav@example.com');
    assert.ok(await findRawUser('gaurav@example.com'));
  });

  it('trims the name but not the password', async () => {
    const password = '  Str0ngPassphrase  ';
    const { status, body } = await postJson(server.baseUrl, '/api/auth/register', {
      name: '  Gaurav Shivhare  ',
      email: 'spaced@example.com',
      password,
    });

    assert.equal(status, 201);
    assert.equal(body.data.user.name, 'Gaurav Shivhare');

    // Spaces are part of the secret; stripping them would change it.
    const stored = await findRawUser('spaced@example.com');
    assert.equal(await bcrypt.compare(password, stored.passwordHash), true);
    assert.equal(await bcrypt.compare(password.trim(), stored.passwordHash), false);
  });

  it('rejects a duplicate email with 409', async () => {
    await postJson(server.baseUrl, '/api/auth/register', VALID_PAYLOAD);
    const { status, body } = await postJson(server.baseUrl, '/api/auth/register', VALID_PAYLOAD);

    assert.equal(status, 409);
    assert.equal(body.success, false);
    assert.equal(body.errorCode, ERROR_CODES.EMAIL_ALREADY_REGISTERED);
    assert.equal(body.message, 'An account with this email already exists.');
  });

  it('treats a differently-cased duplicate as the same account', async () => {
    await postJson(server.baseUrl, '/api/auth/register', VALID_PAYLOAD);
    const { status } = await postJson(server.baseUrl, '/api/auth/register', {
      ...VALID_PAYLOAD,
      email: 'GAURAV@EXAMPLE.COM',
    });

    assert.equal(status, 409);
    assert.equal(await mongoose.connection.collection('users').countDocuments(), 1);
  });

  it('lets only one of several concurrent identical registrations win', async () => {
    // The unique index, not an application-level check, is what makes this
    // safe. A findOne()-then-create() would let several requests through.
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        postJson(server.baseUrl, '/api/auth/register', VALID_PAYLOAD),
      ),
    );

    const created = results.filter((r) => r.status === 201);
    const conflicted = results.filter((r) => r.status === 409);

    assert.equal(created.length, 1, `expected exactly one 201, got ${created.length}`);
    assert.equal(conflicted.length, 4);
    assert.equal(await mongoose.connection.collection('users').countDocuments(), 1);
  });

  it('rejects a missing name', async () => {
    const { name, ...withoutName } = VALID_PAYLOAD;
    assertFieldRejected(await postJson(server.baseUrl, '/api/auth/register', withoutName), 'name');
  });

  it('rejects a blank name', async () => {
    assertFieldRejected(
      await postJson(server.baseUrl, '/api/auth/register', { ...VALID_PAYLOAD, name: '   ' }),
      'name',
    );
  });

  it('rejects a missing email', async () => {
    const { email, ...withoutEmail } = VALID_PAYLOAD;
    assertFieldRejected(
      await postJson(server.baseUrl, '/api/auth/register', withoutEmail),
      'email',
    );
  });

  it('rejects malformed emails', async () => {
    for (const email of ['not-an-email', 'missing@domain', 'two@@at.com', 'spa ce@example.com']) {
      const response = await postJson(server.baseUrl, '/api/auth/register', {
        ...VALID_PAYLOAD,
        email,
      });
      assertFieldRejected(response, 'email');
    }
  });

  it('rejects a missing password', async () => {
    const { password, ...withoutPassword } = VALID_PAYLOAD;
    assertFieldRejected(
      await postJson(server.baseUrl, '/api/auth/register', withoutPassword),
      'password',
    );
  });

  it('rejects weak passwords', async () => {
    const weak = [
      'Ab1',              // too short
      'password',         // no digit
      '12345678',         // no letter
      'A1'.repeat(40),    // 80 bytes: bcrypt would silently truncate
    ];

    for (const password of weak) {
      const response = await postJson(server.baseUrl, '/api/auth/register', {
        ...VALID_PAYLOAD,
        password,
      });
      assertFieldRejected(response, 'password');
    }
  });

  it('reports every invalid field at once', async () => {
    const { body } = await postJson(server.baseUrl, '/api/auth/register', {
      name: '',
      email: 'nope',
      password: 'x',
    });

    assert.deepEqual(
      body.details.map((d) => d.field).sort(),
      ['email', 'name', 'password'],
    );
  });

  it('rejects malformed JSON with 400', async () => {
    const { status, body } = await postRaw(
      server.baseUrl,
      '/api/auth/register',
      '{"name":"Gaurav","email":',
    );

    assert.equal(status, 400);
    assert.equal(body.success, false);
    assert.equal(body.errorCode, ERROR_CODES.MALFORMED_REQUEST);
  });

  it('rejects a bare JSON string body as malformed', async () => {
    // express.json() runs in strict mode, so a top-level primitive never
    // reaches the service — it is rejected as a malformed body.
    const { status, body } = await postRaw(server.baseUrl, '/api/auth/register', '"just a string"');

    assert.equal(status, 400);
    assert.equal(body.success, false);
    assert.equal(body.errorCode, ERROR_CODES.MALFORMED_REQUEST);
  });

  it('rejects a JSON array body as invalid input', async () => {
    // Arrays *are* accepted by express.json(), so this exercises the
    // service's own non-object guard rather than the body parser's.
    const { status, body } = await postRaw(server.baseUrl, '/api/auth/register', '[1,2,3]');

    assert.equal(status, 400);
    assert.equal(body.errorCode, ERROR_CODES.VALIDATION_ERROR);
    assert.deepEqual(
      body.details.map((d) => d.field).sort(),
      ['email', 'name', 'password'],
    );
  });

  it('rejects an empty JSON body', async () => {
    const { status, body } = await postRaw(server.baseUrl, '/api/auth/register', '{}');

    assert.equal(status, 400);
    assert.equal(body.errorCode, ERROR_CODES.VALIDATION_ERROR);
    assert.equal(body.details.length, 3);
  });

  it('ignores client-supplied role and isActive', async () => {
    // Privilege escalation: registering as an admin must be impossible.
    const { status, body } = await postJson(server.baseUrl, '/api/auth/register', {
      ...VALID_PAYLOAD,
      role: 'admin',
      isActive: false,
      _id: '0123456789abcdef01234567',
    });

    assert.equal(status, 201);
    assert.equal(body.data.user.role, 'student');
    assert.equal(body.data.user.isActive, true);

    const stored = await findRawUser(VALID_PAYLOAD.email);
    assert.equal(stored.role, 'student');
    assert.equal(stored.isActive, true);
    assert.notEqual(stored._id.toString(), '0123456789abcdef01234567');
  });

  it('returns 503 without leaking internals when the database is unavailable', async () => {
    await mongoose.disconnect();
    try {
      const { status, body } = await postJson(
        server.baseUrl,
        '/api/auth/register',
        { ...VALID_PAYLOAD, email: 'dbdown@example.com' },
      );

      assert.equal(status, 503);
      assert.equal(body.success, false);
      assert.equal(body.errorCode, ERROR_CODES.DATABASE_ERROR);
      assert.equal(body.message, 'Database is currently unavailable');

      // The client-facing fields name no driver, collection or host. The
      // dev-only `stack` field does, which is why production suppresses it —
      // proven separately in tests/production.errors.test.js.
      assert.ok(!body.message.toLowerCase().includes('mongo'));
      assert.ok(!body.errorCode.toLowerCase().includes('mongo'));
    } finally {
      // Restore the connection for teardown.
      const { resolveTestDatabaseUri } = await import('./helpers/testServer.js');
      await mongoose.connect(resolveTestDatabaseUri(), { serverSelectionTimeoutMS: 5000 });
    }
  });
});

describe('Phase 0 regression', () => {
  let server;

  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.close();
  });

  it('GET /api/health still works', async () => {
    const response = await fetch(`${server.baseUrl}/api/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.message, 'Nexora API is healthy');
  });

  it('an unknown route still returns a controlled 404', async () => {
    const response = await fetch(`${server.baseUrl}/api/does-not-exist`);
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.success, false);
    assert.equal(body.errorCode, ERROR_CODES.NOT_FOUND);
  });

  it('GET /api/auth/register is not allowed', async () => {
    const response = await fetch(`${server.baseUrl}/api/auth/register`);
    assert.equal(response.status, 404);
  });
});
