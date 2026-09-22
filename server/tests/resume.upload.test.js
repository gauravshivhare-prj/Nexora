import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { ERROR_CODES } from '../src/constants/errorCodes.js';
import {
  PROCESSING_STATUS,
  RESUME_LIMITS,
  RESUME_SOURCES,
  UPLOAD_LIMITS,
} from '../src/constants/resumePolicy.js';
import {
  clearResumes,
  clearUsers,
  getWithToken,
  postJson,
  resetRateLimiters,
  startTestServer,
  uploadWithToken,
} from './helpers/testServer.js';

/**
 * Resume file upload.
 *
 * The cases worth covering are the ones where the client is wrong or
 * hostile: a file that is too big, a type Nexora cannot read, an extension
 * that disagrees with the declared type, bytes that are not the format they
 * claim, and someone else's resume. The happy path matters too, but mainly
 * to prove that an uploaded resume lands in the *same* shape as a pasted
 * one — if the two diverge here, every later phase has to know which it is
 * looking at.
 */

const PASSWORD = 'Str0ngPassphrase';

const RESUME_TEXT = `Gaurav Shivhare
gaurav@example.com | +91 98765 43210 | Bhopal

EDUCATION
Maulana Azad National Institute of Technology, B.Tech CSE, 2027, 8.4 CGPA

SKILLS
Node.js, Express, MongoDB, React

PROJECTS
Nexora - a career readiness platform built with React and Express.`;

const TXT = 'text/plain';
const PDF = 'application/pdf';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * A minimal but genuine one-page PDF containing `text`.
 *
 * Hand-assembled rather than fixture-loaded so the test suite carries no
 * binary blobs, and so a reader can see exactly what the parser is being
 * given. The offsets in the xref table have to be real — a PDF with a
 * broken xref is precisely the "corrupt file" case, and it is built
 * separately below.
 */
function buildPdf(text) {
  const escaped = text.replace(/([()\\])/g, '\\$1');
  const stream = `BT /F1 12 Tf 20 700 Td (${escaped}) Tj ET`;

  const objects = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    `<</Length ${stream.length}>>stream\n${stream}\nendstream`,
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [];

  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj${body}endobj\n`;
  });

  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;

  return Buffer.from(pdf, 'latin1');
}

/**
 * A real .docx — a zip with the one part mammoth reads.
 *
 * Written by hand with stored (uncompressed) entries so the suite needs no
 * zip library. A .docx is an OPC package; this is the smallest one that is
 * still genuinely a Word document rather than something shaped like one.
 */
function buildDocx(text) {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const files = [
    {
      name: '[Content_Types].xml',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '</Types>',
    },
    {
      name: '_rels/.rels',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '</Relationships>',
    },
    {
      name: 'word/document.xml',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
        escaped
          .split('\n')
          .map((line) => `<w:p><w:r><w:t xml:space="preserve">${line}</w:t></w:r></w:p>`)
          .join('') +
        '</w:body></w:document>',
    },
  ];

  return zipStored(files);
}

/** Builds a zip archive using stored (method 0) entries. */
function zipStored(files) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const data = Buffer.from(file.content, 'utf8');
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    chunks.push(local, name, data);

    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt16LE(0, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(data.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt16LE(0, 30);
    header.writeUInt16LE(0, 32);
    header.writeUInt16LE(0, 34);
    header.writeUInt16LE(0, 36);
    header.writeUInt32LE(0, 38);
    header.writeUInt32LE(offset, 42);

    central.push(header, name);
    offset += local.length + name.length + data.length;
  }

  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, centralBuffer, end]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ -1) >>> 0;
}

describe('resume file upload', () => {
  let server;
  let baseUrl;
  let counter = 0;

  before(async () => {
    server = await startTestServer();
    baseUrl = server.baseUrl;
  });

  after(async () => {
    await server.close();
  });

  beforeEach(async () => {
    await clearResumes();
    await clearUsers();
    resetRateLimiters();
  });

  /**
   * Registers a fresh account and returns its token.
   *
   * Registration does not issue one — only login does — so this is two
   * calls, matching how resume.test.js does it.
   */
  async function signUp() {
    counter += 1;
    const email = `upload.${Date.now()}.${counter}@example.com`;

    await postJson(baseUrl, '/api/auth/register', {
      name: 'Gaurav Shivhare',
      email,
      password: PASSWORD,
    });

    const { body } = await postJson(baseUrl, '/api/auth/login', { email, password: PASSWORD });

    return body.data.token;
  }

  const uploadTxt = (token, text = RESUME_TEXT, filename = 'resume.txt') =>
    uploadWithToken(baseUrl, '/api/resumes/upload', {
      token,
      file: { buffer: Buffer.from(text, 'utf8'), filename, type: TXT },
    });

  // ------------------------------------------------------------- ownership

  it('refuses an unauthenticated upload', async () => {
    const { status, body } = await uploadWithToken(baseUrl, '/api/resumes/upload', {
      file: { buffer: Buffer.from(RESUME_TEXT), filename: 'resume.txt', type: TXT },
    });

    assert.equal(status, 401);
    assert.equal(body.errorCode, ERROR_CODES.AUTH_TOKEN_MISSING);
  });

  it('refuses an upload with a rubbish token', async () => {
    const { status } = await uploadWithToken(baseUrl, '/api/resumes/upload', {
      token: 'not-a-real-token',
      file: { buffer: Buffer.from(RESUME_TEXT), filename: 'resume.txt', type: TXT },
    });

    assert.equal(status, 401);
  });

  it('does not let one student read another student’s uploaded resume', async () => {
    const owner = await signUp();
    const stranger = await signUp();

    const { body } = await uploadTxt(owner);
    const resumeId = body.data.resume.id;

    const { status, body: denied } = await getWithToken(
      baseUrl,
      `/api/resumes/${resumeId}`,
      stranger,
    );

    // The same 404 an absent resume produces: "not yours" and "not there"
    // must be indistinguishable, or the API becomes an id oracle.
    assert.equal(status, 404);
    assert.equal(denied.errorCode, ERROR_CODES.RESUME_NOT_FOUND);
  });

  // ------------------------------------------------------------ valid files

  it('accepts a plain text file and stores its text', async () => {
    const token = await signUp();
    const { status, body } = await uploadTxt(token);

    assert.equal(status, 201);

    const resume = body.data.resume;
    assert.equal(resume.source, RESUME_SOURCES.FILE_UPLOAD);
    assert.equal(resume.extraction.status, PROCESSING_STATUS.COMPLETED);
    assert.equal(resume.analysis.status, PROCESSING_STATUS.PENDING);
    assert.equal(resume.file.originalName, 'resume.txt');
    assert.ok(resume.file.sizeBytes > 0);
    assert.match(resume.extractedText, /Maulana Azad/);
    assert.match(resume.extractedText, /Node\.js/);
  });

  it('accepts a PDF and reads the text out of it', async () => {
    const token = await signUp();

    const { status, body } = await uploadWithToken(baseUrl, '/api/resumes/upload', {
      token,
      file: { buffer: buildPdf(RESUME_TEXT.replace(/\n/g, ' ')), filename: 'cv.pdf', type: PDF },
    });

    assert.equal(status, 201);
    assert.match(body.data.resume.extractedText, /Gaurav Shivhare/);
    // The library's "-- 1 of 1 --" page separators must not be stored as
    // resume content, or grounding would treat them as the student's words.
    assert.doesNotMatch(body.data.resume.extractedText, /-- \d+ of \d+ --/);
  });

  it('accepts a .docx and reads the text out of it', async () => {
    const token = await signUp();

    const { status, body } = await uploadWithToken(baseUrl, '/api/resumes/upload', {
      token,
      file: { buffer: buildDocx(RESUME_TEXT), filename: 'cv.docx', type: DOCX },
    });

    assert.equal(status, 201);
    assert.match(body.data.resume.extractedText, /Gaurav Shivhare/);
  });

  it('stores an optional label alongside the file', async () => {
    const token = await signUp();

    const { status, body } = await uploadWithToken(baseUrl, '/api/resumes/upload', {
      token,
      file: { buffer: Buffer.from(RESUME_TEXT), filename: 'resume.txt', type: TXT },
      fields: { label: 'Backend internships' },
    });

    assert.equal(status, 201);
    assert.equal(body.data.resume.label, 'Backend internships');
  });

  it('lands in the same shape as a pasted resume', async () => {
    const token = await signUp();

    const uploaded = (await uploadTxt(token)).body.data.resume;
    const pasted = (await fetchJson(baseUrl, '/api/resumes', token, { text: RESUME_TEXT }))
      .body.data.resume;

    const shapeOf = (resume) => Object.keys(resume).sort();

    // Identical key sets. If the two ever diverge, every later phase has to
    // know which way a resume arrived before it can read one.
    assert.deepEqual(shapeOf(uploaded), shapeOf(pasted));

    // And the only values that differ are the two that describe provenance.
    assert.equal(pasted.source, RESUME_SOURCES.PASTED_TEXT);
    assert.equal(uploaded.source, RESUME_SOURCES.FILE_UPLOAD);
    assert.equal(pasted.file.originalName, null);
    assert.equal(uploaded.file.originalName, 'resume.txt');
    assert.equal(pasted.extraction.status, uploaded.extraction.status);
    assert.equal(pasted.analysis.status, uploaded.analysis.status);
  });

  // ---------------------------------------------------------- invalid files

  it('rejects a file type it cannot read', async () => {
    const token = await signUp();

    const { status, body } = await uploadWithToken(baseUrl, '/api/resumes/upload', {
      token,
      file: {
        buffer: Buffer.from('MZ\x90\x00binary'),
        filename: 'resume.exe',
        type: 'application/x-msdownload',
      },
    });

    assert.equal(status, 400);
    assert.equal(body.errorCode, ERROR_CODES.VALIDATION_ERROR);
    assert.match(JSON.stringify(body.details), /not supported/);
  });

  it('rejects a file whose extension disagrees with its declared type', async () => {
    const token = await signUp();

    // An executable wearing a PDF content type. Either signal alone is
    // client-controlled; requiring them to agree costs an attacker one more
    // step and costs an honest student nothing.
    const { status, body } = await uploadWithToken(baseUrl, '/api/resumes/upload', {
      token,
      file: { buffer: Buffer.from('MZ\x90\x00binary'), filename: 'payload.exe', type: PDF },
    });

    assert.equal(status, 400);
    assert.match(JSON.stringify(body.details), /ends in/);
  });

  it('rejects bytes that are not the format they claim', async () => {
    const token = await signUp();

    // Correct name, correct MIME type, contents that are not a PDF. This is
    // the case the first two gates cannot catch, and the parser is what
    // catches it — without throwing a 500.
    const { status, body } = await uploadWithToken(baseUrl, '/api/resumes/upload', {
      token,
      file: { buffer: Buffer.from('this is definitely not a pdf'), filename: 'cv.pdf', type: PDF },
    });

    assert.equal(status, 400);
    assert.match(JSON.stringify(body.details), /could not be read|corrupt/);
  });

  it('rejects a corrupt PDF without a server error', async () => {
    const token = await signUp();

    const truncated = buildPdf('Hello').subarray(0, 40);
    const { status } = await uploadWithToken(baseUrl, '/api/resumes/upload', {
      token,
      file: { buffer: truncated, filename: 'cv.pdf', type: PDF },
    });

    assert.equal(status, 400, 'a malformed document produced a server error');
  });

  it('rejects an empty file', async () => {
    const token = await signUp();

    const { status, body } = await uploadWithToken(baseUrl, '/api/resumes/upload', {
      token,
      file: { buffer: Buffer.alloc(0), filename: 'resume.txt', type: TXT },
    });

    assert.equal(status, 400);
    assert.match(JSON.stringify(body.details), /empty/);
  });

  it('rejects a file with too little text to be a resume', async () => {
    const token = await signUp();
    const { status, body } = await uploadTxt(token, 'Too short.');

    assert.equal(status, 400);
    assert.match(JSON.stringify(body.details), new RegExp(`${RESUME_LIMITS.text.min}`));
  });

  it('rejects a text file that is not valid UTF-8', async () => {
    const token = await signUp();

    const { status, body } = await uploadWithToken(baseUrl, '/api/resumes/upload', {
      token,
      file: { buffer: Buffer.from([0xff, 0xfe, 0x00, 0x80, 0x81]), filename: 'r.txt', type: TXT },
    });

    assert.equal(status, 400);
    assert.match(JSON.stringify(body.details), /UTF-8|empty|too little/i);
  });

  it('rejects a request with no file at all', async () => {
    const token = await signUp();

    const { status, body } = await uploadWithToken(baseUrl, '/api/resumes/upload', {
      token,
      fields: { label: 'No file here' },
    });

    assert.equal(status, 400);
    assert.match(JSON.stringify(body.details ?? body.message), /No file was received/);
  });

  it('rejects a file sent under the wrong field name', async () => {
    const token = await signUp();

    const { status } = await uploadWithToken(baseUrl, '/api/resumes/upload', {
      token,
      fieldName: 'resume',
      file: { buffer: Buffer.from(RESUME_TEXT), filename: 'resume.txt', type: TXT },
    });

    assert.equal(status, 400);
  });

  // ------------------------------------------------------------- oversize

  it('rejects a file over the size limit', async () => {
    const token = await signUp();

    const oversized = Buffer.alloc(UPLOAD_LIMITS.maxBytes + 1024, 'a');
    const { status, body } = await uploadWithToken(baseUrl, '/api/resumes/upload', {
      token,
      file: { buffer: oversized, filename: 'huge.txt', type: TXT },
    });

    assert.equal(status, 400);
    assert.match(JSON.stringify(body), /larger than/);
  });

  it('truncates an over-long document rather than refusing it', async () => {
    const token = await signUp();

    // Under the byte limit, over the stored-text limit. The student has
    // done nothing wrong, so the readable part is kept.
    const long = `${RESUME_TEXT}\n${'x'.repeat(RESUME_LIMITS.text.max)}`;
    const { status, body } = await uploadTxt(token, long);

    assert.equal(status, 201);
    assert.equal(body.data.resume.textLength, RESUME_LIMITS.text.max);
  });

  // -------------------------------------------------------------- limits

  it('counts uploads against the per-user resume limit', async () => {
    const token = await signUp();

    for (let i = 0; i < RESUME_LIMITS.perUser; i += 1) {
      const { status } = await uploadTxt(token, RESUME_TEXT, `resume-${i}.txt`);
      assert.equal(status, 201, `upload ${i} was rejected`);
    }

    const { status, body } = await uploadTxt(token);
    assert.equal(status, 409);
    assert.equal(body.errorCode, ERROR_CODES.CONFLICT);
  });

  // -------------------------------------------- the pasted flow is intact

  it('still accepts pasted text, and still refuses a claimed file source', async () => {
    const token = await signUp();

    const { body: created } = await uploadWithToken(baseUrl, '/api/resumes/upload', {
      token,
      file: { buffer: Buffer.from(RESUME_TEXT), filename: 'resume.txt', type: TXT },
    });
    assert.equal(created.data.resume.source, RESUME_SOURCES.FILE_UPLOAD);

    const { status, body } = await fetchJson(baseUrl, '/api/resumes', token, {
      text: RESUME_TEXT,
      label: 'Pasted',
    });
    assert.equal(status, 201);
    assert.equal(body.data.resume.source, RESUME_SOURCES.PASTED_TEXT);
    assert.equal(body.data.resume.file.originalName, null);

    // A JSON body still cannot claim to be an upload: source is set from
    // the fact that a file arrived, never from what the client said.
    const { status: rejected, body: refusal } = await fetchJson(baseUrl, '/api/resumes', token, {
      text: RESUME_TEXT,
      source: RESUME_SOURCES.FILE_UPLOAD,
    });
    assert.equal(rejected, 400);
    assert.match(JSON.stringify(refusal.details), /File upload is not available yet|pasted_text/);
  });
});

/** POSTs JSON with a token. Local to this file; the shared helper shadows it. */
async function fetchJson(baseUrl, path, token, payload) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });

  return { status: response.status, body: await response.json() };
}
