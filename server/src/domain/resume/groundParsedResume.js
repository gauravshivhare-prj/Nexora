/**
 * Business validation for AI-parsed resume data.
 *
 * Step three of the pipeline: raw text → JSON → schema validation →
 * **business validation** → persistence. Schema validation asked whether the
 * response had the right shape. This asks a harder question: is any of it
 * actually in the resume?
 *
 * The check is simple and it is the point of the whole module. A model asked
 * to extract skills from a backend CV will sometimes add Docker or Kubernetes
 * because CVs like that usually mention them. That invention would become a
 * skill the student never claimed, feeding a career match, a skill gap and a
 * roadmap built on something that was never true. So every value a later
 * phase may treat as evidence must be found in the source text, and anything
 * that is not is dropped and recorded.
 *
 * What is **not** grounded, and why:
 *
 *  - Descriptions and achievement lines are summaries. A model rewording
 *    three bullet points into one sentence is doing its job, and requiring a
 *    verbatim match would delete every one of them. They are stored as
 *    model-written prose and no later phase may read them as evidence.
 *  - Dates and grades are printed in too many forms ("Jan 2024", "January
 *    2024", "First Class", "8.4/10") for a text match to mean anything.
 *
 * This catches invention, not misreading. A model that attributes a real
 * skill to the wrong project still passes, because every word it used is in
 * the document. Grounding raises the floor; it is not a correctness proof.
 */

/**
 * @param {object} parsed Output of validateParsedResume — already shape-checked.
 * @param {string} sourceText The resume text the analysis ran on.
 * @returns {{ value: object, warnings: string[] }}
 */
export function groundParsedResume(parsed, sourceText) {
  const context = buildContext(sourceText);
  const warnings = [];

  /** Keeps a value only if it appears in the resume. */
  const keep = (value, path) => {
    if (value === null || value === undefined) return null;
    if (isGrounded(value, context)) return value;

    // The dropped value is named because it is the student's own document
    // talking, it is what makes the warning actionable, and the whole point
    // is to be able to see what the model invented.
    warnings.push(`Dropped ${path} "${value}": it does not appear in the resume.`);
    return null;
  };

  const keepAll = (values, path) =>
    values.filter((value, index) => keep(value, `${path}[${index}]`) !== null);

  return {
    value: {
      basics: {
        ...parsed.basics,
        fullName: keep(parsed.basics.fullName, 'basics.fullName'),
        email: keep(parsed.basics.email, 'basics.email'),
        phone: groundPhone(parsed.basics.phone, context, warnings),
        // Location is often normalised by a model ("Bhopal, MP" → "Bhopal,
        // Madhya Pradesh"), so it is kept as written rather than dropped.
        links: keepAll(parsed.basics.links, 'basics.links'),
      },

      education: parsed.education.map((entry, index) => ({
        ...entry,
        institution: keep(entry.institution, `education[${index}].institution`),
      })),

      // The set that matters most: these become claimed skills downstream.
      skills: parsed.skills.filter(
        (skill, index) => keep(skill.name, `skills[${index}].name`) !== null,
      ),

      projects: parsed.projects.map((entry, index) => ({
        ...entry,
        title: keep(entry.title, `projects[${index}].title`),
        technologies: keepAll(entry.technologies, `projects[${index}].technologies`),
      })),

      experience: parsed.experience.map((entry, index) => ({
        ...entry,
        organisation: keep(entry.organisation, `experience[${index}].organisation`),
      })),

      certifications: parsed.certifications.map((entry, index) => ({
        ...entry,
        name: keep(entry.name, `certifications[${index}].name`),
      })),

      achievements: parsed.achievements,
    },
    warnings,
  };
}

/**
 * Pre-computes the two views of the resume that matching needs, once per
 * analysis rather than once per value.
 */
function buildContext(sourceText) {
  const lowered = String(sourceText ?? '').toLowerCase();

  return {
    /** Letters and digits only, so "Node.js" and "NodeJS" compare equal. */
    compact: compact(lowered),

    /**
     * Whole words, keeping `+` and `#` so "c++" and "c#" survive as tokens.
     * Used for very short names, where a substring match is meaningless.
     */
    tokens: new Set(
      lowered
        .split(/\s+/)
        .map((token) => token.replace(/^[^a-z0-9+#]+|[^a-z0-9+#]+$/g, ''))
        .filter(Boolean),
    ),

    digits: lowered.replace(/\D/g, ''),
  };
}

/**
 * Whether a value appears in the resume.
 *
 * Two strategies, because one does not fit both ends of the range:
 *
 *  - Three characters or more: compare with punctuation and spacing removed,
 *    so "Node.js" matches "NodeJS" and "React Native" matches "react-native".
 *    A model rewriting a name's punctuation is not inventing it.
 *  - One or two characters: require a whole-word match. "C" and "R" and "Go"
 *    are real skills, and a substring test would find "C" inside "Computer"
 *    and confirm anything.
 */
function isGrounded(value, context) {
  const text = String(value).trim().toLowerCase();
  if (text === '') return false;

  const compacted = compact(text);
  if (compacted === '') return false;

  if (compacted.length >= 3) return context.compact.includes(compacted);

  return context.tokens.has(text);
}

/**
 * A phone number, compared as digits only.
 *
 * "+91 98765 43210" and "+919876543210" are the same number written twice,
 * and a literal match would reject the model for reformatting it.
 */
function groundPhone(phone, context, warnings) {
  if (!phone) return null;

  const digits = phone.replace(/\D/g, '');
  // Fewer than seven digits is not a phone number, so there is nothing to
  // confirm; treating it as grounded would let any short string through.
  if (digits.length >= 7 && context.digits.includes(digits)) return phone;

  warnings.push(`Dropped basics.phone "${phone}": it does not appear in the resume.`);
  return null;
}

function compact(text) {
  return text.replace(/[^a-z0-9]/g, '');
}
