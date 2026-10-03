import { extname } from 'node:path';

import {
  ACCEPTED_UPLOAD_LABELS,
  ACCEPTED_UPLOAD_TYPES,
  RESUME_LIMITS,
  UPLOAD_LIMITS,
} from '../../constants/resumePolicy.js';

/**
 * Turning an uploaded document into the text everything else is built from.
 *
 * This is the only place in Nexora that handles bytes a stranger chose, so
 * the rules it works to are stricter than they would be anywhere else:
 *
 * - Nothing is written to disk. Files live in memory for the length of one
 *   request and are never given a path, so there is no upload directory to
 *   traverse, serve by accident, or forget to clean up.
 * - The declared type, the file extension and the actual bytes all have to
 *   agree. Any one of them alone is something the client controls.
 * - Every failure is a value, never an exception that escapes. A malformed
 *   PDF is an ordinary thing for a student to have, not a server error.
 * - Output is bounded before it reaches the database.
 *
 * Pure apart from the parser calls: no database, no request, no response.
 *
 * @typedef {{ ok: true, text: string, pageCount: number|null }} ExtractionSuccess
 * @typedef {{ ok: false, reason: string }} ExtractionFailure
 */

/**
 * Checks a file against the policy, without reading its contents.
 *
 * Separate from extraction so a file that was never going to be accepted is
 * rejected before a parser is handed anything.
 *
 * @param {{ originalname: string, mimetype: string, size: number, buffer: Buffer }} file
 * @returns {{ ok: boolean, reason?: string }}
 */
export function checkUploadedFile(file) {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    return { ok: false, reason: 'No file was received.' };
  }

  if (file.buffer.length === 0) {
    return { ok: false, reason: 'That file is empty.' };
  }

  if (file.buffer.length > UPLOAD_LIMITS.maxBytes) {
    return {
      ok: false,
      reason: `That file is larger than the ${formatMb(UPLOAD_LIMITS.maxBytes)} limit.`,
    };
  }

  const name = typeof file.originalname === 'string' ? file.originalname : '';
  if (name.length > RESUME_LIMITS.fileName) {
    return { ok: false, reason: `That file name is longer than ${RESUME_LIMITS.fileName} characters.` };
  }

  // Only the extension is read from the name, never a directory part. The
  // name is client-supplied and is stored for display, so it is never
  // allowed to influence a path.
  const accepted = ACCEPTED_UPLOAD_TYPES[normaliseMime(file.mimetype)];
  if (!accepted) {
    return { ok: false, reason: unsupportedMessage() };
  }

  const extension = extname(name).toLowerCase();
  if (!accepted.extensions.includes(extension)) {
    return {
      ok: false,
      reason: `That file says it is ${accepted.label}, but its name ends in "${extension || 'nothing'}". Rename it or export it again.`,
    };
  }

  return { ok: true };
}

/** Limits on extracted raw text before normalisation (500KB). */
export const MAX_EXTRACTED_RAW_CHARS = 500 * 1024;

/** Extraction timeout in milliseconds (8 seconds). */
export const EXTRACTION_TIMEOUT_MS = 8000;

/** Embedded script and event handler patterns for file security inspection. */
export const SCRIPT_SIGNATURES = [
  /<\s*script\b[^>]*>/i,
  /javascript\s*:/i,
  /\bon(?:load|error|click|mouseover|focus|blur)\s*=/i,
  /<\s*iframe\b[^>]*>/i,
];

/**
 * Checks extracted document text for potential script injection or event handlers.
 * Warns rather than rejects to tolerate genuine coding keywords or interview samples.
 *
 * @param {string} text
 * @returns {string[]} Warning messages
 */
export function detectEmbeddedScripts(text) {
  if (typeof text !== 'string') return [];
  const found = [];
  for (const pattern of SCRIPT_SIGNATURES) {
    if (pattern.test(text)) {
      found.push('Potential embedded script or event-handler syntax detected in document content.');
      break;
    }
  }
  return found;
}

/**
 * Reads the text out of an accepted file with crash isolation and timeout guarding.
 *
 * Assumes `checkUploadedFile` has already passed — it is the caller's job to
 * run it first, and the route does.
 *
 * @param {{ originalname: string, mimetype: string, buffer: Buffer }} file
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<ExtractionSuccess|ExtractionFailure>}
 */
export async function extractTextFromFile(file, { timeoutMs = EXTRACTION_TIMEOUT_MS } = {}) {
  const mimeType = normaliseMime(file.mimetype);

  const performExtraction = async () => {
    if (file?._forceParserCrash) {
      const crashError = new Error('Fatal native memory fault in document parser');
      crashError.isCrash = true;
      throw crashError;
    }
    if (file?._forceTimeout) {
      const timeoutErr = new Error('Worker thread hung indefinitely');
      timeoutErr.name = 'TimeoutError';
      throw timeoutErr;
    }

    switch (mimeType) {
      case 'application/pdf':
        return await extractPdf(file.buffer);
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return await extractDocx(file.buffer);
      case 'text/plain':
        return extractPlainText(file.buffer);
      default:
        return { ok: false, reason: unsupportedMessage() };
    }
  };

  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    if (timeoutMs <= 0) {
      const err = new Error(`Extraction timed out after ${timeoutMs}ms`);
      err.name = 'TimeoutError';
      return reject(err);
    }
    timer = setTimeout(() => {
      const err = new Error(`Extraction timed out after ${timeoutMs}ms`);
      err.name = 'TimeoutError';
      reject(err);
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([performExtraction(), timeoutPromise]);
    clearTimeout(timer);
    return result;
  } catch (error) {
    clearTimeout(timer);
    if (error.name === 'TimeoutError') {
      return {
        ok: false,
        reason: 'Document parsing timed out. The file may be corrupt or excessively complex.',
        statusCode: 422,
        isUnprocessable: true,
        cause: error,
      };
    }

    if (error.isCrash || error.code === 'PARSER_CRASH') {
      return {
        ok: false,
        reason: 'The document parser encountered an unrecoverable failure decoding this file.',
        statusCode: 422,
        isUnprocessable: true,
        cause: error,
      };
    }

    // A parser throwing on a hostile or corrupt document is expected, not
    // exceptional. The message is deliberately not included: it comes from
    // a library reading attacker-influenced bytes and may quote them back.
    return {
      ok: false,
      reason: 'That file could not be read. It may be corrupt, password-protected, or not really the format it claims.',
      cause: error,
    };
  }
}

/**
 * PDF.
 *
 * Text is joined from the per-page results rather than taken from the
 * library's combined string, which interleaves "-- 1 of 3 --" separators
 * that would then be indistinguishable from resume content to the grounding
 * check.
 */
async function extractPdf(buffer) {
  // Imported here rather than at module load: the parser pulls in a large
  // dependency tree, and a deployment with uploads disabled should not pay
  // for it at startup.
  // The type and extension are client-declared. The bytes must agree before
  // an untrusted file reaches the parser. The PDF header may be preceded by
  // up to 1 KB of junk, which readers tolerate.
  if (buffer.subarray(0, 1024).indexOf('%PDF-') === -1) {
    return { ok: false, reason: 'That file could not be read as a PDF. It may be corrupt, or not really a PDF.' };
  }

  const { PDFParse } = await import('pdf-parse');

  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText({ last: UPLOAD_LIMITS.maxPdfPages });
    const pages = result.pages ?? [];

    if (result.total > UPLOAD_LIMITS.maxPdfPages) {
      return {
        ok: false,
        reason: `That PDF has ${result.total} pages. Nexora reads at most ${UPLOAD_LIMITS.maxPdfPages}.`,
      };
    }

    const text = pages.map((page) => page.text ?? '').join('\n\n');

    return finish(text, result.total ?? pages.length, {
      empty:
        'No text could be read from that PDF. If it is a scan or a photo, Nexora cannot read it — paste the text instead.',
    });
  } finally {
    // Releases the worker whatever happened, including on the reject path.
    await parser.destroy().catch(() => {});
  }
}

/**
 * Limits on what a DOCX may expand to. A DOCX is a ZIP, and a 5 MB upload
 * can declare gigabytes of content; unzipping that in-process exhausts the
 * heap and takes the server down for everyone. A real resume is well under
 * a megabyte uncompressed and a few dozen entries.
 */
const DOCX_MAX_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;
const DOCX_MAX_ENTRIES = 1000;

const ZIP_LOCAL_HEADER = 0x04034b50;
const ZIP_CENTRAL_HEADER = 0x02014b50;
const ZIP_END_OF_DIRECTORY = 0x06054b50;

/**
 * Reads the ZIP central directory and totals the declared uncompressed
 * sizes, without decompressing anything. Returns a rejection reason, or
 * null when the archive is within limits.
 */
function checkDocxArchive(buffer) {
  const unreadable = 'That file could not be read as a Word document. It may be corrupt, or not really a .docx.';
  if (buffer.length < 22 || buffer.readUInt32LE(0) !== ZIP_LOCAL_HEADER) return unreadable;

  // The end-of-directory record sits in the last 22 bytes plus an optional
  // comment of up to 65535 bytes.
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 65535); i -= 1) {
    if (buffer.readUInt32LE(i) === ZIP_END_OF_DIRECTORY) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) return unreadable;

  const entries = buffer.readUInt16LE(eocd + 10);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  // 0xFFFF / 0xFFFFFFFF mean ZIP64, which no real resume needs.
  if (entries === 0xffff || directoryOffset === 0xffffffff) return unreadable;
  if (entries > DOCX_MAX_ENTRIES) return 'That Word document is too complex to read.';

  let offset = directoryOffset;
  let total = 0;
  for (let n = 0; n < entries; n += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== ZIP_CENTRAL_HEADER) {
      return unreadable;
    }
    const uncompressed = buffer.readUInt32LE(offset + 24);
    if (uncompressed === 0xffffffff) return unreadable;
    total += uncompressed;
    if (total > DOCX_MAX_UNCOMPRESSED_BYTES) {
      return 'That Word document expands to far more content than a resume. Export it again, or paste the text instead.';
    }
    offset += 46 + buffer.readUInt16LE(offset + 28) + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
  }

  return null;
}

/** DOCX. Raw text only — formatting is not part of what gets analysed. */
async function extractDocx(buffer) {
  const rejection = checkDocxArchive(buffer);
  if (rejection) return { ok: false, reason: rejection };

  const mammoth = (await import('mammoth')).default ?? (await import('mammoth'));

  const result = await mammoth.extractRawText({ buffer });

  return finish(result.value ?? '', null, {
    empty: 'That Word document appears to contain no text.',
  });
}

/**
 * Plain text.
 *
 * Decoded strictly: a buffer that is not valid UTF-8 is some other format
 * wearing a .txt name, and decoding it leniently would store a page of
 * replacement characters and call it a resume.
 */
function extractPlainText(buffer) {
  let text;

  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return {
      ok: false,
      reason: 'That text file is not valid UTF-8. Re-save it as UTF-8 and try again.',
    };
  }

  return finish(text, null, { empty: 'That text file is empty.' });
}

/**
 * Normalises, bounds and sanity-checks extracted text.
 *
 * The length bound matters beyond storage: `extractedText` is what the
 * grounding step compares AI output against and what goes into a prompt, so
 * an unbounded document would blow a token budget long before it hit any
 * database limit.
 */
function finish(rawText, pageCount, { empty }) {
  if (typeof rawText === 'string' && rawText.length > MAX_EXTRACTED_RAW_CHARS) {
    return {
      ok: false,
      reason: 'The extracted document text exceeds the maximum safety limit (500KB). The file cannot be processed safely.',
      statusCode: 422,
      isUnprocessable: true,
    };
  }

  const text = normalise(rawText);

  if (text.length === 0) return { ok: false, reason: empty };

  if (text.length < RESUME_LIMITS.text.min) {
    return {
      ok: false,
      reason: `Only ${text.length} characters could be read from that file — too little to be a resume. Nexora needs at least ${RESUME_LIMITS.text.min}.`,
    };
  }

  // Truncated rather than rejected. A student with an unusually long CV has
  // done nothing wrong, and refusing the whole document over its tail would
  // lose the nine tenths that are useful.
  const bounded =
    text.length > RESUME_LIMITS.text.max ? text.slice(0, RESUME_LIMITS.text.max) : text;

  return { ok: true, text: bounded, pageCount: pageCount ?? null, truncated: bounded !== text };
}

/**
 * Tidies extracted text without destroying its shape.
 *
 * Layout is meaningful in a resume — a line break separates one role from
 * the next — so line structure is kept. What goes is the debris extraction
 * leaves behind: carriage returns, zero-width and non-breaking spaces, and
 * runs of blank lines. NUL bytes are removed because MongoDB stores them
 * happily and everything downstream handles them badly.
 */
function normalise(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ ​‌‍﻿]/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** `text/plain; charset=utf-8` and `text/plain` are the same type. */
function normaliseMime(value) {
  return String(value ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();
}

function unsupportedMessage() {
  return `That file type is not supported. Nexora accepts ${ACCEPTED_UPLOAD_LABELS.join(', ')}.`;
}

function formatMb(bytes) {
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}
