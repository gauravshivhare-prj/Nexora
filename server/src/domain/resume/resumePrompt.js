import { PARSED_LIMITS } from '../../constants/resumePolicy.js';

/**
 * The instruction given to whichever model is configured.
 *
 * Provider-agnostic on purpose: plain text, no vendor-specific tool-calling
 * or response-format parameter. An adapter is free to use its provider's JSON
 * mode on top of this, but nothing here depends on one existing.
 *
 * The prompt asks for restraint rather than completeness. Every instruction
 * below that sounds unhelpfully strict is there because the opposite failure
 * — a plausible invention — is far more damaging than a missed field. An
 * omission leaves a gap the student can fill in; an invention becomes a skill
 * they never had, feeding a career match and a roadmap built on it.
 *
 * The prompt is not the safety mechanism. Grounding is: every extracted skill
 * is checked against the resume text afterwards, and dropped if absent. This
 * only makes the model's job easier.
 */

const SYSTEM_PROMPT = `You extract structured data from a student's resume.

Return ONLY a JSON object. No prose, no explanation, no code fence.

Shape:
{
  "basics": { "fullName": string|null, "email": string|null, "phone": string|null,
              "location": string|null, "links": string[] },
  "education": [{ "institution": string|null, "degree": string|null, "field": string|null,
                  "startYear": number|null, "endYear": number|null, "grade": string|null }],
  "skills": [{ "name": string }],
  "projects": [{ "title": string|null, "description": string|null, "technologies": string[] }],
  "experience": [{ "organisation": string|null, "title": string|null, "startDate": string|null,
                   "endDate": string|null, "description": string|null }],
  "certifications": [{ "name": string|null, "issuer": string|null, "issueYear": number|null }],
  "achievements": string[]
}

Rules:
1. Extract only what the resume states. Never infer, complete or add anything.
   If a backend resume does not mention Docker, Docker is not a skill.
2. Copy names exactly as written. Do not expand abbreviations, correct
   spelling, or translate.
3. Use null for anything absent. Never guess a value to fill a field.
4. Do not rate, score or assign a proficiency level to any skill.
5. Keep dates as the resume writes them ("Jan 2024", "Present").
6. Descriptions may be summarised in your own words. Everything else must be
   copied verbatim.
7. At most ${PARSED_LIMITS.skills.maxItems} skills, listed once each.`;

/**
 * Builds the request for one resume.
 *
 * @param {string} resumeText
 * @returns {{ system: string, user: string, maxOutputTokens: number }}
 */
export function buildResumeExtractionRequest(resumeText) {
  return {
    system: SYSTEM_PROMPT,
    user: `Resume:\n\n${resumeText}`,
    /**
     * Generous enough for a long CV's structured form, bounded so a model
     * that starts repeating itself is cut off rather than billed for.
     */
    maxOutputTokens: 4096,
  };
}
