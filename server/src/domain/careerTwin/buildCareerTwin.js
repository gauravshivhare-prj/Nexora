import { EVIDENCE_SOURCES, makeEvidence, strongestStrength } from '../evidence/evidence.js';
import { skillDisplayName, skillKey, uniqueSkills } from '../skills/skillKey.js';

/**
 * Builds a student's CareerTwin from their profile and resumes.
 *
 * A pure function: same inputs, same output, no database, no clock, no
 * network. That is not incidental. This is the representation every
 * recommendation, gap and roadmap is computed from, and a student is entitled
 * to ask why it says what it says — which is only answerable if the answer
 * does not depend on when it ran or what a model felt like returning.
 *
 * **No AI is involved here, and none is needed.** Aggregating a student's own
 * data is arithmetic, not generation. Asking a model to do it would introduce
 * invention into the one place that must not have any, and would make the
 * whole feature unavailable on a deployment with no provider configured. The
 * optional narrative layer is separate, and clearly marked as prose.
 *
 * Nothing here produces a score. Every number below is a count of something
 * real, and every skill's status is attached to the evidence that justifies
 * it. A single "readiness" figure is deliberately absent: readiness is
 * readiness *for* something, and there is no target role to measure against
 * until career matching exists.
 */

/**
 * @param {object} inputs
 * @param {object|null} inputs.profile Public profile shape, or null.
 * @param {object[]} inputs.resumes Analysed resumes, newest first. Each is the
 *   public resume shape; those without parsed data are ignored.
 * @returns {object} The CareerTwin content, ready for persistence.
 */
export function buildCareerTwin({ profile, resumes = [] }) {
  // Only analysed resumes carry structured data. An unanalysed one is a wall
  // of text, and guessing at it here would be the invention this avoids.
  const analysed = resumes.filter((resume) => resume?.parsed);

  const skills = collectSkills(profile, analysed);

  return {
    skills,
    interests: collectInterests(profile),
    targetRoles: collectTargetRoles(profile),
    academic: summariseAcademic(profile),
    indicators: countIndicators({ profile, analysed, skills }),
    sources: describeSources({ profile, resumes, analysed }),
  };
}

// -------------------------------------------------------------------- skills

/**
 * Gathers every skill Nexora has seen, with the evidence behind each.
 *
 * Skills are merged by canonical key, so a profile's "Node.js" and a resume's
 * "NodeJS" become one skill with two pieces of evidence rather than two
 * skills with one each. Without that merge, a student would be shown a gap
 * for something they had already listed twice.
 *
 * Ordered strongest first, then by how many independent sources mention it.
 * A student reading their own twin should see what they can best stand behind
 * at the top, not whatever happened to be alphabetically first.
 */
function collectSkills(profile, analysedResumes) {
  /** @type {Map<string, { key: string, name: string, evidence: object[], selfDeclaredLevel: string|null }>} */
  const bySkill = new Map();

  const add = (rawName, evidence, selfDeclaredLevel = null) => {
    const key = skillKey(rawName);
    if (key === '') return;

    const existing = bySkill.get(key);
    if (existing) {
      existing.evidence.push(evidence);
      // A level from the profile is kept if one arrives later, but a skill
      // first seen in a resume never gains an invented one.
      existing.selfDeclaredLevel ??= selfDeclaredLevel;
      return;
    }

    bySkill.set(key, {
      key,
      name: skillDisplayName(rawName),
      evidence: [evidence],
      selfDeclaredLevel,
    });
  };

  // --- Profile: skills the student listed ---
  for (const skill of profile?.skills ?? []) {
    add(
      skill.name,
      makeEvidence({
        source: EVIDENCE_SOURCES.SELF_DECLARED,
        detail: `You listed this on your profile as ${skill.level}.`,
      }),
      skill.level,
    );
  }

  // --- Profile: technologies used by projects ---
  for (const project of profile?.projects ?? []) {
    for (const technology of project.technologies ?? []) {
      add(
        technology,
        makeEvidence({
          source: EVIDENCE_SOURCES.PROJECT,
          detail: `Used in your project "${project.title}".`,
          reference: project.title,
        }),
      );
    }
  }

  // --- Profile: certifications ---
  //
  // A certification's *name* is not a skill, and splitting "AWS Certified
  // Cloud Practitioner" into words would produce "Certified" and
  // "Practitioner" as skills. Mapping a certification to the skills it
  // actually covers needs a catalogue of certifications, which does not
  // exist; inventing that mapping would fabricate skills outright.
  //
  // So a certification contributes evidence only to a skill already known
  // from elsewhere and named within it. A student certified in something
  // they have never mentioned gains nothing here, which is the safe error.
  const knownKeys = [...bySkill.keys()];
  for (const certification of profile?.certifications ?? []) {
    for (const key of knownKeys) {
      const entry = bySkill.get(key);
      if (!mentions(certification.name, entry.name)) continue;

      entry.evidence.push(
        makeEvidence({
          source: EVIDENCE_SOURCES.CERTIFICATION,
          detail: `Covered by your certification "${certification.name}".`,
          reference: certification.name,
        }),
      );
    }
  }

  // --- Resumes: grounded skills and project technologies ---
  for (const resume of analysedResumes) {
    const label = resume.label ?? 'your resume';

    for (const skill of resume.parsed.skills ?? []) {
      add(
        skill.name,
        makeEvidence({
          source: EVIDENCE_SOURCES.RESUME,
          detail: `Listed in ${label}.`,
          reference: resume.id,
        }),
      );
    }

    for (const project of resume.parsed.projects ?? []) {
      for (const technology of project.technologies ?? []) {
        add(
          technology,
          makeEvidence({
            source: EVIDENCE_SOURCES.PROJECT,
            detail: project.title
              ? `Used in "${project.title}", from ${label}.`
              : `Used in a project described in ${label}.`,
            reference: resume.id,
          }),
        );
      }
    }
  }

  return [...bySkill.values()]
    .map((entry) => ({
      key: entry.key,
      name: entry.name,
      strength: strongestStrength(entry.evidence),
      selfDeclaredLevel: entry.selfDeclaredLevel,
      // Strongest first. Everything downstream that quotes a single reason
      // takes the first one, so this is what decides whether a student reads
      // "used in your project Nexora" or "you listed this on your profile" —
      // and for a skill that has both, the second would be a strange thing
      // to say. Stable within a strength, so the order stays deterministic.
      evidence: [...entry.evidence].sort((left, right) => rank(right.strength) - rank(left.strength)),
      /** Distinct kinds of evidence — four resume mentions is still one kind. */
      sourceCount: new Set(entry.evidence.map((item) => item.source)).size,
    }))
    .sort(compareSkills);
}

/** Strongest first, then best-corroborated, then alphabetical for stability. */
function compareSkills(left, right) {
  const byStrength = rank(right.strength) - rank(left.strength);
  if (byStrength !== 0) return byStrength;

  const bySources = right.sourceCount - left.sourceCount;
  if (bySources !== 0) return bySources;

  return left.name.localeCompare(right.name);
}

const STRENGTH_RANK = { claimed: 0, supported: 1, verified: 2 };
const rank = (strength) => STRENGTH_RANK[strength] ?? -1;

/**
 * Whether a certification's title names a skill.
 *
 * Compared on canonical keys, so "AWS Certified Cloud Practitioner" matches a
 * skill recorded as "AWS". Short keys are excluded: a two-letter key would
 * match inside almost any title and attach evidence that means nothing.
 */
function mentions(title, skillName) {
  const key = skillKey(skillName);
  if (key.length < 3) return false;

  return skillKey(title).includes(key);
}

// -------------------------------------------------------------- other facets

/** Career interests, as the student wrote them. Nothing is inferred. */
function collectInterests(profile) {
  return uniqueSkills(profile?.career?.careerInterests ?? []).map((interest) => interest.name);
}

/**
 * Roles the student says they are aiming at.
 *
 * A list, though the profile holds one, because career matching will suggest
 * others and they will land here beside the student's own answer — which
 * must stay distinguishable from a suggestion.
 */
function collectTargetRoles(profile) {
  const stated = profile?.career?.targetRole;
  if (!stated) return [];

  return [{ title: stated, origin: 'student' }];
}

/** A copy of the academic facts, so a twin reads without loading the profile. */
function summariseAcademic(profile) {
  const academic = profile?.academic;
  if (!academic) return null;

  const hasAnything = Object.values(academic).some((value) => value !== null && value !== undefined);
  if (!hasAnything) return null;

  return {
    degree: academic.degree ?? null,
    branch: academic.branch ?? null,
    collegeName: academic.collegeName ?? null,
    currentSemester: academic.currentSemester ?? null,
    graduationYear: academic.graduationYear ?? null,
    cgpa: academic.cgpa ?? null,
  };
}

/**
 * Countable facts about how much Nexora has to work with.
 *
 * Every field is a count of something that exists, not a score. There is no
 * weighting, because any weighting invented now would be arbitrary and would
 * be read as a judgement about the student.
 *
 * In particular there is no overall readiness figure. Readiness is readiness
 * *for* a role, and until career matching exists there is nothing to be ready
 * for. A number here would be a number about nothing.
 */
function countIndicators({ profile, analysed, skills }) {
  return {
    totalSkills: skills.length,
    claimedOnly: skills.filter((skill) => skill.strength === 'claimed').length,
    supported: skills.filter((skill) => skill.strength === 'supported').length,
    verified: skills.filter((skill) => skill.strength === 'verified').length,
    projectCount: profile?.projects?.length ?? 0,
    certificationCount: profile?.certifications?.length ?? 0,
    analysedResumeCount: analysed.length,
    hasTargetRole: Boolean(profile?.career?.targetRole),
  };
}

/** What this twin was built from, so a stale one can be recognised. */
function describeSources({ profile, resumes, analysed }) {
  return {
    hasProfile: Boolean(profile),
    profileUpdatedAt: profile?.updatedAt ?? null,
    resumeCount: resumes.length,
    analysedResumeIds: analysed.map((resume) => resume.id),
  };
}
