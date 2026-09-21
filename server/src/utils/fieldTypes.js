/**
 * Field checkers for structured request bodies.
 *
 * validation.js deliberately stopped at three primitives while the API surface
 * was "a name, an email and a password". The Student Profile is the phase that
 * outgrew them: it has nested objects, arrays of objects, numbers with ranges
 * and dates. This module is that promised revisit.
 *
 * A schema library would also do the job. It is not used because its failure
 * shape would then have to be translated back into ours on every endpoint, and
 * the rules below are ordinary enough not to earn a dependency.
 *
 * Contract: every checker returns `{ value }` or `{ error }` and never throws.
 * The caller collects failures and reports them together, so one request tells
 * the client about every problem rather than the first one.
 */

/**
 * True for the values a client may send to mean "this field is not set".
 *
 * `null` is included on purpose: under the merge semantics used by the profile
 * endpoint, an explicit null is how a client *clears* a previously saved field.
 * Callers distinguish "absent" (leave alone) from "blank" (clear) before
 * reaching a checker.
 */
export function isBlank(raw) {
  return raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '');
}

/** True only for a plain object — not an array, not null. */
export function isPlainObject(raw) {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw);
}

/**
 * A trimmed string within length bounds, optionally matching a pattern.
 *
 * @param {unknown} raw
 * @param {{ max: number, min?: number, pattern?: RegExp, patternMessage?: string }} rules
 */
export function checkString(raw, { max, min = 1, pattern, patternMessage } = {}) {
  if (typeof raw !== 'string') return { error: 'Must be text' };

  const value = raw.trim();

  if (value.length < min) return { error: `Must be at least ${min} characters` };
  if (value.length > max) return { error: `Must be at most ${max} characters` };
  if (pattern && !pattern.test(value)) {
    return { error: patternMessage ?? 'Format is invalid' };
  }

  return { value };
}

/** One of a fixed set of values. The allowed set is echoed back so the client can correct it. */
export function checkEnum(raw, allowed) {
  if (typeof raw !== 'string') return { error: `Must be one of: ${allowed.join(', ')}` };

  const value = raw.trim().toLowerCase();
  if (!allowed.includes(value)) return { error: `Must be one of: ${allowed.join(', ')}` };

  return { value };
}

/**
 * A whole number within an inclusive range.
 *
 * Numeric strings are accepted because HTML number inputs submit strings, but
 * only when they represent the integer exactly — "3.5" and "3abc" are refused
 * rather than silently truncated to 3.
 */
export function checkInteger(raw, { min, max }) {
  const value = typeof raw === 'string' ? Number(raw.trim()) : raw;

  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return { error: 'Must be a whole number' };
  }
  if (value < min || value > max) return { error: `Must be between ${min} and ${max}` };

  return { value };
}

/**
 * A decimal number within an inclusive range, rounded to a fixed precision.
 *
 * Rounding happens here rather than at display time so the stored value and
 * the shown value can never disagree.
 */
export function checkNumber(raw, { min, max, decimals = 2 }) {
  const parsed = typeof raw === 'string' ? Number(raw.trim()) : raw;

  // Number('') is 0 and Number(true) is 1; neither is a number the client sent.
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) {
    return { error: 'Must be a number' };
  }
  if (parsed < min || parsed > max) return { error: `Must be between ${min} and ${max}` };

  const factor = 10 ** decimals;
  return { value: Math.round(parsed * factor) / factor };
}

/**
 * A calendar date, accepted as "YYYY-MM-DD" or a full ISO timestamp.
 *
 * Anchored to UTC midnight so a profile saved in one timezone reads back as
 * the same day in another — a birth date is a calendar fact, not an instant.
 *
 * @param {{ notBefore?: Date, notAfter?: Date, rangeMessage?: string }} [rules]
 */
export function checkDate(raw, { notBefore, notAfter, rangeMessage } = {}) {
  if (typeof raw !== 'string') return { error: 'Must be a date in YYYY-MM-DD form' };

  const text = raw.trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);

  if (!dateOnly && !/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    return { error: 'Must be a date in YYYY-MM-DD form' };
  }

  const value = new Date(dateOnly ? `${text}T00:00:00.000Z` : text);

  // Date accepts "2024-02-31" and rolls it forward to 2 March. Comparing the
  // parsed day back to the input catches that instead of storing a date the
  // client never typed.
  if (Number.isNaN(value.getTime())) return { error: 'Is not a real date' };
  if (dateOnly && value.toISOString().slice(0, 10) !== text) {
    return { error: 'Is not a real date' };
  }

  if ((notBefore && value < notBefore) || (notAfter && value > notAfter)) {
    return { error: rangeMessage ?? 'Is outside the allowed range' };
  }

  return { value };
}

/**
 * An absolute http(s) URL.
 *
 * Restricted to those two schemes deliberately: `javascript:` and `data:` URLs
 * parse successfully and would be stored, then rendered into an href — which
 * is a stored-XSS vector the moment a profile becomes shareable.
 */
export function checkUrl(raw, { max }) {
  if (typeof raw !== 'string') return { error: 'Must be a link' };

  const text = raw.trim();
  if (text.length > max) return { error: `Must be at most ${max} characters` };

  let url;
  try {
    url = new URL(text);
  } catch {
    return { error: 'Must be a valid link starting with http:// or https://' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { error: 'Must be a valid link starting with http:// or https://' };
  }

  return { value: text };
}

/**
 * A list of non-empty strings.
 *
 * Blank entries are dropped rather than rejected — a trailing empty row in a
 * tag input is a UI artefact, not something worth failing a save over.
 * Duplicates are removed case-insensitively, keeping the first spelling the
 * student used.
 *
 * @param {{ maxItems: number, maxLength: number }} rules
 */
export function checkStringArray(raw, { maxItems, maxLength }) {
  if (!Array.isArray(raw)) return { error: 'Must be a list' };
  if (raw.length > maxItems) return { error: `Must have at most ${maxItems} entries` };

  const value = [];
  const seen = new Set();

  for (const entry of raw) {
    if (isBlank(entry)) continue;

    const checked = checkString(entry, { max: maxLength });
    if (checked.error) return { error: `Each entry: ${lowerFirst(checked.error)}` };

    const key = checked.value.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    value.push(checked.value);
  }

  return { value };
}

/**
 * Every key of `input` that is not in `allowed`, as dotted paths.
 *
 * Unrecognised keys are reported rather than ignored. A client sending a
 * misspelled field would otherwise get a 200 and believe the value was saved,
 * and a client sending an ownership field such as `user` would get a 200 that
 * looks like it was honoured.
 *
 * @param {string} [prefix] Parent path. Omit at the root.
 * @returns {string[]}
 */
export function unknownKeyPaths(input, allowed, prefix) {
  return Object.keys(input)
    .filter((key) => !allowed.includes(key))
    .map((key) => (prefix ? `${prefix}.${key}` : key));
}

/** Joins a checker message into a sentence fragment without a stray capital. */
function lowerFirst(message) {
  return message.charAt(0).toLowerCase() + message.slice(1);
}
