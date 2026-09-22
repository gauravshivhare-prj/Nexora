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

/**
 * Reads the text out of an accepted file.
 *
 * Assumes `checkUploadedFile` has already passed — it is the caller's job to
 * run it first, and the route does.
 *
 * @param {{ originalname: string, mimetype: string, buffer: Buffer }} file
 * @returns {Promise<ExtractionSuccess|ExtractionFailure>}
 */
export async function extractTextFromFile(file) {
  const mimeType = normaliseMime(file.mimetype);

  try {
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
  } catch (error) {
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

/** DOCX. Raw text only — formatting is not part of what gets analysed. */
async function extractDocx(buffer) {
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
