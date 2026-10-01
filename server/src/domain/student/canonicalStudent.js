/**
 * Canonical Student Data Model & Source-of-Truth Engine (Task 02)
 *
 * Nexora's unified student state representation. Establishes unambiguous
 * provenance, versioning, conflict resolution, and freshness across all data
 * streams (Profile, Resumes, Projects, Assessments, Interviews, Evidence).
 */

import { skillKey, skillDisplayName } from '../skills/skillKey.js';
import { EVIDENCE_STRENGTH } from '../evidence/evidence.js';

export const canonicalSkillKey = skillKey;
export const normalizeSkillName = skillDisplayName;

export const CANONICAL_MODEL_VERSION = '2.1.0';

/**
 * Standardized Provenance Tiers defining authority, trust boundaries,
 * and precedence across data sources.
 */
export const PROVENANCE_TIER = Object.freeze({
  USER_ENTERED: 'user_entered',
  IMPORTED: 'imported',
  AI_EXTRACTED: 'ai_extracted',
  SYSTEM_DERIVED: 'system_derived',
  EXTERNALLY_VERIFIED: 'externally_verified',
});

/**
 * Deterministic Trust Weights assigned per Provenance Tier.
 */
export const PROVENANCE_WEIGHT = Object.freeze({
  [PROVENANCE_TIER.USER_ENTERED]: 0.4,
  [PROVENANCE_TIER.IMPORTED]: 0.85,
  [PROVENANCE_TIER.AI_EXTRACTED]: 0.5,
  [PROVENANCE_TIER.SYSTEM_DERIVED]: 0.7,
  [PROVENANCE_TIER.EXTERNALLY_VERIFIED]: 1.0,
});

/**
 * Precedence hierarchy for conflict resolution. Higher index beats lower index.
 */
const PRECEDENCE_ORDER = [
  PROVENANCE_TIER.AI_EXTRACTED,
  PROVENANCE_TIER.USER_ENTERED,
  PROVENANCE_TIER.SYSTEM_DERIVED,
  PROVENANCE_TIER.IMPORTED,
  PROVENANCE_TIER.EXTERNALLY_VERIFIED,
];

/**
 * Evaluates whether an incoming fact supersedes an existing fact based on
 * provenance precedence, timestamp freshness, and non-downgrade invariants.
 *
 * @param {object} existingFact
 * @param {object} incomingFact
 * @returns {boolean} True if incoming fact takes precedence.
 */
export function shouldIncomingFactSupersede(existingFact, incomingFact) {
  if (!existingFact) return true;
  if (!incomingFact) return false;

  const existingRank = PRECEDENCE_ORDER.indexOf(existingFact.provenanceTier);
  const incomingRank = PRECEDENCE_ORDER.indexOf(incomingFact.provenanceTier);

  // 1. Higher provenance tier strictly takes precedence
  if (incomingRank > existingRank) {
    return true;
  }
  if (incomingRank < existingRank) {
    return false;
  }

  // 2. Same provenance tier: check non-downgrade invariant for evidence strength
  const strengthRanks = {
    [EVIDENCE_STRENGTH.CLAIMED]: 1,
    [EVIDENCE_STRENGTH.SUPPORTED]: 2,
    [EVIDENCE_STRENGTH.VERIFIED]: 3,
  };
  const existingStrength = strengthRanks[existingFact.strength] || 0;
  const incomingStrength = strengthRanks[incomingFact.strength] || 0;

  if (incomingStrength > existingStrength) {
    return true;
  }
  if (incomingStrength < existingStrength) {
    return false;
  }

  // 3. Same tier and strength: latest timestamp wins
  const existingTime = new Date(existingFact.timestamp || 0).getTime();
  const incomingTime = new Date(incomingFact.timestamp || 0).getTime();
  return incomingTime >= existingTime;
}

/**
 * Compiles the canonical, conflict-resolved student source-of-truth from all
 * upstream data sources.
 *
 * @param {object} inputs
 * @param {object} inputs.user Authoritative user identity document.
 * @param {object} [inputs.profile] Student profile document.
 * @param {Array<object>} [inputs.resumes] List of resume documents.
 * @param {Array<object>} [inputs.evidenceChecks] List of verified institutional evidence checks.
 * @param {Array<object>} [inputs.assessmentAttempts] Raw assessment attempt history.
 * @param {Array<object>} [inputs.interviewSessions] Raw interview session history.
 * @returns {object} CanonicalStudentState
 */
export function assembleCanonicalStudentState({
  user,
  profile = null,
  resumes = [],
  evidenceChecks = [],
  assessmentAttempts = [],
  interviewSessions = [],
}) {
  if (!user || !user._id) {
    throw new Error('Canonical student assembly requires a valid user object with an _id');
  }

  const userIdStr = String(user._id);
  const ledger = [];
  const skillsMap = new Map();
  const projectsMap = new Map();
  const certificationsMap = new Map();

  // Helper to record provenance
  function recordFact({
    factId,
    entityType,
    entityKey,
    provenanceTier,
    sourceId,
    timestamp,
    payload,
    strength = EVIDENCE_STRENGTH.CLAIMED,
  }) {
    const fact = {
      factId,
      entityType,
      entityKey,
      provenanceTier,
      sourceId: String(sourceId || 'direct'),
      timestamp: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
      confidence: PROVENANCE_WEIGHT[provenanceTier] || 0.5,
      strength,
      payload,
    };
    ledger.push(fact);
    return fact;
  }

  // 1. Process Student Profile (User-Entered Facts)
  if (profile) {
    const profileTimestamp = profile.updatedAt || profile.createdAt || new Date();

    // Profile Skills
    for (const skill of profile.skills || []) {
      if (!skill.name) continue;
      const key = canonicalSkillKey(skill.name);
      const fact = recordFact({
        factId: `profile_sk_${key}`,
        entityType: 'skill',
        entityKey: key,
        provenanceTier: PROVENANCE_TIER.USER_ENTERED,
        sourceId: profile._id || userIdStr,
        timestamp: profileTimestamp,
        payload: {
          name: normalizeSkillName(skill.name),
          level: skill.level || 'beginner',
        },
        strength: EVIDENCE_STRENGTH.CLAIMED,
      });

      skillsMap.set(key, {
        key,
        name: fact.payload.name,
        strength: EVIDENCE_STRENGTH.CLAIMED,
        selfDeclaredLevel: fact.payload.level,
        provenanceTier: PROVENANCE_TIER.USER_ENTERED,
        sources: ['profile'],
        evidence: [
          {
            source: 'profile_entry',
            strength: EVIDENCE_STRENGTH.CLAIMED,
            detail: `Self-declared ${fact.payload.level} on profile`,
            reference: 'profile.skills',
          },
        ],
        lastUpdated: fact.timestamp,
      });
    }

    // Profile Projects
    for (const proj of profile.projects || []) {
      if (!proj.title) continue;
      const projKey = proj.title.toLowerCase().trim();
      recordFact({
        factId: `profile_proj_${projKey}`,
        entityType: 'project',
        entityKey: projKey,
        provenanceTier: PROVENANCE_TIER.USER_ENTERED,
        sourceId: profile._id || userIdStr,
        timestamp: profileTimestamp,
        payload: { ...proj },
        strength: EVIDENCE_STRENGTH.SUPPORTED,
      });

      projectsMap.set(projKey, {
        title: proj.title,
        description: proj.description || null,
        technologies: proj.technologies || [],
        projectUrl: proj.projectUrl || null,
        githubUrl: proj.githubUrl || null,
        provenanceTier: PROVENANCE_TIER.USER_ENTERED,
        source: 'profile',
      });

      // Projects promote listed technologies to SUPPORTED
      for (const tech of proj.technologies || []) {
        const key = canonicalSkillKey(tech);
        const existing = skillsMap.get(key);
        const supportEvidence = {
          source: 'project_evidence',
          strength: EVIDENCE_STRENGTH.SUPPORTED,
          detail: `Used in project "${proj.title}"`,
          reference: proj.title,
        };

        if (existing) {
          if (existing.strength === EVIDENCE_STRENGTH.CLAIMED) {
            existing.strength = EVIDENCE_STRENGTH.SUPPORTED;
            existing.provenanceTier = PROVENANCE_TIER.SYSTEM_DERIVED;
          }
          if (!existing.sources.includes('project')) existing.sources.push('project');
          existing.evidence.push(supportEvidence);
        } else {
          skillsMap.set(key, {
            key,
            name: normalizeSkillName(tech),
            strength: EVIDENCE_STRENGTH.SUPPORTED,
            selfDeclaredLevel: null,
            provenanceTier: PROVENANCE_TIER.SYSTEM_DERIVED,
            sources: ['project'],
            evidence: [supportEvidence],
            lastUpdated: profileTimestamp,
          });
        }
      }
    }

    // Profile Certifications
    for (const cert of profile.certifications || []) {
      if (!cert.name) continue;
      const certKey = cert.name.toLowerCase().trim();
      certificationsMap.set(certKey, {
        name: cert.name,
        issuer: cert.issuer || null,
        issueDate: cert.issueDate ? new Date(cert.issueDate).toISOString().slice(0, 10) : null,
        credentialUrl: cert.credentialUrl || null,
        provenanceTier: PROVENANCE_TIER.USER_ENTERED,
        source: 'profile',
      });
    }
  }

  // 2. Process Analysed Resumes (Grounded AI-Extracted Facts)
  for (const resume of resumes) {
    if (!resume.analysis?.parsed || resume.status !== 'completed') continue;
    const parsed = resume.analysis.parsed;
    const resumeTimestamp = resume.analysis.analyzedAt || resume.updatedAt || new Date();

    // Resume Skills (Grounded)
    for (const rSkill of parsed.skills || []) {
      const skillName = typeof rSkill === 'string' ? rSkill : rSkill.name;
      if (!skillName) continue;
      const key = canonicalSkillKey(skillName);
      const existing = skillsMap.get(key);

      const resumeEvidence = {
        source: 'resume_mention',
        strength: EVIDENCE_STRENGTH.CLAIMED,
        detail: `Extracted from resume "${resume.fileName || 'Resume'}"`,
        reference: String(resume._id),
      };

      if (!existing) {
        recordFact({
          factId: `resume_${resume._id}_sk_${key}`,
          entityType: 'skill',
          entityKey: key,
          provenanceTier: PROVENANCE_TIER.AI_EXTRACTED,
          sourceId: resume._id,
          timestamp: resumeTimestamp,
          payload: { name: normalizeSkillName(skillName) },
          strength: EVIDENCE_STRENGTH.CLAIMED,
        });

        skillsMap.set(key, {
          key,
          name: normalizeSkillName(skillName),
          strength: EVIDENCE_STRENGTH.CLAIMED,
          selfDeclaredLevel: null,
          provenanceTier: PROVENANCE_TIER.AI_EXTRACTED,
          sources: ['resume'],
          evidence: [resumeEvidence],
          lastUpdated: resumeTimestamp,
        });
      } else {
        if (!existing.sources.includes('resume')) existing.sources.push('resume');
        existing.evidence.push(resumeEvidence);
      }
    }

    // Resume Projects
    for (const rProj of parsed.projects || []) {
      if (!rProj.title) continue;
      const projKey = rProj.title.toLowerCase().trim();
      if (!projectsMap.has(projKey)) {
        projectsMap.set(projKey, {
          title: rProj.title,
          description: rProj.description || null,
          technologies: rProj.technologies || [],
          projectUrl: null,
          githubUrl: null,
          provenanceTier: PROVENANCE_TIER.AI_EXTRACTED,
          source: 'resume',
        });
      }
    }
  }

  // 3. Process Institutional Evidence Checks (EXTERNALLY_VERIFIED)
  for (const check of evidenceChecks) {
    if (!check.skill || !check.passed || !check.eligibleForVerified) continue;
    const key = canonicalSkillKey(check.skill);
    const existing = skillsMap.get(key);
    const checkTimestamp = check.createdAt || new Date();

    const verifiedEvidence = {
      source: check.sourceType === 'assessment' ? 'assessment' : 'human_interview',
      strength: EVIDENCE_STRENGTH.VERIFIED,
      detail: `Verified through ${check.sourceType} with score ${check.score}`,
      reference: String(check._id || check.sourceId || 'institutional_check'),
    };

    recordFact({
      factId: `verified_check_${check._id || key}`,
      entityType: 'skill',
      entityKey: key,
      provenanceTier: PROVENANCE_TIER.EXTERNALLY_VERIFIED,
      sourceId: check._id,
      timestamp: checkTimestamp,
      payload: { score: check.score, sourceType: check.sourceType },
      strength: EVIDENCE_STRENGTH.VERIFIED,
    });

    if (existing) {
      existing.strength = EVIDENCE_STRENGTH.VERIFIED;
      existing.provenanceTier = PROVENANCE_TIER.EXTERNALLY_VERIFIED;
      if (!existing.sources.includes(check.sourceType)) {
        existing.sources.push(check.sourceType);
      }
      existing.evidence.push(verifiedEvidence);
      existing.lastUpdated = checkTimestamp;
    } else {
      skillsMap.set(key, {
        key,
        name: normalizeSkillName(check.skill),
        strength: EVIDENCE_STRENGTH.VERIFIED,
        selfDeclaredLevel: null,
        provenanceTier: PROVENANCE_TIER.EXTERNALLY_VERIFIED,
        sources: [check.sourceType],
        evidence: [verifiedEvidence],
        lastUpdated: checkTimestamp,
      });
    }
  }

  // Assemble unified canonical state
  return {
    studentId: userIdStr,
    version: CANONICAL_MODEL_VERSION,
    identity: {
      userId: userIdStr,
      email: user.email,
      name: user.name,
      role: user.role || 'student',
      createdAt: user.createdAt || null,
    },
    academic: {
      collegeName: profile?.academic?.collegeName ?? null,
      degree: profile?.academic?.degree ?? null,
      branch: profile?.academic?.branch ?? null,
      currentSemester: profile?.academic?.currentSemester ?? null,
      graduationYear: profile?.academic?.graduationYear ?? null,
      cgpa: profile?.academic?.cgpa ?? null,
    },
    career: {
      targetRole: profile?.career?.targetRole ?? null,
      preferredLocation: profile?.career?.preferredLocation ?? null,
      careerInterests: profile?.career?.careerInterests ?? [],
      bio: profile?.career?.bio ?? null,
    },
    skills: Array.from(skillsMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    projects: Array.from(projectsMap.values()),
    certifications: Array.from(certificationsMap.values()),
    provenanceLedger: ledger,
    metadata: {
      compiledAt: new Date().toISOString(),
      sourceCounts: {
        hasProfile: Boolean(profile),
        resumesCount: resumes.length,
        evidenceChecksCount: evidenceChecks.length,
        assessmentAttemptsCount: assessmentAttempts.length,
        interviewSessionsCount: interviewSessions.length,
      },
    },
  };
}
