/**
 * Getting a JSON object out of a model's reply.
 *
 * Step one of the pipeline: raw text → JSON → schema validation → business
 * validation → persistence. This module does only the first arrow. It answers
 * "is this even JSON?", never "is this true?".
 *
 * Returning a result rather than throwing is deliberate. Unparseable output is
 * an ordinary, expected outcome that the caller records against the document
 * as a failed analysis — not an exception to propagate.
 */

/** Maximum response length to attempt. Beyond this the output is malfunctioning. */
const MAX_RESPONSE_CHARS = 200_000;

/**
 * Parses a model response into a plain object.
 *
 * Tolerates the two wrappers models habitually add — a ```json fence, and
 * prose either side of the object — because rejecting a correct answer over
 * its packaging would be a pointless failure. It does not tolerate anything
 * that changes the content.
 *
 * @param {string} text Raw provider output.
 * @returns {{ value: object } | { error: string }} `error` is a short reason,
 *   safe to store and to log. The text itself is never included: a resume's
 *   contents are personal data and must not leak into an error field.
 */
export function parseJsonObject(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return { error: 'The AI returned an empty response.' };
  }

  if (text.length > MAX_RESPONSE_CHARS) {
    return { error: 'The AI response was too large to process.' };
  }

  const candidate = extractObjectText(text);
  if (!candidate) {
    return { error: 'The AI response did not contain a JSON object.' };
  }

  let value;
  try {
    value = JSON.parse(candidate);
  } catch {
    return { error: 'The AI response was not valid JSON.' };
  }

  // A bare array or string is valid JSON but not the object shape every
  // caller here expects, and would fail later with a less obvious message.
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { error: 'The AI response was not a JSON object.' };
  }

  return { value };
}

/**
 * Narrows a reply to the JSON object inside it.
 *
 * Prefers a fenced block when there is one, because a model that has written
 * both an explanation and a fenced answer means the fenced part. Otherwise
 * takes the span from the first `{` to the last `}`.
 *
 * Brace-matching is deliberately not attempted: a brace inside a string value
 * would break naive counting, and JSON.parse is the authority on whether the
 * span is well-formed anyway.
 */
function extractObjectText(text) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced ? fenced[1] : text;

  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');

  if (start === -1 || end === -1 || end < start) return null;

  return body.slice(start, end + 1);
}
