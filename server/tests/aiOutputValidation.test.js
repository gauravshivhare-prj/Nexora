import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  RAW_AI_OUTPUT_FIXTURES,
  MALFORMED_RESUME_FIXTURES,
  MALFORMED_INTERVIEW_FIXTURES,
  MALFORMED_NARRATIVE_FIXTURES,
} from './fixtures/malformedAiOutputFixtures.js';
import { parseJsonObject } from '../src/services/ai/aiJson.js';
import { validateParsedResume } from '../src/domain/resume/parsedResumeSchema.js';
import { groundParsedResume } from '../src/domain/resume/groundParsedResume.js';
import { validateAiEvaluationJson } from '../src/domain/interview/interviewEvaluationSchema.js';
import { groundAnswerEvaluation } from '../src/domain/interview/interviewAnswerGrounding.js';
import { validateNarrative, groundNarrative } from '../src/domain/careerTwin/careerTwinNarrative.js';
import { knownSkillNames } from '../src/domain/skills/skillKey.js';

describe('TASK A23 — Structured AI Output Validation, Grounding & Bounds Suite', () => {
  describe('1. Raw AI Output Formatting & Syntactic Bounds (aiJson)', () => {
    it('rejects empty and whitespace-only responses with safe error messages', () => {
      const emptyRes = parseJsonObject(RAW_AI_OUTPUT_FIXTURES.emptyString);
      assert.ok(emptyRes.error);
      assert.equal(emptyRes.error, 'The AI returned an empty response.');

      const wsRes = parseJsonObject(RAW_AI_OUTPUT_FIXTURES.whitespaceOnly);
      assert.ok(wsRes.error);
      assert.equal(wsRes.error, 'The AI returned an empty response.');
    });

    it('rejects responses exceeding safety bounds (> 200,000 characters)', () => {
      const res = parseJsonObject(RAW_AI_OUTPUT_FIXTURES.oversizedResponse);
      assert.ok(res.error);
      assert.equal(res.error, 'The AI response was too large to process.');
    });

    it('rejects malformed syntax: unclosed braces, trailing commas, and truncated tokens', () => {
      const unclosed = parseJsonObject(RAW_AI_OUTPUT_FIXTURES.unclosedJson);
      assert.ok(unclosed.error);
      assert.ok(unclosed.error.includes('JSON'));

      const trailingComma = parseJsonObject(RAW_AI_OUTPUT_FIXTURES.trailingCommaJson);
      assert.ok(trailingComma.error);
      assert.ok(trailingComma.error.includes('not valid JSON'));

      const truncated = parseJsonObject(RAW_AI_OUTPUT_FIXTURES.truncatedTokenJson);
      assert.ok(truncated.error);
      assert.ok(truncated.error.includes('JSON'));
    });

    it('rejects non-object JSON payloads (bare arrays, strings, numbers, booleans, null)', () => {
      for (const [key, payload] of Object.entries({
        bareArray: RAW_AI_OUTPUT_FIXTURES.bareArrayJson,
        bareString: RAW_AI_OUTPUT_FIXTURES.bareStringJson,
        bareNumber: RAW_AI_OUTPUT_FIXTURES.bareNumberJson,
        bareBoolean: RAW_AI_OUTPUT_FIXTURES.bareBooleanJson,
        bareNull: RAW_AI_OUTPUT_FIXTURES.bareNullJson,
      })) {
        const res = parseJsonObject(payload);
        assert.ok(res.error, `${key} must fail with non-object error`);
      }
    });

    it('rejects HTML gateway errors and plain unstructured prose without JSON', () => {
      const htmlRes = parseJsonObject(RAW_AI_OUTPUT_FIXTURES.htmlGatewayError);
      assert.ok(htmlRes.error);
      assert.equal(htmlRes.error, 'The AI response did not contain a JSON object.');

      const proseRes = parseJsonObject(RAW_AI_OUTPUT_FIXTURES.proseWithoutJson);
      assert.ok(proseRes.error);
      assert.equal(proseRes.error, 'The AI response did not contain a JSON object.');
    });

    it('successfully extracts valid JSON wrapped in markdown fences or inline prose', () => {
      const fencedRes = parseJsonObject(RAW_AI_OUTPUT_FIXTURES.fencedValidJson);
      assert.ok(fencedRes.value);
      assert.equal(fencedRes.value.basics.fullName, 'Gaurav Shivhare');
      assert.deepEqual(fencedRes.value.skills, ['JavaScript', 'Node.js']);

      const unfencedRes = parseJsonObject(RAW_AI_OUTPUT_FIXTURES.unfencedInlineJson);
      assert.ok(unfencedRes.value);
      assert.equal(unfencedRes.value.basics.fullName, 'Gaurav Shivhare');
    });
  });

  describe('2. Structured Resume Extraction Schema & Bounds (parsedResumeSchema)', () => {
    it('rejects non-object root and wrong-type sections (skills, basics, education, projects)', () => {
      const nonObj = validateParsedResume(MALFORMED_RESUME_FIXTURES.nonObjectRoot);
      assert.equal(nonObj.value, null);
      assert.ok(nonObj.errors.some((e) => e.includes('not a parsed-resume object')));

      const wrongSkills = validateParsedResume(MALFORMED_RESUME_FIXTURES.wrongTypeSkills);
      assert.equal(wrongSkills.value, null);
      assert.ok(wrongSkills.errors.some((e) => e.includes('`skills` was not a list')));

      const wrongBasics = validateParsedResume(MALFORMED_RESUME_FIXTURES.wrongTypeBasics);
      assert.equal(wrongBasics.value, null);
      assert.ok(wrongBasics.errors.some((e) => e.includes('`basics` was not an object')));

      const wrongEdu = validateParsedResume(MALFORMED_RESUME_FIXTURES.wrongTypeEducation);
      assert.equal(wrongEdu.value, null);
      assert.ok(wrongEdu.errors.some((e) => e.includes('`education` was not a list')));

      const wrongProj = validateParsedResume(MALFORMED_RESUME_FIXTURES.wrongTypeProjects);
      assert.equal(wrongProj.value, null);
      assert.ok(wrongProj.errors.some((e) => e.includes('`projects` was not a list')));
    });

    it('enforces skills list capacity cap and truncates with warning', () => {
      const result = validateParsedResume(MALFORMED_RESUME_FIXTURES.excessiveSkillsList);
      assert.ok(result.value);
      assert.equal(result.value.skills.length, 100);
      assert.equal(result.errors.length, 0);
    });

    it('enforces string field length limits (drops oversized string fields with warning)', () => {
      const result = validateParsedResume(MALFORMED_RESUME_FIXTURES.oversizedStringField);
      assert.ok(result.value);
      assert.equal(result.value.basics.fullName, null);
      assert.ok(result.warnings.some((w) => w.includes('basics.fullName') && w.includes('300')));
    });

    it('enforces graduation year bounds [1950, 2100] rejecting ancient, distant-future, and NaN years', () => {
      const futureRes = validateParsedResume(MALFORMED_RESUME_FIXTURES.outOfBoundsGraduationYearFuture);
      assert.ok(futureRes.value);
      assert.equal(futureRes.value.education[0].endYear, null);
      assert.ok(futureRes.warnings.some((w) => w.includes('2100')));

      const pastRes = validateParsedResume(MALFORMED_RESUME_FIXTURES.outOfBoundsGraduationYearPast);
      assert.ok(pastRes.value);
      assert.equal(pastRes.value.education[0].endYear, null);
      assert.ok(pastRes.warnings.some((w) => w.includes('1950')));

      const negRes = validateParsedResume(MALFORMED_RESUME_FIXTURES.negativeGraduationYear);
      assert.ok(negRes.value);
      assert.equal(negRes.value.education[0].endYear, null);

      const nanRes = validateParsedResume(MALFORMED_RESUME_FIXTURES.nanGraduationYear);
      assert.ok(nanRes.value);
      assert.equal(nanRes.value.education[0].endYear, null);
    });

    it('detects and rejects forbidden security fields and prototype pollution in resume output', () => {
      const secResult = validateParsedResume(MALFORMED_RESUME_FIXTURES.securityForbiddenFields);
      assert.equal(secResult.value, null);
      assert.ok(secResult.errors.some((e) => e.includes('Security violation: AI resume output contains forbidden security field')));

      const protoRaw = JSON.parse(MALFORMED_RESUME_FIXTURES.securityPrototypePollution);
      const protoResult = validateParsedResume(protoRaw);
      assert.equal(protoResult.value, null);
      assert.ok(protoResult.errors.some((e) => e.includes('Security violation')));
    });
  });

  describe('3. Resume Grounding & Hallucination Defense (groundParsedResume)', () => {
    it('strictly drops hallucinated skills and technologies not found in source text', () => {
      const fixture = MALFORMED_RESUME_FIXTURES.groundingHallucination;
      const schemaValid = validateParsedResume(fixture.extracted);
      assert.ok(schemaValid.value);

      const grounded = groundParsedResume(schemaValid.value, fixture.sourceText);

      // Only JavaScript and HTML appeared in source text
      const groundedSkillNames = grounded.value.skills.map((s) => s.name);
      assert.deepEqual(groundedSkillNames, ['JavaScript', 'HTML']);

      // Docker, Kubernetes, AWS must be dropped and recorded as warnings
      assert.equal(groundedSkillNames.includes('Docker'), false);
      assert.equal(groundedSkillNames.includes('Kubernetes'), false);
      assert.equal(groundedSkillNames.includes('AWS'), false);

      assert.ok(grounded.warnings.some((w) => w.includes('Docker') && w.includes('does not appear in the resume')));
      assert.ok(grounded.warnings.some((w) => w.includes('Kubernetes') && w.includes('does not appear in the resume')));
      assert.ok(grounded.warnings.some((w) => w.includes('AWS') && w.includes('does not appear in the resume')));

      // In project technologies: Docker was hallucinated, HTML & CSS were in source
      assert.deepEqual(grounded.value.projects[0].technologies, ['HTML', 'CSS']);
    });

    it('drops non-canonical skills even if present in source text', () => {
      const fixture = MALFORMED_RESUME_FIXTURES.nonCanonicalSkill;
      const schemaValid = validateParsedResume(fixture.extracted);
      const grounded = groundParsedResume(schemaValid.value, fixture.sourceText);

      assert.equal(grounded.value.skills.length, 1);
      assert.equal(grounded.value.skills[0].name, 'JavaScript');
      assert.ok(grounded.warnings.some((w) => w.includes('UltraSuperMegaTechX9000') && w.includes('not in the canonical skill taxonomy')));
    });

    it('drops fabricated educational institutions not present in source text', () => {
      const fixture = MALFORMED_RESUME_FIXTURES.fabricatedInstitution;
      const schemaValid = validateParsedResume(fixture.extracted);
      const grounded = groundParsedResume(schemaValid.value, fixture.sourceText);

      assert.equal(grounded.value.education[0].institution, null);
      assert.ok(grounded.warnings.some((w) => w.includes('Harvard University') && w.includes('does not appear in the resume')));
    });
  });

  describe('4. Structured Interview Evaluation Schema & Bounds (interviewEvaluationSchema)', () => {
    it('rejects missing dimensions object and missing required dimension keys', () => {
      const missingDims = validateAiEvaluationJson(MALFORMED_INTERVIEW_FIXTURES.missingDimensionsObject);
      assert.equal(missingDims.isValid, false);
      assert.ok(missingDims.errors.some((e) => e.includes('Missing required rubric dimensions')));

      const missingKey = validateAiEvaluationJson(MALFORMED_INTERVIEW_FIXTURES.missingRequiredDimension);
      assert.equal(missingKey.isValid, false);
      assert.ok(missingKey.errors.some((e) => e.includes('Missing required rubric dimension: "relevance"')));
    });

    it('rejects dimension scores out of numeric bounds ([0.0, 1.0], strings, NaN, Infinity)', () => {
      const above = validateAiEvaluationJson(MALFORMED_INTERVIEW_FIXTURES.dimensionAboveUpperBound);
      assert.equal(above.isValid, false);
      assert.ok(above.errors.some((e) => e.includes('out of range. Must be between 0.0 and 1.0')));

      const below = validateAiEvaluationJson(MALFORMED_INTERVIEW_FIXTURES.dimensionBelowLowerBound);
      assert.equal(below.isValid, false);
      assert.ok(below.errors.some((e) => e.includes('out of range. Must be between 0.0 and 1.0')));

      const nan = validateAiEvaluationJson(MALFORMED_INTERVIEW_FIXTURES.dimensionNanOrString);
      assert.equal(nan.isValid, false);
      assert.ok(nan.errors.some((e) => e.includes('must be a numeric value')));

      const inf = validateAiEvaluationJson(MALFORMED_INTERVIEW_FIXTURES.dimensionInfinity);
      assert.equal(inf.isValid, false);
      assert.ok(inf.errors.some((e) => e.includes('must be a numeric value')));
    });

    it('enforces feedback text bounds (min 10 chars, max length)', () => {
      const short = validateAiEvaluationJson(MALFORMED_INTERVIEW_FIXTURES.feedbackTooShort);
      assert.equal(short.isValid, false);
      assert.ok(short.errors.some((e) => e.includes('Feedback summary is too short')));

      const long = validateAiEvaluationJson(MALFORMED_INTERVIEW_FIXTURES.feedbackTooLong);
      assert.equal(long.isValid, false);
      assert.ok(long.errors.some((e) => e.includes('exceeds maximum length')));
    });

    it('enforces strengths and growth areas bounds (max items, max item length)', () => {
      const excCount = validateAiEvaluationJson(MALFORMED_INTERVIEW_FIXTURES.excessiveStrengthsCount);
      assert.equal(excCount.isValid, false);
      assert.ok(excCount.errors.some((e) => e.includes('Strengths list cannot exceed 5 items')));

      const itemLen = validateAiEvaluationJson(MALFORMED_INTERVIEW_FIXTURES.oversizedStrengthItem);
      assert.equal(itemLen.isValid, false);
      assert.ok(itemLen.errors.some((e) => e.includes('exceeds maximum length of 250 characters')));
    });

    it('blocks prompt injection in feedback and forbidden institutional security fields', () => {
      const injection = validateAiEvaluationJson(MALFORMED_INTERVIEW_FIXTURES.promptInjectionInFeedback);
      assert.equal(injection.isValid, false);
      assert.ok(injection.errors.some((e) => e.includes('potentially unsafe or injection-like content')));

      const sec = validateAiEvaluationJson(MALFORMED_INTERVIEW_FIXTURES.forbiddenSecurityFields);
      assert.equal(sec.isValid, false);
      assert.ok(sec.errors.some((e) => e.includes('Security violation: AI evaluation output contains forbidden security field')));

      const proto = validateAiEvaluationJson(MALFORMED_INTERVIEW_FIXTURES.prototypePollutionKey);
      assert.equal(proto.isValid, false);
      assert.ok(proto.errors.some((e) => e.includes('Security violation')));
    });

    it('rejects unexpected fields in strict validation mode', () => {
      const strictRes = validateAiEvaluationJson(MALFORMED_INTERVIEW_FIXTURES.unexpectedFieldInStrict, { strict: true });
      assert.equal(strictRes.isValid, false);
      assert.ok(strictRes.errors.some((e) => e.includes('Unexpected field "arbitraryUntrustedField"')));
    });
  });

  describe('5. CareerTwin Narrative Validation & Grounding (careerTwinNarrative)', () => {
    it('rejects non-object root, missing summary, non-string, and empty summary fields', () => {
      const nonObj = validateNarrative(MALFORMED_NARRATIVE_FIXTURES.nonObjectRoot);
      assert.equal(nonObj.value, null);
      assert.ok(nonObj.error.includes('not an object'));

      const missingSummary = validateNarrative(MALFORMED_NARRATIVE_FIXTURES.missingSummaryField);
      assert.equal(missingSummary.value, null);
      assert.ok(missingSummary.error.includes('unusable'));

      const nonStr = validateNarrative(MALFORMED_NARRATIVE_FIXTURES.nonStringSummary);
      assert.equal(nonStr.value, null);

      const empty = validateNarrative(MALFORMED_NARRATIVE_FIXTURES.emptySummary);
      assert.equal(empty.value, null);
    });

    it('enforces maximum character length of 1200 on summary text', () => {
      const oversized = validateNarrative(MALFORMED_NARRATIVE_FIXTURES.oversizedSummary);
      assert.equal(oversized.value, null);
      assert.ok(oversized.error.includes('at most 1200'));
    });

    it('blocks forbidden security fields and prototype pollution in narrative output', () => {
      const sec = validateNarrative(MALFORMED_NARRATIVE_FIXTURES.securityForbiddenFields);
      assert.equal(sec.value, null);
      assert.ok(sec.error.includes('Security violation'));

      const proto = validateNarrative(JSON.parse(MALFORMED_NARRATIVE_FIXTURES.securityPrototypePollution));
      assert.equal(proto.value, null);
      assert.ok(proto.error.includes('Security violation'));
    });

    it('strictly rejects narrative that mentions known skills unrecorded in the CareerTwin', () => {
      const fixture = MALFORMED_NARRATIVE_FIXTURES.hallucinatedUnrecordedSkills;
      const grounding = groundNarrative(fixture.narrative, fixture.twin, knownSkillNames());

      assert.equal(grounding.ok, false);
      assert.ok(grounding.warnings.some((w) => w.includes('Docker') && w.includes('not one of your recorded skills')));
      assert.ok(grounding.warnings.some((w) => w.includes('Kubernetes') && w.includes('not one of your recorded skills')));
    });

    it('accepts narrative when mentioned skills match the student CareerTwin', () => {
      const twin = {
        skills: [
          { key: 'nodejs', name: 'Node.js', strength: 'supported' },
        ],
      };
      const validNarrative = 'You have built backend services using Node.js and written code with verified strength.';
      const grounding = groundNarrative(validNarrative, twin, knownSkillNames());

      assert.equal(grounding.ok, true);
      assert.equal(grounding.warnings.length, 0);
    });
  });
});
