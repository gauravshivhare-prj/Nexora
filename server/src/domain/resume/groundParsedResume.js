import { canonicalSkill } from '../skills/skillKey.js';
import { resolveCanonicalSkill } from '../skills/skillOntology.js';

/**
 * Business validation for AI-parsed resume data (Task 05 Grounding & Traceability).
 *
 * Every value that a later phase may treat as evidence must be found in the
 * source text. In Task 05, this is enhanced to produce full provenance
 * traceability: exact offsets in the source text, canonical skill IDs, and
 * explicit 'claimed' evidence tier attribution.
 *
 * @param {object} parsed Output of validateParsedResume — already shape-checked.
 * @param {string} sourceText The resume text the analysis ran on.
 * @returns {{ value: object, provenanceIndex: Array<object>, warnings: string[] }}
 */
export function groundParsedResume(parsed, sourceText) {
  const context = buildContext(sourceText);
  const warnings = [];
  const provenanceIndex = [];

  /** Keeps a value only if it appears in the resume. */
  const keep = (value, path, entityType = 'general') => {
    if (value === null || value === undefined) return null;
    if (isGrounded(value, context)) {
      const span = findSpanInText(sourceText, value);
      provenanceIndex.push({
        entityType,
        name: String(value),
        matchedText: span?.matchedText || String(value),
        startOffset: span?.startOffset ?? null,
        endOffset: span?.endOffset ?? null,
        evidenceTier: 'claimed',
      });
      return value;
    }

    warnings.push(`Dropped ${path} "${value}": it does not appear in the resume.`);
    return null;
  };

  const keepAll = (values, path, entityType = 'link') =>
    values.filter((value, index) => keep(value, `${path}[${index}]`, entityType) !== null);

  const keepCanonicalSkill = (value, path) => {
    if (value === null || value === undefined) return null;
    if (!isSkillGrounded(value, context)) {
      warnings.push(`Dropped ${path} "${value}": it does not appear in the resume.`);
      return null;
    }

    const canonical = resolveCanonicalSkill(value) || canonicalSkill(value);
    if (canonical) {
      const span = findSpanInText(sourceText, value) || findSpanInText(sourceText, canonical.name);
      provenanceIndex.push({
        entityType: 'skill',
        name: canonical.name,
        canonicalSkillId: canonical.id || null,
        matchedText: span?.matchedText || value,
        startOffset: span?.startOffset ?? null,
        endOffset: span?.endOffset ?? null,
        evidenceTier: 'claimed',
      });
      return {
        name: canonical.name,
        canonicalSkillId: canonical.id || null,
        evidenceTier: 'claimed',
      };
    }

    warnings.push(`Dropped ${path} "${value}": it is not in the canonical skill taxonomy.`);
    return null;
  };

  const keepCanonicalSkills = (values, path) =>
    values
      .map((value, index) => {
        const res = keepCanonicalSkill(value, `${path}[${index}]`);
        return res ? res.name : null;
      })
      .filter((value) => value !== null);

  return {
    value: {
      basics: {
        ...parsed.basics,
        fullName: keep(parsed.basics.fullName, 'basics.fullName', 'basics.fullName'),
        email: keep(parsed.basics.email, 'basics.email', 'basics.email'),
        phone: groundPhone(parsed.basics.phone, context, warnings),
        links: keepAll(parsed.basics.links, 'basics.links', 'basics.link'),
      },

      education: parsed.education.map((entry, index) => ({
        ...entry,
        institution: keep(entry.institution, `education[${index}].institution`, 'education.institution'),
      })),

      // The set that matters most: these become claimed skills downstream.
      skills: parsed.skills
        .map((skill, index) => {
          const res = keepCanonicalSkill(skill.name, `skills[${index}].name`);
          return res ? { ...skill, name: res.name } : null;
        })
        .filter(Boolean),

      projects: parsed.projects.map((entry, index) => ({
        ...entry,
        title: keep(entry.title, `projects[${index}].title`, 'projects.title'),
        technologies: keepCanonicalSkills(entry.technologies, `projects[${index}].technologies`),
      })),

      experience: parsed.experience.map((entry, index) => ({
        ...entry,
        organisation: keep(entry.organisation, `experience[${index}].organisation`, 'experience.organisation'),
      })),

      certifications: parsed.certifications.map((entry, index) => ({
        ...entry,
        name: keep(entry.name, `certifications[${index}].name`, 'certifications.name'),
      })),

      achievements: parsed.achievements,
    },
    provenanceIndex,
    warnings,
  };
}

/**
 * Finds the exact text span in sourceText for a given fact/substring.
 */
export function findSpanInText(sourceText, targetStr) {
  if (!sourceText || !targetStr) return null;
  const rawLower = sourceText.toLowerCase();
  const targetLower = targetStr.toLowerCase().trim();
  const idx = rawLower.indexOf(targetLower);
  if (idx !== -1) {
    return {
      matchedText: sourceText.slice(idx, idx + targetLower.length),
      startOffset: idx,
      endOffset: idx + targetLower.length,
    };
  }

  // Try compact match if target has punctuation or spacing variation (e.g. Node.js vs NodeJS)
  const targetCompact = targetLower.replace(/[^a-z0-9]/g, '');
  if (targetCompact.length >= 3) {
    const rawTokens = sourceText.split(/[\s,;|/]+/);
    let offset = 0;
    for (const token of rawTokens) {
      const tokenPos = sourceText.indexOf(token, offset);
      if (tokenPos !== -1) {
        offset = tokenPos + token.length;
        if (token.toLowerCase().replace(/[^a-z0-9]/g, '') === targetCompact) {
          return {
            matchedText: token,
            startOffset: tokenPos,
            endOffset: tokenPos + token.length,
          };
        }
      }
    }
  }
  return null;
}

/**
 * Pre-computes the views of the resume that matching needs.
 */
function buildContext(sourceText) {
  const lowered = String(sourceText ?? '').toLowerCase();

  return {
    compact: compact(lowered),
    tokens: new Set(
      lowered
        .split(/\s+/)
        .map((token) => token.replace(/^[^a-z0-9+#]+|[^a-z0-9+#]+$/g, ''))
        .filter(Boolean),
    ),
    digits: lowered.replace(/\D/g, ''),
    phrases: buildPhrases(lowered),
  };
}

const MAX_SKILL_WORDS = 4;

function buildPhrases(lowered) {
  const words = lowered
    .split(/[\s/,;|()[\]{}]+/)
    .map((word) => compact(word))
    .filter(Boolean);

  const phrases = new Set();
  for (let start = 0; start < words.length; start += 1) {
    let phrase = '';
    for (let length = 0; length < MAX_SKILL_WORDS && start + length < words.length; length += 1) {
      phrase += words[start + length];
      phrases.add(phrase);
    }
  }
  return phrases;
}

function isSkillGrounded(value, context) {
  const text = String(value).trim().toLowerCase();
  const compacted = compact(text);
  if (compacted === '') return false;
  if (compacted.length < 3) return context.tokens.has(text);
  return context.phrases.has(compacted);
}

function isGrounded(value, context) {
  const text = String(value).trim().toLowerCase();
  if (text === '') return false;

  const compacted = compact(text);
  if (compacted === '') return false;

  if (compacted.length >= 3) return context.compact.includes(compacted);

  return context.tokens.has(text);
}

function groundPhone(phone, context, warnings) {
  if (!phone) return null;

  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 7 && context.digits.includes(digits)) return phone;

  warnings.push(`Dropped basics.phone "${phone}": it does not appear in the resume.`);
  return null;
}

function compact(text) {
  return text.replace(/[^a-z0-9]/g, '');
}
