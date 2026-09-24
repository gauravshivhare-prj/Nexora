import { ERROR_CODES } from '../constants/errorCodes.js';
import { PROCESSING_STATUS } from '../constants/resumePolicy.js';
import {
  CareerTwin,
  Resume,
  StudentProfile,
  isCareerTwinStale,
  toPublicCareerTwin,
  toPublicProfile,
  toPublicResume,
} from '../models/index.js';
import { loadVerifiedEvidence } from './skillEvidence.service.js';
import { buildCareerTwin } from '../domain/careerTwin/buildCareerTwin.js';
import {
  buildNarrativeRequest,
  groundNarrative,
  validateNarrative,
} from '../domain/careerTwin/careerTwinNarrative.js';
import { knownSkillNames } from '../domain/skills/skillKey.js';
import { parseJsonObject } from './ai/aiJson.js';
import { isAiConfigured, requestCompletion, resolveAiProvider } from './ai/aiProvider.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

/**
 * CareerTwin generation.
 *
 * ```text
 * StudentProfile + analysed Resumes
 *        ↓  context builder        (deterministic, no AI)
 * CareerTwin content
 *        ↓  provider layer         (optional, narrative only)
 * summary text
 *        ↓  schema validation
 *        ↓  business validation — grounded against the twin
 * persistence
 * ```
 *
 * The important property of this pipeline is that the AI step is optional and
 * sits at the *end*. Everything a later phase computes from — skills,
 * evidence, interests, indicators — is produced before a model is involved,
 * so a deployment with no provider gets a complete and correct CareerTwin.
 * Nexora ships that way.
 */

/**
 * Loads everything a twin is built from.
 *
 * Only analysed resumes are fetched. An unanalysed resume is a wall of text
 * with no structure to aggregate, and guessing at it here would be invention.
 */
async function loadInputs(userId) {
  const [profileDocument, resumeDocuments, verifiedEvidence] = await Promise.all([
    StudentProfile.findOne({ user: userId }),
    Resume.find({ user: userId, 'analysis.status': PROCESSING_STATUS.COMPLETED }).sort({
      createdAt: -1,
    }),
    loadVerifiedEvidence(userId),
  ]);

  return {
    profile: profileDocument ? toPublicProfile(profileDocument) : null,
    profileUpdatedAt: profileDocument?.updatedAt ?? null,
    resumes: resumeDocuments.map(toPublicResume),
    verifiedEvidence,
    /**
     * When any of these resumes was most recently analysed.
     *
     * Carried separately because the set of resume ids cannot express it: a
     * re-analysis keeps the id and replaces the parsed data, so this is the
     * only signal that the evidence under an unchanged set has moved.
     */
    latestAnalysisAt: resumeDocuments.reduce((latest, resume) => {
      const completedAt = resume.analysis?.completedAt;
      if (!completedAt) return latest;
      return !latest || completedAt > latest ? completedAt : latest;
    }, null),
    latestEvidenceAt: verifiedEvidence.reduce((latest, item) => {
      const completedAt = item.completedAt;
      if (!completedAt) return latest;
      return !latest || completedAt > latest ? completedAt : latest;
    }, null),
    verifiedEvidenceCount: verifiedEvidence.length,
  };
}

/**
 * Reads the stored twin, reporting whether it still matches its inputs.
 *
 * Does not regenerate. A read that silently rewrote stored data would make
 * GET a mutation, and would hide from the student that their twin had been
 * out of date. The staleness flag lets the client offer to refresh instead.
 *
 * @returns {Promise<{ twin: object|null, exists: boolean }>}
 */
export async function getCareerTwin(userId) {
  const stored = await CareerTwin.findOne({ user: userId });
  if (!stored) return { twin: null, exists: false };

  const {
    profileUpdatedAt,
    resumes,
    latestAnalysisAt,
    latestEvidenceAt,
    verifiedEvidenceCount,
  } = await loadInputs(userId);
  const staleness = isCareerTwinStale(stored, {
    profileUpdatedAt,
    analysedResumeIds: resumes.map((resume) => resume.id),
    latestAnalysisAt,
    latestEvidenceAt,
    verifiedEvidenceCount,
  });

  return { twin: toPublicCareerTwin(stored, staleness), exists: true };
}

/**
 * Builds a twin from the student's current data and stores it.
 *
 * Refuses when there is nothing to build from. An empty twin is worse than
 * none: it would report zero skills as though that were a finding about the
 * student, when it is only a finding about how much they have entered.
 *
 * @param {string} userId From requireAuth.
 * @param {{ withNarrative?: boolean }} [options] The narrative costs a model
 *   call, so it is opt-in. Requesting it without a provider is not an error —
 *   the twin is generated and `narrative` is null.
 * @throws {ApiError} 409 when there is no input data.
 */
export async function generateCareerTwin(userId, { withNarrative = false } = {}) {
  const { profile, profileUpdatedAt, resumes, verifiedEvidence } = await loadInputs(userId);

  if (!hasEnoughInput(profile, resumes, verifiedEvidence)) {
    throw new ApiError(
      409,
      'There is not enough in your profile yet to build a CareerTwin. Add some skills or projects, or analyse a resume, and try again.',
      ERROR_CODES.CAREER_TWIN_NO_INPUT,
    );
  }

  const content = buildCareerTwin({ profile, resumes, verifiedEvidence });

  const narrative = withNarrative
    ? await generateNarrative(content)
    : { text: null, provider: null, model: null, generatedAt: null, warnings: [] };

  const stored = await CareerTwin.findOneAndUpdate(
    { user: userId },
    {
      $set: {
        skills: content.skills,
        interests: content.interests,
        targetRoles: content.targetRoles,
        academic: content.academic,
        indicators: content.indicators,
        narrative,
        sources: { ...content.sources, profileUpdatedAt },
        generatedAt: new Date(),
      },
      $setOnInsert: { user: userId },
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );

  // Freshly built from the data just read, so it cannot be stale.
  return toPublicCareerTwin(stored, { isStale: false, reasons: [] });
}

/**
 * Whether there is enough to say anything about.
 *
 * One skill, one project or one analysed resume is enough — the bar is "we
 * have observed something", not "the profile is complete".
 */
function hasEnoughInput(profile, resumes, verifiedEvidence) {
  if (verifiedEvidence.length > 0) return true;
  if (resumes.length > 0) return true;
  if (!profile) return false;

  return (
    (profile.skills?.length ?? 0) > 0 ||
    (profile.projects?.length ?? 0) > 0 ||
    (profile.certifications?.length ?? 0) > 0
  );
}

/**
 * Produces the optional narrative, or nothing.
 *
 * Every failure here is non-fatal and returns an empty narrative. That is the
 * deliberate difference from resume analysis: there, the AI output *was* the
 * feature, so a failure had to be reported. Here the twin is already complete
 * and correct, and failing the whole generation because a summary could not
 * be written would throw away good data over a decoration.
 *
 * Each failure is logged, and a rejected summary is recorded in `warnings` so
 * the reason is visible rather than silent.
 */
async function generateNarrative(content) {
  const empty = { text: null, provider: null, model: null, generatedAt: null, warnings: [] };

  if (!isAiConfigured()) return empty;

  const provider = resolveAiProvider();

  try {
    const { text, model } = await requestCompletion(buildNarrativeRequest(content));

    const json = parseJsonObject(text);
    if (json.error) return { ...empty, warnings: [json.error] };

    const { value: summary, error } = validateNarrative(json.value);
    if (error) return { ...empty, warnings: [error] };

    const grounding = groundNarrative(summary, content, [
      ...knownSkillNames(),
      ...content.skills.map((skill) => skill.name),
    ]);

    if (!grounding.ok) {
      // Rejected whole, not edited. A summary is an argument: removing the
      // untrue clause leaves a sentence whose point rested on it.
      logger.warn(`CareerTwin narrative rejected: ${grounding.warnings.join(' ')}`);
      return { ...empty, warnings: grounding.warnings };
    }

    return {
      text: summary,
      provider: provider.name,
      model,
      generatedAt: new Date(),
      warnings: [],
    };
  } catch (error) {
    // Includes a provider outage. The twin itself is unaffected.
    logger.error('CareerTwin narrative could not be generated', error);
    return { ...empty, warnings: ['The summary could not be generated. The rest is unaffected.'] };
  }
}
