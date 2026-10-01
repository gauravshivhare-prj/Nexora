/**
 * Profile Normalization, Sanitization & Completeness Engine (Task 06)
 *
 * Normalizes student profile inputs against canonical taxonomies, detects
 * duplicate skills, standardizes academic credentials, computes profile completeness,
 * and maintains auditability.
 */

import { resolveCanonicalSkill } from '../skills/skillOntology.js';
import { canonicalSkill } from '../skills/skillKey.js';
import { SKILL_LEVELS, SKILL_LEVEL_VALUES } from '../../constants/profilePolicy.js';

const SKILL_LEVEL_RANKS = {
  [SKILL_LEVELS.BEGINNER]: 1,
  [SKILL_LEVELS.INTERMEDIATE]: 2,
  [SKILL_LEVELS.ADVANCED]: 3,
  [SKILL_LEVELS.EXPERT]: 4,
};

const DEGREE_MAPPINGS = new Map([
  ['btech', 'Bachelor of Technology'],
  ['b.tech', 'Bachelor of Technology'],
  ['b tech', 'Bachelor of Technology'],
  ['bachelor of technology', 'Bachelor of Technology'],
  ['be', 'Bachelor of Engineering'],
  ['b.e.', 'Bachelor of Engineering'],
  ['bachelor of engineering', 'Bachelor of Engineering'],
  ['mtech', 'Master of Technology'],
  ['m.tech', 'Master of Technology'],
  ['master of technology', 'Master of Technology'],
  ['bca', 'Bachelor of Computer Applications'],
  ['b.c.a.', 'Bachelor of Computer Applications'],
  ['bachelor of computer applications', 'Bachelor of Computer Applications'],
  ['mca', 'Master of Computer Applications'],
  ['m.c.a.', 'Master of Computer Applications'],
  ['master of computer applications', 'Master of Computer Applications'],
  ['bsc', 'Bachelor of Science'],
  ['b.sc', 'Bachelor of Science'],
  ['bachelor of science', 'Bachelor of Science'],
  ['msc', 'Master of Science'],
  ['m.sc', 'Master of Science'],
  ['master of science', 'Master of Science'],
]);

const BRANCH_MAPPINGS = new Map([
  ['cse', 'Computer Science & Engineering'],
  ['cs', 'Computer Science & Engineering'],
  ['computer science', 'Computer Science & Engineering'],
  ['computer science & engineering', 'Computer Science & Engineering'],
  ['computer science and engineering', 'Computer Science & Engineering'],
  ['it', 'Information Technology'],
  ['information technology', 'Information Technology'],
  ['ece', 'Electronics & Communication Engineering'],
  ['electronics and communication', 'Electronics & Communication Engineering'],
  ['electronics and communication engineering', 'Electronics & Communication Engineering'],
  ['ee', 'Electrical Engineering'],
  ['electrical engineering', 'Electrical Engineering'],
  ['me', 'Mechanical Engineering'],
  ['mechanical engineering', 'Mechanical Engineering'],
  ['ce', 'Civil Engineering'],
  ['civil engineering', 'Civil Engineering'],
  ['ai/ds', 'Artificial Intelligence & Data Science'],
  ['aids', 'Artificial Intelligence & Data Science'],
  ['ai & ds', 'Artificial Intelligence & Data Science'],
  ['artificial intelligence and data science', 'Artificial Intelligence & Data Science'],
]);

/**
 * Normalizes self-reported profile skills against canonical ontology.
 * Deduplicates skills case-insensitively and alias-sensitively, retaining the highest level.
 *
 * @param {Array<{ name: string, level: string }>} skills
 * @returns {Array<{ name: string, level: string, canonicalSkillId: string|null, evidenceTier: string }>}
 */
export function normalizeSkills(skills) {
  if (!Array.isArray(skills)) return [];

  const skillMap = new Map();

  for (const skill of skills) {
    if (!skill || typeof skill !== 'object' || !skill.name) continue;
    const rawName = String(skill.name).trim();
    if (!rawName) continue;

    const level = SKILL_LEVEL_VALUES.includes(skill.level) ? skill.level : SKILL_LEVELS.BEGINNER;
    const levelRank = SKILL_LEVEL_RANKS[level] || 1;

    // Resolve against canonical ontology or fallback to skillKey
    const canonical = resolveCanonicalSkill(rawName) || canonicalSkill(rawName);
    const canonicalName = canonical?.name || rawName;
    const canonicalId = canonical?.id || null;
    const key = (canonical?.key || canonicalName).toLowerCase();

    if (skillMap.has(key)) {
      const existing = skillMap.get(key);
      const existingRank = SKILL_LEVEL_RANKS[existing.level] || 1;
      if (levelRank > existingRank) {
        skillMap.set(key, {
          name: canonicalName,
          level,
          canonicalSkillId: canonicalId || existing.canonicalSkillId,
          evidenceTier: 'claimed',
        });
      }
    } else {
      skillMap.set(key, {
        name: canonicalName,
        level,
        canonicalSkillId: canonicalId,
        evidenceTier: 'claimed',
      });
    }
  }

  return Array.from(skillMap.values());
}

/**
 * Normalizes academic degree to standardized nomenclature.
 *
 * @param {string} degree
 * @returns {string|null}
 */
export function normalizeDegree(degree) {
  if (!degree || typeof degree !== 'string') return null;
  const cleaned = degree.trim().toLowerCase().replace(/\s+/g, ' ');
  return DEGREE_MAPPINGS.get(cleaned) || degree.trim();
}

/**
 * Normalizes academic engineering/science branch.
 *
 * @param {string} branch
 * @returns {string|null}
 */
export function normalizeBranch(branch) {
  if (!branch || typeof branch !== 'string') return null;
  const cleaned = branch.trim().toLowerCase().replace(/\s+/g, ' ');
  return BRANCH_MAPPINGS.get(cleaned) || branch.trim();
}

/**
 * Normalizes institution / college name with common acronym capitalizations.
 *
 * @param {string} college
 * @returns {string|null}
 */
export function normalizeCollegeName(college) {
  if (!college || typeof college !== 'string') return null;
  const trimmed = college.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;

  // Preserve uppercase for notable institution acronyms
  return trimmed.replace(/\b(iit|nit|iiit|bits|dtu|nsut|vit|srm|mit)\b/gi, (match) => match.toUpperCase());
}

/**
 * Normalizes project technologies against canonical taxonomy and removes duplicates.
 *
 * @param {Array<string>} technologies
 * @returns {Array<string>}
 */
export function normalizeProjectTechnologies(technologies) {
  if (!Array.isArray(technologies)) return [];
  const normalized = [];
  const seen = new Set();

  for (const tech of technologies) {
    if (!tech || typeof tech !== 'string') continue;
    const trimmed = tech.trim();
    if (!trimmed) continue;

    const canonical = resolveCanonicalSkill(trimmed) || canonicalSkill(trimmed);
    const finalName = canonical?.name || trimmed;
    const key = finalName.toLowerCase();

    if (!seen.has(key)) {
      seen.add(key);
      normalized.push(finalName);
    }
  }

  return normalized;
}

/**
 * Normalizes career preferences, interests, and target roles.
 *
 * @param {object} career
 * @returns {object}
 */
export function normalizeCareerPreferences(career) {
  if (!career || typeof career !== 'object') return {};

  const result = { ...career };

  if (typeof result.targetRole === 'string') {
    result.targetRole = result.targetRole.trim().replace(/\s+/g, ' ');
  }

  if (Array.isArray(result.careerInterests)) {
    const seen = new Set();
    const interests = [];
    for (const item of result.careerInterests) {
      if (typeof item !== 'string') continue;
      const clean = item.trim();
      const lower = clean.toLowerCase();
      if (clean && !seen.has(lower)) {
        seen.add(lower);
        interests.push(clean);
      }
    }
    result.careerInterests = interests;
  }

  return result;
}

/**
 * Computes profile completeness percentage, missing sections, and freshness.
 *
 * @param {object} profile
 * @returns {{ percentage: number, status: string, missingSections: string[], isStale: boolean, daysSinceUpdate: number }}
 */
export function calculateProfileCompleteness(profile) {
  if (!profile || typeof profile !== 'object') {
    return {
      percentage: 0,
      status: 'incomplete',
      missingSections: ['personal', 'academic', 'career', 'skills', 'projects'],
      isStale: false,
      daysSinceUpdate: 0,
    };
  }

  let earnedPoints = 0;
  const totalPoints = 100;
  const missing = [];

  // Personal (20 pts): phone (10), location (10)
  const hasPhone = Boolean(profile.personal?.phone);
  const hasLocation = Boolean(profile.personal?.city || profile.personal?.state);
  if (hasPhone) earnedPoints += 10;
  if (hasLocation) earnedPoints += 10;
  if (!hasPhone || !hasLocation) missing.push('personal');

  // Academic (25 pts): collegeName (10), degree/branch (10), graduationYear (5)
  const hasCollege = Boolean(profile.academic?.collegeName);
  const hasDegree = Boolean(profile.academic?.degree && profile.academic?.branch);
  const hasGradYear = Boolean(profile.academic?.graduationYear);
  if (hasCollege) earnedPoints += 10;
  if (hasDegree) earnedPoints += 10;
  if (hasGradYear) earnedPoints += 5;
  if (!hasCollege || !hasDegree || !hasGradYear) missing.push('academic');

  // Career (20 pts): targetRole (15), careerInterests (5)
  const hasTargetRole = Boolean(profile.career?.targetRole);
  const hasInterests = Array.isArray(profile.career?.careerInterests) && profile.career.careerInterests.length > 0;
  if (hasTargetRole) earnedPoints += 15;
  if (hasInterests) earnedPoints += 5;
  if (!hasTargetRole || !hasInterests) missing.push('career');

  // Skills (20 pts): at least 3 skills
  const skillCount = Array.isArray(profile.skills) ? profile.skills.length : 0;
  if (skillCount >= 3) {
    earnedPoints += 20;
  } else if (skillCount > 0) {
    earnedPoints += 10;
    missing.push('skills (recommended at least 3)');
  } else {
    missing.push('skills');
  }

  // Projects (15 pts): at least 1 project
  const projectCount = Array.isArray(profile.projects) ? profile.projects.length : 0;
  if (projectCount >= 1) {
    earnedPoints += 15;
  } else {
    missing.push('projects');
  }

  const percentage = Math.min(100, Math.round((earnedPoints / totalPoints) * 100));

  let status = 'incomplete';
  if (percentage >= 85) status = 'comprehensive';
  else if (percentage >= 60) status = 'detailed';
  else if (percentage >= 30) status = 'minimal';

  // Freshness check: considered stale if older than 180 days
  const updatedAt = profile.updatedAt ? new Date(profile.updatedAt) : new Date();
  const diffDays = Math.floor((Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24));
  const isStale = diffDays > 180;

  return {
    percentage,
    status,
    missingSections: missing,
    isStale,
    daysSinceUpdate: diffDays,
  };
}

/**
 * Computes audit diff between existing profile and changes being applied.
 *
 * @param {object} existingProfile
 * @param {object} changes
 * @param {string} source
 * @returns {Array<object>}
 */
export function generateAuditDiff(existingProfile, changes, source = 'user_direct') {
  if (!changes || typeof changes !== 'object') return [];

  const auditEntries = [];
  const now = new Date();

  for (const [path, newValue] of Object.entries(changes)) {
    const keys = path.split('.');
    let prev = existingProfile;
    for (const k of keys) {
      prev = prev?.[k];
    }

    if (JSON.stringify(prev) !== JSON.stringify(newValue)) {
      auditEntries.push({
        field: path,
        action: prev === undefined || prev === null ? 'created' : newValue === null ? 'cleared' : 'updated',
        previousValue: prev ?? null,
        newValue: newValue ?? null,
        source,
        timestamp: now,
      });
    }
  }

  return auditEntries;
}
