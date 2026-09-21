import { skillKey } from '../skills/skillKey.js';
import { checkString, isPlainObject } from '../../utils/fieldTypes.js';

/**
 * The optional model-written summary of a CareerTwin.
 *
 * Everything factual about a twin is computed deterministically. This adds
 * one thing a computation cannot: a couple of sentences a student can read
 * instead of a table. It is prose, it is labelled as prose, and nothing
 * computes from it.
 *
 * The same rule as resume parsing applies, for the same reason. A model asked
 * to summarise a backend student's strengths will reach for the sentence such
 * summaries usually contain — "strong foundation in cloud and containers" —
 * whether or not this student has any. So every skill the narrative names is
 * checked against the twin, and a narrative naming a skill the student does
 * not have is rejected outright rather than edited.
 *
 * Rejected rather than edited because a summary is an argument, not a list.
 * Deleting "and Docker" from "experience across Node.js and Docker" leaves a
 * sentence whose claim was built on something untrue. There is nothing lost
 * by dropping it: the twin is complete and useful without a narrative, which
 * is how it ships.
 */

const MAX_NARRATIVE_CHARS = 1200;

/**
 * Builds the request for a twin's narrative.
 *
 * Only the student's skills, interests and academic stage are sent — never
 * their name, email, phone or resume text. A summary of what someone can do
 * does not need to know who they are, and sending less to a third party is
 * the whole of the argument.
 *
 * @param {object} twin Output of buildCareerTwin.
 * @returns {{ system: string, user: string, maxOutputTokens: number }}
 */
export function buildNarrativeRequest(twin) {
  const skills = twin.skills
    .map((skill) => `- ${skill.name} (evidence: ${skill.strength}, ${skill.sourceCount} source(s))`)
    .join('\n');

  const context = [
    skills ? `Skills:\n${skills}` : 'Skills: none recorded.',
    twin.interests.length > 0 ? `Interests: ${twin.interests.join(', ')}.` : null,
    twin.targetRoles.length > 0
      ? `Stated target role: ${twin.targetRoles.map((role) => role.title).join(', ')}.`
      : null,
    twin.academic?.branch ? `Studying: ${twin.academic.branch}.` : null,
    twin.academic?.graduationYear ? `Graduating: ${twin.academic.graduationYear}.` : null,
    `Projects: ${twin.indicators.projectCount}. Certifications: ${twin.indicators.certificationCount}.`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    system: `You write a short, factual summary of a student's current career profile.

Return ONLY a JSON object: { "summary": string }

Rules:
1. Use only the skills listed below. Never mention a skill that is not there,
   even if students with this profile usually have it.
2. Do not invent experience, seniority, employers or achievements.
3. Do not rate the student, score them, or predict whether they will be hired.
4. Distinguish what they have shown from what they have claimed. "supported"
   means they pointed at a project or certification; "claimed" means they
   listed it and nothing more.
5. Two or three sentences. Address the student as "you".
6. Be plain. No marketing language.`,
    user: context,
    maxOutputTokens: 500,
  };
}

/**
 * Schema validation for the narrative response.
 *
 * @param {unknown} raw Parsed JSON from the provider.
 * @returns {{ value: string|null, error: string|null }}
 */
export function validateNarrative(raw) {
  if (!isPlainObject(raw)) return { value: null, error: 'The AI response was not an object.' };

  const { value, error } = checkString(raw.summary, { max: MAX_NARRATIVE_CHARS, min: 1 });
  if (error) return { value: null, error: `The summary field was unusable: ${error.toLowerCase()}.` };

  return { value, error: null };
}

/**
 * Business validation: every skill named must be one the student has.
 *
 * Works the opposite way round from resume grounding. There, the haystack was
 * the document and the needles were the model's extractions. Here the twin is
 * the authority, and the narrative is searched for any *known* skill name —
 * then for skill-shaped words that match nothing.
 *
 * Only the skills in the catalogue can be checked, so this catches a model
 * claiming Docker when Docker is a known skill the student lacks. A wholly
 * invented technology no catalogue knows about would pass, which is why the
 * narrative is confined to prose with no computational role.
 *
 * @param {string} narrative
 * @param {object} twin Output of buildCareerTwin.
 * @param {string[]} knownSkillNames Skill names Nexora can recognise —
 *   typically every skill named by any career role, plus the student's own.
 * @returns {{ ok: boolean, warnings: string[] }}
 */
export function groundNarrative(narrative, twin, knownSkillNames = []) {
  const studentKeys = new Set(twin.skills.map((skill) => skill.key));
  const warnings = [];

  // Longest first, so "React Native" is tested before "React" and a mention
  // of the former is not attributed to the latter.
  const candidates = [...new Set(knownSkillNames)]
    .filter((name) => typeof name === 'string' && name.trim().length >= 3)
    .sort((left, right) => right.length - left.length);

  const haystack = compact(narrative);
  const claimed = new Set();

  for (const name of candidates) {
    const key = skillKey(name);
    if (key === '' || studentKeys.has(key) || claimed.has(key)) continue;

    if (haystack.includes(compact(name))) {
      claimed.add(key);
      warnings.push(`The summary mentioned "${name}", which is not one of your recorded skills.`);
    }
  }

  return { ok: warnings.length === 0, warnings };
}

function compact(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9+#]/g, '');
}
