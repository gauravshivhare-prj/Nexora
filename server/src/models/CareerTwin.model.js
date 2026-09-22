import mongoose from 'mongoose';

import {
  EVIDENCE_SOURCE_VALUES,
  EVIDENCE_STRENGTH_VALUES,
} from '../domain/evidence/evidence.js';

/**
 * A student's CareerTwin: what Nexora believes about their career profile,
 * and why.
 *
 * Entirely derived. Every field is computed from StudentProfile and Resume,
 * and nothing is entered here directly — which makes this the one collection
 * that can safely be deleted and rebuilt.
 *
 * Stored rather than computed per request for two reasons. A twin is the
 * input to career matching, skill gaps and the roadmap, and those must all
 * see the same one rather than three recomputations that could differ. And a
 * stored twin can be compared against a later one, which is how progress
 * over a degree becomes visible at all.
 *
 * The cost of storing derived data is staleness, so `sources` records what it
 * was built from. `isCareerTwinStale()` answers the question rather than
 * leaving each caller to guess.
 */

const SUBDOCUMENT_OPTIONS = { _id: false };

/**
 * One reason a skill is believed.
 *
 * `detail` is required, not optional. A strength without a reason is exactly
 * the unexplained score this design rules out: the student must be able to
 * read "used in your project Nexora", not "supported".
 */
const evidenceSchema = new mongoose.Schema(
  {
    source: { type: String, enum: EVIDENCE_SOURCE_VALUES, required: true },
    strength: { type: String, enum: EVIDENCE_STRENGTH_VALUES, required: true },
    detail: { type: String, required: true, maxlength: 500 },
    /** Id or title of the record this came from, for tracing it back. */
    reference: { type: String, default: null, maxlength: 200 },
  },
  SUBDOCUMENT_OPTIONS,
);

const twinSkillSchema = new mongoose.Schema(
  {
    /** Canonical comparison key. Everything downstream matches on this. */
    key: { type: String, required: true },
    /** Display spelling. */
    name: { type: String, required: true },
    /** The strongest evidence behind it — never an average. */
    strength: { type: String, enum: EVIDENCE_STRENGTH_VALUES, required: true },
    /**
     * What the student called their own level, if they said.
     *
     * Kept beside the evidence-derived strength rather than merged into it,
     * so "I call myself an expert" and "Nexora has seen one project" stay
     * visibly different things.
     */
    selfDeclaredLevel: { type: String, default: null },
    evidence: { type: [evidenceSchema], default: [] },
    sourceCount: { type: Number, default: 0 },
  },
  SUBDOCUMENT_OPTIONS,
);

const careerTwinSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      // One twin per student. It is a current view, not a history — earlier
      // twins would need their own collection and a reason to keep them.
      unique: true,
      immutable: true,
    },

    skills: { type: [twinSkillSchema], default: [] },

    interests: { type: [String], default: [] },

    targetRoles: {
      type: [
        new mongoose.Schema(
          {
            title: { type: String, required: true },
            /**
             * Who put this role here. `student` is their own answer;
             * `nexora` will be a suggestion from career matching. They must
             * stay distinguishable — a suggestion the student never agreed
             * to must not come back as their stated goal.
             */
            origin: { type: String, enum: ['student', 'nexora'], required: true },
          },
          SUBDOCUMENT_OPTIONS,
        ),
      ],
      default: [],
    },

    academic: {
      type: new mongoose.Schema(
        {
          degree: { type: String, default: null },
          branch: { type: String, default: null },
          collegeName: { type: String, default: null },
          currentSemester: { type: Number, default: null },
          graduationYear: { type: Number, default: null },
          cgpa: { type: Number, default: null },
        },
        SUBDOCUMENT_OPTIONS,
      ),
      default: null,
    },

    /**
     * Counts, not scores.
     *
     * There is deliberately no overall readiness figure. Readiness is
     * readiness *for* a role, and a number produced before career matching
     * exists would be a number about nothing.
     */
    indicators: {
      totalSkills: { type: Number, default: 0 },
      claimedOnly: { type: Number, default: 0 },
      supported: { type: Number, default: 0 },
      verified: { type: Number, default: 0 },
      projectCount: { type: Number, default: 0 },
      certificationCount: { type: Number, default: 0 },
      analysedResumeCount: { type: Number, default: 0 },
      hasTargetRole: { type: Boolean, default: false },
    },

    /**
     * An optional model-written summary.
     *
     * Prose, and labelled as prose. It carries no evidential weight and
     * nothing computes from it — it exists so a student reads a sentence
     * rather than a table. Null whenever no AI provider is configured, which
     * is Nexora's shipped state.
     */
    narrative: {
      text: { type: String, default: null, maxlength: 2000 },
      provider: { type: String, default: null },
      model: { type: String, default: null },
      generatedAt: { type: Date, default: null },
      /** Claims dropped from the narrative for not matching the twin. */
      warnings: { type: [String], default: [] },
    },

    /** What this twin was built from, so staleness is detectable. */
    sources: {
      hasProfile: { type: Boolean, default: false },
      profileUpdatedAt: { type: Date, default: null },
      resumeCount: { type: Number, default: 0 },
      analysedResumeIds: { type: [String], default: [] },
    },

    generatedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

/**
 * Whether a stored twin still reflects the data it was built from.
 *
 * Checked rather than assumed: derived data that silently goes stale is worse
 * than no derived data, because it looks current. Regeneration is left to the
 * caller — this reports, it does not decide.
 *
 * @param {object} twin A stored CareerTwin.
 * @param {object} current `{ profileUpdatedAt, analysedResumeIds }` as things
 *   stand now.
 * @returns {{ isStale: boolean, reasons: string[] }}
 */
export function isCareerTwinStale(
  twin,
  { profileUpdatedAt, analysedResumeIds, latestAnalysisAt = null },
) {
  const reasons = [];

  const builtFrom = twin.sources?.profileUpdatedAt ?? null;
  if (profileUpdatedAt && (!builtFrom || new Date(profileUpdatedAt) > new Date(builtFrom))) {
    reasons.push('Your profile has changed since this was generated.');
  }

  const before = new Set(twin.sources?.analysedResumeIds ?? []);
  const now = new Set(analysedResumeIds);

  if (now.size !== before.size || [...now].some((id) => !before.has(id))) {
    reasons.push('Your analysed resumes have changed since this was generated.');
  } else if (
    /*
     * The same resumes, analysed again.
     *
     * Comparing the *set* of ids cannot see this: re-running the analysis
     * keeps the id and replaces the parsed data, so every skill the twin
     * rests on can change while the set stays identical. The twin would
     * then quietly present evidence that no longer exists.
     *
     * Only checked when the ids match, so a student who added a resume gets
     * the more specific reason above rather than both.
     */
    latestAnalysisAt &&
    twin.generatedAt &&
    new Date(latestAnalysisAt) > new Date(twin.generatedAt)
  ) {
    reasons.push('A resume has been analysed again since this was generated.');
  }

  return { isStale: reasons.length > 0, reasons };
}

/**
 * The public shape of a CareerTwin.
 *
 * An allow-list, like every other public shape here. The owning user id is
 * not included.
 */
export function toPublicCareerTwin(twin, staleness = { isStale: false, reasons: [] }) {
  return {
    skills: (twin.skills ?? []).map((skill) => ({
      key: skill.key,
      name: skill.name,
      strength: skill.strength,
      selfDeclaredLevel: skill.selfDeclaredLevel ?? null,
      sourceCount: skill.sourceCount ?? 0,
      evidence: (skill.evidence ?? []).map((item) => ({
        source: item.source,
        strength: item.strength,
        detail: item.detail,
        reference: item.reference ?? null,
      })),
    })),
    interests: twin.interests ?? [],
    targetRoles: (twin.targetRoles ?? []).map((role) => ({
      title: role.title,
      origin: role.origin,
    })),
    academic: twin.academic ? { ...twin.academic.toObject?.() ?? twin.academic } : null,
    indicators: {
      totalSkills: twin.indicators?.totalSkills ?? 0,
      claimedOnly: twin.indicators?.claimedOnly ?? 0,
      supported: twin.indicators?.supported ?? 0,
      verified: twin.indicators?.verified ?? 0,
      projectCount: twin.indicators?.projectCount ?? 0,
      certificationCount: twin.indicators?.certificationCount ?? 0,
      analysedResumeCount: twin.indicators?.analysedResumeCount ?? 0,
      hasTargetRole: twin.indicators?.hasTargetRole ?? false,
    },
    narrative: twin.narrative?.text
      ? {
          text: twin.narrative.text,
          provider: twin.narrative.provider ?? null,
          model: twin.narrative.model ?? null,
          generatedAt: twin.narrative.generatedAt ?? null,
          warnings: twin.narrative.warnings ?? [],
          /**
           * Stated in the payload, not just in documentation. A client that
           * renders this must be able to label it, and a later phase must
           * not mistake it for a fact it can compute from.
           */
          isModelWritten: true,
        }
      : null,
    sources: {
      hasProfile: twin.sources?.hasProfile ?? false,
      profileUpdatedAt: twin.sources?.profileUpdatedAt ?? null,
      resumeCount: twin.sources?.resumeCount ?? 0,
      analysedResumeCount: (twin.sources?.analysedResumeIds ?? []).length,
    },
    generatedAt: twin.generatedAt,
    isStale: staleness.isStale,
    staleReasons: staleness.reasons,
  };
}

export const CareerTwin =
  mongoose.models.CareerTwin ?? mongoose.model('CareerTwin', careerTwinSchema);
