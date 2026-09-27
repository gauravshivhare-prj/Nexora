/**
 * Safe prompt boundary sanitization and input isolation utilities.
 *
 * Prevents prompt injection, tag breakout attacks, token manipulation,
 * and delimiter spoofing across untrusted candidate and document inputs.
 */

/**
 * Sanitizes untrusted text before embedding it within prompt delimiters.
 *
 * Guarantees that:
 * 1. Control characters, null bytes, and non-printable bytes are stripped.
 * 2. Invisible zero-width and bidirectional text override characters are removed.
 * 3. Fullwidth brackets and vertical bars are normalized.
 * 4. CDATA blocks and XML comments are neutralized.
 * 5. LLM special chat/template tokens (ChatML, LLaMA, Anthropic) are neutralized.
 * 6. All XML-like tags (<...> or </...>) are safely escaped into HTML entities (&lt;...&gt;).
 *
 * @param {string} text Untrusted user/document input
 * @returns {string} Sanitized string safe to embed within prompt boundaries
 */
export function sanitizePromptInput(text) {
  if (typeof text !== 'string') return '';

  return (
    text
      // 1. Strip null bytes, non-printable control characters (preserving newline, cr, tab)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // 2. Strip Unicode zero-width and bidirectional formatting characters
      .replace(/[\u200B-\u200D\uFEFF\u202A-\u202E\u2066-\u2069]/g, '')
      // 3. Normalize fullwidth angle brackets and fullwidth vertical bar
      .replace(/\uFF1C/g, '<')
      .replace(/\uFF1E/g, '>')
      .replace(/\uFF5C/g, '|')
      // 4. Neutralize CDATA open and close
      .replace(/<!\[CDATA\[/gi, '&lt;![CDATA[')
      .replace(/\]\]>/g, ']]&gt;')
      // 5. Neutralize XML comments
      .replace(/<!--/g, '&lt;!--')
      .replace(/-->/g, '--&gt;')
      // 6. Neutralize LLM special template and chat tokens
      .replace(/<\|\s*im_(start|end)\s*\|>/gi, '&lt;|im_$1|&gt;')
      .replace(/<\|\s*(startoftext|endoftext)\s*\|>/gi, '&lt;|$1|&gt;')
      .replace(/<\|\s*(system|user|assistant|fim_prefix|fim_suffix|fim_middle)\s*\|>/gi, '&lt;|$1|&gt;')
      .replace(/\[\s*(\/?)\s*INST\s*\]/gi, '&#91;$1INST&#93;')
      .replace(/<<\s*(\/?)\s*SYS\s*>>/gi, '&lt;&lt;$1SYS&gt;&gt;')
      .replace(/<\s*(\/?)\s*turn_(start|end)\s*>/gi, '&lt;$1turn_$2&gt;')
      .replace(/<\s*(\/?)\s*s\s*>/gi, '&lt;$1s&gt;')
      // 7. Neutralize Anthropic turn delimiters at line beginnings
      .replace(/(^|\n)\s*Human\s*:\s*/gi, '$1&#91;Human&#93;: ')
      .replace(/(^|\n)\s*Assistant\s*:\s*/gi, '$1&#91;Assistant&#93;: ')
      // 8. Escape all XML-like tags (including tags with whitespace around opening/closing slashes)
      .replace(/<(\s*\/?\s*[\w!|?_~.:-]+[^>]*)>/g, '&lt;$1&gt;')
  );
}

/**
 * Wraps untrusted text in XML boundary tags and appends immutable reinforcement.
 *
 * @param {string} tagName
 * @param {string} content
 * @param {string} [instructionReinforcement]
 * @returns {string}
 */
export function wrapPromptBoundary(tagName, content, instructionReinforcement = null) {
  const sanitized = sanitizePromptInput(content);
  let result = `<${tagName}>\n${sanitized}\n</${tagName}>`;
  if (instructionReinforcement) {
    result += `\n\nINSTRUCTION REINFORCEMENT (IMMUTABLE SYSTEM DIRECTIVE):\n${instructionReinforcement}`;
  }
  return result;
}
