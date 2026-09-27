import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ASSESSMENT_CATALOG,
  ASSESSMENT_GROUPS,
  ASSESSMENT_GROUP_VALUES,
  getAssessmentById,
  getAssessmentCatalog,
  getAssessmentCatalogGroups,
  getAssessmentsByGroup,
  getAssessmentsForSkill,
} from '../src/domain/assessment/assessmentCatalog.js';
import {
  DIFFICULTY_LEVELS,
  DIFFICULTY_LEVEL_VALUES,
  QUESTION_TYPES,
  SCORING_STRATEGIES,
  validateAssessmentDefinition,
} from '../src/domain/assessment/assessmentContract.js';
import { canonicalSkill } from '../src/domain/skills/skillKey.js';
import { CAREER_ROLES } from '../src/domain/careers/roleCatalogue.js';
import { getAssessment, listAssessments } from '../src/services/assessment.service.js';

describe('A07 — Assessment Catalog Integrity: Groups, Skills & Difficulty', () => {
  const catalog = getAssessmentCatalog();

  it('exposes defined domain groups matching engineering and role tracks', () => {
    assert.deepEqual(
      Object.keys(ASSESSMENT_GROUPS).sort(),
      ['DATA', 'ENGINEERING', 'INFRASTRUCTURE'],
      'Assessment groups must match canonical tracks',
    );
    assert.ok(ASSESSMENT_GROUP_VALUES.includes('engineering'));
    assert.ok(ASSESSMENT_GROUP_VALUES.includes('data'));
    assert.ok(ASSESSMENT_GROUP_VALUES.includes('infrastructure'));
  });

  it('verifies every catalog assessment is assigned a valid domain group', () => {
    for (const asm of catalog) {
      assert.ok(
        asm.group && ASSESSMENT_GROUP_VALUES.includes(asm.group),
        `Assessment "${asm.id}" has invalid or missing group "${asm.group}"`,
      );
    }
  });

  it('correctly partitions catalog assessments into domain groups without orphans', () => {
    const grouped = getAssessmentCatalogGroups();
    assert.ok(Array.isArray(grouped[ASSESSMENT_GROUPS.ENGINEERING]));
    assert.ok(Array.isArray(grouped[ASSESSMENT_GROUPS.DATA]));
    assert.ok(Array.isArray(grouped[ASSESSMENT_GROUPS.INFRASTRUCTURE]));

    // Total grouped items must equal catalog size
    const totalGrouped = Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0);
    assert.equal(totalGrouped, catalog.length, 'No catalog item should be orphaned from groups');

    // Specific group checks
    const engAsms = getAssessmentsByGroup(ASSESSMENT_GROUPS.ENGINEERING);
    assert.ok(engAsms.some((a) => a.id === 'asm_javascript_intermediate'));
    assert.ok(engAsms.some((a) => a.id === 'asm_nodejs_intermediate'));
    assert.ok(engAsms.some((a) => a.id === 'asm_python_beginner'));

    const dataAsms = getAssessmentsByGroup(ASSESSMENT_GROUPS.DATA);
    assert.ok(dataAsms.some((a) => a.id === 'asm_mongodb_intermediate'));

    const infraAsms = getAssessmentsByGroup(ASSESSMENT_GROUPS.INFRASTRUCTURE);
    assert.ok(infraAsms.some((a) => a.id === 'asm_docker_beginner'));

    // Unknown group returns empty array
    assert.deepEqual(getAssessmentsByGroup('non_existent_group'), []);
  });

  it('verifies 100% of catalog skill references strictly ground in canonical taxonomy', () => {
    for (const asm of catalog) {
      const canonical = canonicalSkill(asm.skillKey);
      assert.ok(
        canonical,
        `Assessment "${asm.id}" references ungrounded primary skill: "${asm.skillKey}"`,
      );
      assert.equal(
        asm.skillKey,
        canonical.key,
        `Assessment "${asm.id}" skillKey must equal canonical key "${canonical.key}"`,
      );
      assert.equal(
        asm.skillName,
        canonical.name,
        `Assessment "${asm.id}" skillName must equal canonical name "${canonical.name}"`,
      );

      // Verify secondary skill keys if any
      if (Array.isArray(asm.secondarySkillKeys)) {
        for (const secKey of asm.secondarySkillKeys) {
          const secCanonical = canonicalSkill(secKey);
          assert.ok(
            secCanonical,
            `Assessment "${asm.id}" references ungrounded secondary skill "${secKey}"`,
          );
        }
      }
    }
  });

  it('verifies all catalog assessed skills align directly with career roles', () => {
    const allRoleSkills = new Set(
      CAREER_ROLES.flatMap((r) => [
        ...r.requiredSkills.map((s) => canonicalSkill(s)?.key),
        ...r.preferredSkills.map((s) => canonicalSkill(s)?.key),
      ]).filter(Boolean),
    );

    for (const asm of catalog) {
      assert.ok(
        allRoleSkills.has(asm.skillKey),
        `Catalog assessment "${asm.id}" skill "${asm.skillKey}" is not tied to any career role`,
      );
    }
  });

  it('verifies difficulty tiers are strictly compliant and well-calibrated', () => {
    const tiers = new Set(catalog.map((a) => a.difficulty));
    assert.ok(tiers.has(DIFFICULTY_LEVELS.BEGINNER), 'Catalog must contain beginner assessments');
    assert.ok(tiers.has(DIFFICULTY_LEVELS.INTERMEDIATE), 'Catalog must contain intermediate assessments');

    for (const asm of catalog) {
      assert.ok(
        DIFFICULTY_LEVEL_VALUES.includes(asm.difficulty),
        `Assessment "${asm.id}" has invalid difficulty "${asm.difficulty}"`,
      );
    }
  });
});

describe('A07 — Assessment Catalog Integrity: Availability & Prevention of Orphan/Invalid Entries', () => {
  it('ensures all curated catalog items are active and available by default', () => {
    const all = getAssessmentCatalog();
    const active = getAssessmentCatalog({ activeOnly: true });

    assert.equal(all.length, active.length, 'All curated assessments should be active by default');
    for (const asm of all) {
      assert.equal(asm.isActive, true, `Assessment "${asm.id}" should have isActive: true`);
    }
  });

  it('supports activeOnly filter in catalog retrieval helpers', () => {
    // getAssessmentById with activeOnly
    const existingActive = getAssessmentById('asm_javascript_intermediate', { activeOnly: true });
    assert.ok(existingActive);

    // Unknown ID returns null
    assert.equal(getAssessmentById('non_existent', { activeOnly: true }), null);
    assert.equal(getAssessmentById(null), null);
    assert.equal(getAssessmentById(123), null);

    // getAssessmentsForSkill with activeOnly
    const jsAsms = getAssessmentsForSkill('JavaScript', { activeOnly: true });
    assert.ok(jsAsms.length > 0);
    assert.deepEqual(getAssessmentsForSkill('unknown_skill'), []);
    assert.deepEqual(getAssessmentsForSkill(null), []);
  });

  it('prevents orphan assessment definitions with unknown canonical skill keys', () => {
    const invalidDef = {
      id: 'asm_invalid_skill_test',
      skillKey: 'TotallyInventedSkill_ABC',
      difficulty: DIFFICULTY_LEVELS.BEGINNER,
      title: 'Invalid Skill Assessment',
      description: 'Tests failure on orphan skills.',
      questions: [
        {
          id: 'q1',
          type: QUESTION_TYPES.BOOLEAN,
          prompt: 'Is this valid?',
          expectedAnswer: { expectedValue: true },
        },
      ],
    };

    assert.throws(
      () => validateAssessmentDefinition(invalidDef),
      /Unknown canonical skill: "TotallyInventedSkill_ABC"/,
    );
  });

  it('prevents orphan assessment definitions with unknown secondary skill keys', () => {
    const invalidSecondaryDef = {
      id: 'asm_invalid_secondary_test',
      skillKey: 'JavaScript',
      secondarySkillKeys: ['NonExistentSecondarySkill_XYZ'],
      difficulty: DIFFICULTY_LEVELS.INTERMEDIATE,
      title: 'Invalid Secondary Skill Assessment',
      description: 'Tests failure on orphan secondary skills.',
      questions: [
        {
          id: 'q1',
          type: QUESTION_TYPES.BOOLEAN,
          prompt: 'Is this valid?',
          expectedAnswer: { expectedValue: true },
        },
      ],
    };

    assert.throws(
      () => validateAssessmentDefinition(invalidSecondaryDef),
      /Unknown secondary canonical skill: "NonExistentSecondarySkill_XYZ"/,
    );
  });

  it('prevents invalid assessment definitions with invalid difficulty', () => {
    const invalidDifficultyDef = {
      id: 'asm_invalid_diff_test',
      skillKey: 'JavaScript',
      difficulty: 'grandmaster',
      title: 'Grandmaster JS',
      description: 'Invalid difficulty.',
      questions: [
        {
          id: 'q1',
          type: QUESTION_TYPES.BOOLEAN,
          prompt: 'Is this valid?',
          expectedAnswer: { expectedValue: true },
        },
      ],
    };

    assert.throws(
      () => validateAssessmentDefinition(invalidDifficultyDef),
      /Invalid difficulty "grandmaster"/,
    );
  });

  it('prevents invalid assessment definitions with invalid domain group', () => {
    const invalidGroupDef = {
      id: 'asm_invalid_group_test',
      skillKey: 'JavaScript',
      difficulty: DIFFICULTY_LEVELS.BEGINNER,
      group: 'crypto_trading',
      title: 'Crypto Trading JS',
      description: 'Invalid group.',
      questions: [
        {
          id: 'q1',
          type: QUESTION_TYPES.BOOLEAN,
          prompt: 'Is this valid?',
          expectedAnswer: { expectedValue: true },
        },
      ],
    };

    assert.throws(
      () => validateAssessmentDefinition(invalidGroupDef),
      /Invalid assessment group: "crypto_trading"/,
    );
  });

  it('prevents invalid assessment definitions with empty or duplicate questions', () => {
    // 0 questions
    assert.throws(
      () =>
        validateAssessmentDefinition({
          id: 'asm_empty_questions',
          skillKey: 'JavaScript',
          difficulty: DIFFICULTY_LEVELS.BEGINNER,
          title: 'Empty Assessment',
          description: 'No questions.',
          questions: [],
        }),
      /Assessment must contain an array of at least one question/,
    );

    // Duplicate question IDs
    assert.throws(
      () =>
        validateAssessmentDefinition({
          id: 'asm_dup_questions',
          skillKey: 'JavaScript',
          difficulty: DIFFICULTY_LEVELS.BEGINNER,
          title: 'Duplicate Questions',
          description: 'Duplicate IDs.',
          questions: [
            { id: 'q_same', type: QUESTION_TYPES.BOOLEAN, prompt: 'Q1', expectedAnswer: { expectedValue: true } },
            { id: 'q_same', type: QUESTION_TYPES.BOOLEAN, prompt: 'Q2', expectedAnswer: { expectedValue: false } },
          ],
        }),
      /Duplicate question id: "q_same"/,
    );
  });

  it('prevents invalid question definitions with orphan choice option references', () => {
    // Single choice with non-existent correctOptionId
    assert.throws(
      () =>
        validateAssessmentDefinition({
          id: 'asm_orphan_option',
          skillKey: 'JavaScript',
          difficulty: DIFFICULTY_LEVELS.BEGINNER,
          title: 'Orphan Option',
          description: 'Missing correct option.',
          questions: [
            {
              id: 'q1',
              type: QUESTION_TYPES.SINGLE_CHOICE,
              prompt: 'Pick one',
              options: [
                { id: 'opt_a', text: 'Option A' },
                { id: 'opt_b', text: 'Option B' },
              ],
              expectedAnswer: { correctOptionId: 'opt_c_does_not_exist' },
            },
          ],
        }),
      /does not match any valid option ID/,
    );
  });

  it('prevents invalid passMark and timeLimit parameters', () => {
    const base = {
      id: 'asm_param_check',
      skillKey: 'JavaScript',
      difficulty: DIFFICULTY_LEVELS.BEGINNER,
      title: 'Param Check',
      description: 'Checking numeric bounds.',
      questions: [
        { id: 'q1', type: QUESTION_TYPES.BOOLEAN, prompt: 'Q', expectedAnswer: { expectedValue: true } },
      ],
    };

    // Invalid passMark
    assert.throws(() => validateAssessmentDefinition({ ...base, passMark: 0 }), /passMark must be a number/);
    assert.throws(() => validateAssessmentDefinition({ ...base, passMark: 1.5 }), /passMark must be a number/);
    assert.throws(() => validateAssessmentDefinition({ ...base, passMark: -0.5 }), /passMark must be a number/);

    // Invalid timeLimitMinutes
    assert.throws(() => validateAssessmentDefinition({ ...base, timeLimitMinutes: -10 }), /timeLimitMinutes must be a positive integer/);
    assert.throws(() => validateAssessmentDefinition({ ...base, timeLimitMinutes: 0 }), /timeLimitMinutes must be a positive integer/);
    assert.throws(() => validateAssessmentDefinition({ ...base, timeLimitMinutes: 12.5 }), /timeLimitMinutes must be a positive integer/);
  });
});
