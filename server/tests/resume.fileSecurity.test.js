import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { ERROR_CODES } from '../src/constants/errorCodes.js';
import { fakePassword } from './helpers/fakeSecrets.js';
import {
  clearResumes,
  clearUsers,
  postJson,
  resetRateLimiters,
  startTestServer,
  uploadWithToken,
} from './helpers/testServer.js';
import {
  detectEmbeddedScripts,
  extractTextFromFile,
  MAX_EXTRACTED_RAW_CHARS,
} from '../src/domain/resume/extractText.js';

let server;
let counter = 0;

const TXT = 'text/plain';

const VALID_RESUME_TEXT = `Gaurav Shivhare
gaurav@example.com | +91 98765 43210 | India

EDUCATION
National Institute of Technology, B.Tech CSE, 2026, 8.8 CGPA

SKILLS
Node.js, Express, MongoDB, React, TypeScript, Docker

EXPERIENCE
Software Engineering Intern at CloudCorp
Developed high-throughput REST APIs and hardened authentication middleware.`;

describe('Task 34 — Resume File Upload, Content Hashing & Security Hardening Suite', () => {
  before(async () => {
    server = await startTestServer('filesec_t34');
  });

  after(async () => {
    await server.close();
  });

  beforeEach(async () => {
    await clearResumes();
    await clearUsers();
    resetRateLimiters();
  });

  async function registerAndLogin(name = 'Test Candidate') {
    counter += 1;
    const email = `filesec.${Date.now()}.${counter}@example.com`;
    const password = fakePassword();

    await postJson(server.baseUrl, '/api/auth/register', {
      name,
      email,
      password,
    });

    const loginRes = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password,
    });

    return {
      userId: loginRes.body.data.user.id,
      token: loginRes.body.data.token,
    };
  }

  describe('1. Content Hash & Duplicate Upload Rejection', () => {
    it('accepts initial file upload and rejects identical duplicate upload with HTTP 409', async () => {
      const { token } = await registerAndLogin('Duplicate Test');

      const filePayload = {
        buffer: Buffer.from(VALID_RESUME_TEXT, 'utf8'),
        filename: 'candidate_cv.txt',
        type: TXT,
      };

      // 1. Initial upload
      const firstRes = await uploadWithToken(server.baseUrl, '/api/resumes/upload', {
        token,
        file: filePayload,
      });

      assert.equal(firstRes.status, 201);
      assert.ok(firstRes.body.data.resume.contentHash);
      assert.ok(firstRes.body.data.resume.file.fileHash);

      // 2. Exact duplicate upload with identical name and content
      const secondRes = await uploadWithToken(server.baseUrl, '/api/resumes/upload', {
        token,
        file: filePayload,
      });

      assert.equal(secondRes.status, 409);
      assert.equal(secondRes.body.success, false);
      assert.equal(secondRes.body.errorCode, ERROR_CODES.CONFLICT);
      assert.match(secondRes.body.message, /identical resume file has already been uploaded/i);
    });

    it('permits another distinct user to upload an identical resume file (per-user boundary)', async () => {
      const userA = await registerAndLogin('User Alpha');
      const userB = await registerAndLogin('User Beta');

      const filePayload = {
        buffer: Buffer.from(VALID_RESUME_TEXT, 'utf8'),
        filename: 'shared_cv.txt',
        type: TXT,
      };

      const resA = await uploadWithToken(server.baseUrl, '/api/resumes/upload', {
        token: userA.token,
        file: filePayload,
      });
      assert.equal(resA.status, 201);

      const resB = await uploadWithToken(server.baseUrl, '/api/resumes/upload', {
        token: userB.token,
        file: filePayload,
      });
      assert.equal(resB.status, 201);
    });

    it('allows the same user to upload a revision with a different filename', async () => {
      const { token } = await registerAndLogin('Revision Test');

      const firstRes = await uploadWithToken(server.baseUrl, '/api/resumes/upload', {
        token,
        file: {
          buffer: Buffer.from(VALID_RESUME_TEXT, 'utf8'),
          filename: 'cv_v1.txt',
          type: TXT,
        },
      });
      assert.equal(firstRes.status, 201);

      const secondRes = await uploadWithToken(server.baseUrl, '/api/resumes/upload', {
        token,
        file: {
          buffer: Buffer.from(VALID_RESUME_TEXT, 'utf8'),
          filename: 'cv_v2.txt',
          type: TXT,
        },
      });
      assert.equal(secondRes.status, 201);
      assert.equal(secondRes.body.data.resume.isDuplicate, true);
    });
  });

  describe('2. Parser Crash Isolation & Timeout Guarding', () => {
    it('isolates parser timeout/crash and returns HTTP 422 without killing server', async () => {
      const simulatedTimeout = await extractTextFromFile({
        mimetype: 'text/plain',
        originalname: 'hang.txt',
        buffer: Buffer.from('simulated text'),
        _forceTimeout: true,
      });

      assert.equal(simulatedTimeout.ok, false);
      assert.equal(simulatedTimeout.statusCode, 422);
      assert.equal(simulatedTimeout.isUnprocessable, true);
      assert.match(simulatedTimeout.reason, /timed out/i);

      const simulatedCrash = await extractTextFromFile({
        mimetype: 'application/pdf',
        originalname: 'crash.pdf',
        buffer: Buffer.from('corrupted buffer'),
        _forceParserCrash: true,
      });

      assert.equal(simulatedCrash.ok, false);
      assert.equal(simulatedCrash.statusCode, 422);
      assert.equal(simulatedCrash.isUnprocessable, true);
      assert.match(simulatedCrash.reason, /parser encountered an unrecoverable failure/i);
    });
  });

  describe('3. Document Size & Decompression Bomb Defense', () => {
    it('blocks extracted text exceeding 500KB limit with HTTP 422', async () => {
      const oversizedText = 'A'.repeat(MAX_EXTRACTED_RAW_CHARS + 1024);
      const extraction = await extractTextFromFile({
        mimetype: 'text/plain',
        originalname: 'bomb.txt',
        buffer: Buffer.from(oversizedText, 'utf8'),
      });

      assert.equal(extraction.ok, false);
      assert.equal(extraction.statusCode, 422);
      assert.equal(extraction.isUnprocessable, true);
      assert.match(extraction.reason, /exceeds the maximum safety limit/i);
    });
  });

  describe('4. Embedded Script & Security Warning Detection', () => {
    it('detects embedded script patterns and records a security warning without discarding the file', async () => {
      const { token } = await registerAndLogin('Script Test Candidate');

      const xssResumeText = `${VALID_RESUME_TEXT}\n\nTECHNICAL INTERESTS:\n<script>alert("xss")</script>\nBuilding secure web applications.`;

      const res = await uploadWithToken(server.baseUrl, '/api/resumes/upload', {
        token,
        file: {
          buffer: Buffer.from(xssResumeText, 'utf8'),
          filename: 'xss_cv.txt',
          type: TXT,
        },
      });

      assert.equal(res.status, 201);
      assert.ok(res.body.data.resume.warnings.length > 0);
      assert.match(
        res.body.data.resume.warnings[0],
        /embedded script or event-handler syntax detected/i,
      );
    });

    it('detectEmbeddedScripts identifies script and event-handler patterns reliably', () => {
      assert.ok(detectEmbeddedScripts('<script>foo()</script>').length > 0);
      assert.ok(detectEmbeddedScripts('javascript:doSomething()').length > 0);
      assert.ok(detectEmbeddedScripts('<img src="x" onerror="evil()">').length > 0);
      assert.ok(detectEmbeddedScripts('<iframe src="about:blank"></iframe>').length > 0);

      // Clean text produces zero warnings
      assert.deepEqual(detectEmbeddedScripts(VALID_RESUME_TEXT), []);
    });
  });
});
