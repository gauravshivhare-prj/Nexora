import {
  EVIDENCE_SOURCES,
  EVIDENCE_STRENGTH_ORDER,
  makeEvidence,
  strongestStrength,
} from '../evidence/evidence.js';
import { skillDisplayName, skillKey, uniqueSkills } from '../skills/skillKey.js';
import { projectTwinSkill } from './careerTwinProjection.js';

/**
 * Task 07 — CareerTwin Intelligence Engine Reconstruction
 *
 * Builds a student's CareerTwin from their profile, resumes, and verified evidence.
 *
 * A pure, deterministic function: same inputs, same output, no database, no clock,
 * no network. Every fact is traceable to student data or verified assessments.
 *
 * **No AI is involved here, and none is needed.** Aggregating student data and
 * computing deterministic confidence, proficiency, and role relevance is
 * arithmetic and taxonomy mapping, not generation. The optional narrative
 * layer is strictly advisory and marked as prose.
 */

/**
 * @param {object} inputs
 * @param {object|null} inputs.profile Public profile shape, or null.
 * @param {object[]} [inputs.resumes] Analysed resumes, newest first.
 * @param {object[]} [inputs.verifiedEvidence] Verified skill evidence checks.
 * @returns {object} The CareerTwin content, ready for persistence.
 */
export function buildCareerTwin({ profile, resumes = [], verifiedEvidence = [] }) {
  // Only analysed resumes carry structured data.
  const analysed = resumes.filter((resume) => resume?.parsed);
  const targetRoles = collectTargetRoles(profile);

  const skills = collectSkills(profile, analysed, verifiedEvidence, targetRoles);

  return {
    skills,
    interests: collectInterests(profile),
    targetRoles,
    academic: summariseAcademic(profile),
    indicators: countIndicators({ profile, analysed, skills }),
    sources: describeSources({ profile, resumes, analysed, verifiedEvidence }),
  };
}

// -------------------------------------------------------------------- skills

/**
 * Gathers every skill Nexora has seen, with the evidence behind each.
 *
 * Skills are merged by canonical key. Ordered strongest first, then by
 * confidence, then by how many independent sources mention it, then alphabetically.
 */
function collectSkills(profile, analysedResumes, verifiedEvidence, targetRoles = []) {
  /** @type {Map<string, { key: string, name: string, evidence: object[], selfDeclaredLevel: string|null }>} */
  const bySkill = new Map();

  const add = (rawName, evidence, selfDeclaredLevel = null) => {
    const key = skillKey(rawName);
    if (key === '') return;

    const existing = bySkill.get(key);
    if (existing) {
      existing.evidence.push(evidence);
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

  // 1. Verified institutional / assessment evidence
  for (const item of verifiedEvidence) {
    const ev = item.evidence || {};
    add(
      item.skill,
      {
        ...ev,
        source: ev.source || EVIDENCE_SOURCES.ASSESSMENT,
        strength: ev.strength || 'verified',
        detail: ev.detail || 'Verified through assessment or evaluation.',
        reference: ev.reference || null,
        provenanceTier: 'tier_5_externally_verified',
        verified: true,
        recordedAt: item.completedAt || new Date(),
        score: typeof item.score === 'number' ? item.score : null,
      },
    );
  }

  // 2. Profile: skills the student listed
  for (const skill of profile?.skills ?? []) {
    add(
      skill.name,
      {
        ...makeEvidence({
          source: EVIDENCE_SOURCES.SELF_DECLARED,
          detail: `You listed this on your profile as ${skill.level}.`,
        }),
        provenanceTier: 'tier_2_user_entered',
        verified: false,
        recordedAt: profile?.updatedAt ?? null,
      },
      skill.level,
    );
  }

  // 3. Profile: technologies used by projects
  for (const project of profile?.projects ?? []) {
    for (const technology of project.technologies ?? []) {
      add(
        technology,
        {
          ...makeEvidence({
            source: EVIDENCE_SOURCES.PROJECT,
            detail: `Used in your project "${project.title}".`,
            reference: project.title,
          }),
          provenanceTier: 'tier_2_user_entered',
          verified: false,
          recordedAt: profile?.updatedAt ?? null,
        },
      );
    }
  }

  // 4. Profile: certifications
  const knownKeys = [...bySkill.keys()];
  for (const certification of profile?.certifications ?? []) {
    for (const key of knownKeys) {
      const entry = bySkill.get(key);
      if (!mentions(certification.name, entry.name)) continue;

      entry.evidence.push({
        ...makeEvidence({
          source: EVIDENCE_SOURCES.CERTIFICATION,
          detail: `Covered by your certification "${certification.name}".`,
          reference: certification.name,
        }),
        provenanceTier: 'tier_2_user_entered',
        verified: false,
        recordedAt: profile?.updatedAt ?? null,
      });
    }
  }

  // 5. Resumes: grounded skills, project technologies, and certifications
  for (const resume of analysedResumes) {
    const label = resume.label ?? 'your resume';

    for (const skill of resume.parsed?.skills ?? []) {
      add(
        skill.name,
        {
          ...makeEvidence({
            source: EVIDENCE_SOURCES.RESUME,
            detail: `Listed in ${label}.`,
            reference: resume.id,
          }),
          provenanceTier: 'tier_3_ai_extracted_unverified',
          verified: false,
          recordedAt: resume.analysis?.completedAt ?? null,
        },
      );
    }

    for (const project of resume.parsed?.projects ?? []) {
      for (const technology of project.technologies ?? []) {
        add(
          technology,
          {
            ...makeEvidence({
              source: EVIDENCE_SOURCES.PROJECT,
              detail: project.title
                ? `Used in "${project.title}", from ${label}.`
                : `Used in a project described in ${label}.`,
              reference: resume.id,
            }),
            provenanceTier: 'tier_3_ai_extracted_unverified',
            verified: false,
            recordedAt: resume.analysis?.completedAt ?? null,
          },
        );
      }
    }

    for (const certification of resume.parsed?.certifications ?? []) {
      if (!certification.name) continue;

      for (const entry of bySkill.values()) {
        if (!mentions(certification.name, entry.name)) continue;

        entry.evidence.push({
          ...makeEvidence({
            source: EVIDENCE_SOURCES.CERTIFICATION,
            detail: `Covered by "${certification.name}", from ${label}.`,
            reference: resume.id,
          }),
          provenanceTier: 'tier_3_ai_extracted_unverified',
          verified: false,
          recordedAt: resume.analysis?.completedAt ?? null,
        });
      }
    }
  }

  return [...bySkill.values()]
    .map((entry) => {
      // Sort evidence strongest first
      const sortedEvidence = [...entry.evidence].sort(
        (left, right) => rank(right.strength) - rank(left.strength),
      );
      const strongest = strongestStrength(sortedEvidence);

      return projectTwinSkill(
        {
          key: entry.key,
          name: entry.name,
          strength: strongest,
          selfDeclaredLevel: entry.selfDeclaredLevel,
          evidence: sortedEvidence,
        },
        targetRoles,
      );
    })
    .sort(compareSkills);
}

/** Strongest first, then highest confidence, then best-corroborated, then alphabetical for stability. */
function compareSkills(left, right) {
  const byStrength = rank(right.strength) - rank(left.strength);
  if (byStrength !== 0) return byStrength;

  const byConfidence = (right.confidence || 0) - (left.confidence || 0);
  if (byConfidence !== 0) return byConfidence;

  const bySources = right.sourceCount - left.sourceCount;
  if (bySources !== 0) return bySources;

  return left.name.localeCompare(right.name);
}

const rank = (strength) => EVIDENCE_STRENGTH_ORDER.indexOf(strength);

/**
 * Whether a certification's title names a skill.
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
function describeSources({ profile, resumes, analysed, verifiedEvidence = [] }) {
  return {
    hasProfile: Boolean(profile),
    profileUpdatedAt: profile?.updatedAt ?? null,
    resumeCount: resumes.length,
    analysedResumeIds: analysed.map((resume) => resume.id),
    verifiedEvidenceCount: verifiedEvidence.length,
    canonicalVersion: '1.0.0',
  };
}
