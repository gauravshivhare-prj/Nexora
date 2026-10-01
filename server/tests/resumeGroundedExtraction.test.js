import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';
import crypto from 'node:crypto';

import {
  startTestServer,
  clearResumes,
  clearUsers,
  postJson,
  sendJsonWithToken,
  getWithToken,
} from './helpers/testServer.js';
import {
  registerAiProvider,
  resetAiProviders,
  useAiProvider,
} from '../src/services/ai/aiProvider.js';
import { groundParsedResume, findSpanInText } from '../src/domain/resume/groundParsedResume.js';
import {
  detectResumeConflicts,
  CONFLICT_TYPES,
  CONFLICT_SEVERITY,
} from '../src/domain/resume/resumeConflictDetector.js';
import { createResume, analyseResume, getResume } from '../src/services/resume.service.js';
import { Resume, StudentProfile, User } from '../src/models/index.js';
import { PROCESSING_STATUS } from '../src/constants/resumePolicy.js';

const PASSWORD = 'Password123!';

const SOURCE_RESUME = `
Gaurav Shivhare
Email: gaurav@example.com
Phone: +91 98765 43210
Location: Bhopal, India
Portfolio: https://github.com/gaurav-nexora

Education:
National Institute of Technology Bhopal, Bachelor of Technology in Computer Science, 2021 - 2025.

Skills:
JavaScript, TypeScript, Node.js, Express.js, React, Docker, MongoDB, SQL, Git.

Experience:
Software Engineering Intern at CloudTech Labs (2024 - 2024)
- Built microservices using Node.js, Express, and Docker.
- Optimized database queries in MongoDB and PostgreSQL.

Projects:
Nexora Career Intelligence Platform
Technologies: React, Node.js, MongoDB, Docker
Architected AI career twin and career readiness pipelines.
`;

const AI_PARSED_OUTPUT = {
  basics: {
    fullName: 'Gaurav Shivhare',
    email: 'gaurav@example.com',
    phone: '+91 98765 43210',
    location: 'Bhopal, India',
    links: ['https://github.com/gaurav-nexora', 'https://malicious-hallucinated-site.xyz'],
  },
  education: [
    {
      institution: 'National Institute of Technology Bhopal',
      degree: 'Bachelor of Technology',
      field: 'Computer Science',
      startYear: 2021,
      endYear: 2025,
      grade: '8.8 CGPA',
    },
  ],
  skills: [
    { name: 'JavaScript' },
    { name: 'Node.js' },
    { name: 'React' },
    { name: 'Docker' },
    { name: 'MongoDB' },
    { name: 'Kubernetes' }, // Hallucinated: not in source resume text
    { name: 'Solidity' },   // Hallucinated: not in source resume text
  ],
  projects: [
    {
      title: 'Nexora Career Intelligence Platform',
      description: 'Career twin architecture',
      technologies: ['React', 'Node.js', 'MongoDB', 'Docker', 'AWS Lambda'], // AWS Lambda hallucinated
    },
  ],
  experience: [
    {
      organisation: 'CloudTech Labs',
      title: 'Software Engineering Intern',
      startDate: '2024',
      endDate: '2024',
      description: 'Built microservices using Node.js',
    },
  ],
  certifications: [
    {
      name: 'AWS Certified Solutions Architect', // Hallucinated
      issuer: 'Amazon Web Services',
      issueYear: 2024,
    },
  ],
  achievements: ['Published paper in IEEE'],
};

describe('Task 05 — Resume Intelligence & Grounded Extraction Pipeline Suite', () => {
  let server;
  let counter = 0;

  before(async () => {
    server = await startTestServer();
    registerAiProvider({
      name: 'grounded-test-double',
      async complete() {
        return {
          text: JSON.stringify(AI_PARSED_OUTPUT),
          model: 'gemini-1.5-pro-grounded-test',
        };
      },
    });
  });

  after(async () => {
    resetAiProviders();
    await server.close();
  });

  beforeEach(async () => {
    await clearResumes();
    await clearUsers();
    useAiProvider('grounded-test-double');
  });

  async function registerAndLogin(emailPrefix = 'task05') {
    counter += 1;
    const email = `${emailPrefix}.${Date.now()}.${counter}@example.com`;
    const userRes = await postJson(server.baseUrl, '/api/auth/register', {
      name: 'Gaurav Grounded',
      email,
      password: PASSWORD,
    });
    const loginRes = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password: PASSWORD,
    });
    return {
      userId: loginRes.body.data.user.id,
      token: loginRes.body.data.token,
      email,
    };
  }

  // -------------------------------------------------------------------------
  // 1. Text Grounding, Exact Character Span Boundaries & Traceability
  // -------------------------------------------------------------------------
  describe('1. Grounded Extraction & Character Span Attribution', () => {
    it('accurately identifies exact character offsets and matched text for grounded entities', () => {
      const span = findSpanInText(SOURCE_RESUME, 'National Institute of Technology Bhopal');
      assert.ok(span, 'Span should be found');
      assert.equal(span.matchedText, 'National Institute of Technology Bhopal');
      assert.ok(span.startOffset > 0);
      assert.ok(span.endOffset > span.startOffset);
      assert.equal(SOURCE_RESUME.slice(span.startOffset, span.endOffset), span.matchedText);
    });

    it('indexes grounded entities with canonicalSkillId, startOffset, endOffset and evidenceTier: claimed', () => {
      const grounded = groundParsedResume(AI_PARSED_OUTPUT, SOURCE_RESUME);

      // Verify provenance index structure
      assert.ok(Array.isArray(grounded.provenanceIndex));
      assert.ok(grounded.provenanceIndex.length > 0);

      const skillEntries = grounded.provenanceIndex.filter((p) => p.entityType === 'skill');
      assert.ok(skillEntries.length >= 5);

      for (const entry of skillEntries) {
        assert.equal(entry.evidenceTier, 'claimed', 'All resume extracted evidence must be Tier 1 (claimed)');
        assert.ok(entry.canonicalSkillId.startsWith('sk_'), `Skill ${entry.name} must resolve to canonical ID`);
        assert.ok(typeof entry.startOffset === 'number' && entry.startOffset >= 0);
        assert.ok(typeof entry.endOffset === 'number' && entry.endOffset > entry.startOffset);
        assert.equal(
          SOURCE_RESUME.slice(entry.startOffset, entry.endOffset).toLowerCase(),
          entry.matchedText.toLowerCase(),
        );
      }
    });

    it('strictly drops hallucinated skills, links, and certifications with explicit warnings', () => {
      const grounded = groundParsedResume(AI_PARSED_OUTPUT, SOURCE_RESUME);

      const skillNames = grounded.value.skills.map((s) => s.name);
      assert.ok(skillNames.includes('JavaScript'));
      assert.ok(skillNames.includes('Node.js'));
      assert.ok(skillNames.includes('React'));
      assert.ok(skillNames.includes('Docker'));
      assert.ok(skillNames.includes('MongoDB'));

      // Hallucinated skills must not appear
      assert.strictEqual(skillNames.includes('Kubernetes'), false);
      assert.strictEqual(skillNames.includes('Solidity'), false);

      // Hallucinated project technology must be pruned
      assert.strictEqual(grounded.value.projects[0].technologies.includes('AWS Lambda'), false);

      // Hallucinated link dropped
      assert.strictEqual(grounded.value.basics.links.includes('https://malicious-hallucinated-site.xyz'), false);

      // Hallucinated certification dropped
      assert.strictEqual(grounded.value.certifications[0].name, null);

      // Warnings must record dropped elements
      assert.ok(grounded.warnings.some((w) => w.includes('Kubernetes')));
      assert.ok(grounded.warnings.some((w) => w.includes('Solidity')));
      assert.ok(grounded.warnings.some((w) => w.includes('AWS Lambda')));
      assert.ok(grounded.warnings.some((w) => w.includes('malicious-hallucinated-site.xyz')));
    });
  });

  // -------------------------------------------------------------------------
  // 2. Conflict & Contradiction Detection Engine
  // -------------------------------------------------------------------------
  describe('2. Conflict & Contradiction Detection Engine', () => {
    it('detects education timeline inversion (endYear < startYear) with ERROR severity', () => {
      const invertedEducation = {
        education: [
          {
            institution: 'Test University',
            degree: 'B.Tech',
            startYear: 2024,
            endYear: 2021, // Timeline inversion
          },
        ],
      };

      const conflicts = detectResumeConflicts(invertedEducation);
      assert.ok(conflicts.length > 0);
      const timelineConflict = conflicts.find((c) => c.type === CONFLICT_TYPES.TIMELINE_INVERSION);
      assert.ok(timelineConflict);
      assert.equal(timelineConflict.severity, CONFLICT_SEVERITY.ERROR);
      assert.match(timelineConflict.message, /earlier than start year/);
    });

    it('detects implausible future start years with WARNING severity', () => {
      const futureEducation = {
        education: [
          {
            institution: 'Future University',
            startYear: 2040,
            endYear: 2044,
          },
        ],
      };

      const conflicts = detectResumeConflicts(futureEducation);
      const futureConflict = conflicts.find((c) => c.type === CONFLICT_TYPES.FUTURE_DATE);
      assert.ok(futureConflict);
      assert.equal(futureConflict.severity, CONFLICT_SEVERITY.WARNING);
    });

    it('detects divergence between student profile and parsed resume', () => {
      const mockProfile = {
        academic: {
          graduationYear: 2026, // Profile says 2026
          college: 'IIT Bombay', // Profile says IIT Bombay
        },
      };

      const conflicts = detectResumeConflicts(AI_PARSED_OUTPUT, mockProfile);
      assert.ok(conflicts.length > 0);

      const gradMismatch = conflicts.find((c) => c.field === 'academic.graduationYear');
      assert.ok(gradMismatch);
      assert.equal(gradMismatch.type, CONFLICT_TYPES.PROFILE_MISMATCH);
      assert.equal(gradMismatch.resumeValue, 2025);
      assert.equal(gradMismatch.profileValue, 2026);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Duplicate Detection & SHA-256 Content Hashing
  // -------------------------------------------------------------------------
  describe('3. Duplicate Resume Detection & Content Hashing', () => {
    it('computes contentHash and flags duplicate uploads with isDuplicate and duplicateOf', async () => {
      const { userId, token } = await registerAndLogin('dup.user');

      // Create initial resume
      const initialResume = await createResume(userId, {
        text: SOURCE_RESUME,
        label: 'Version 1',
      });
      assert.ok(initialResume.contentHash);
      assert.equal(initialResume.isDuplicate, false);
      assert.equal(initialResume.duplicateOf, null);

      // Create identical resume (with minor surrounding whitespace/casing difference)
      const duplicateResume = await createResume(userId, {
        text: `  \n${SOURCE_RESUME}\n\n  `,
        label: 'Version 2 (Duplicate)',
      });

      assert.equal(duplicateResume.contentHash, initialResume.contentHash);
      assert.equal(duplicateResume.isDuplicate, true);
      assert.equal(duplicateResume.duplicateOf, initialResume.id);
    });
  });

  // -------------------------------------------------------------------------
  // 4. End-to-End Pipeline Integration & Persistence
  // -------------------------------------------------------------------------
  describe('4. End-to-End Pipeline Integration & Persistence', () => {
    it('executes full analysis pipeline, storing provenanceIndex and conflicts onto Resume document', async () => {
      const { userId, token } = await registerAndLogin('pipeline.user');

      // Set up profile with slightly divergent graduation year
      await StudentProfile.create({
        user: userId,
        status: 'complete',
        academic: {
          graduationYear: 2026,
          degree: 'Bachelor of Technology',
          branch: 'Computer Science',
          college: 'NIT Bhopal',
        },
      });

      const resumeDto = await createResume(userId, {
        text: SOURCE_RESUME,
        label: 'Internship 2026',
      });

      // Trigger analysis
      const analysed = await analyseResume(userId, resumeDto.id);

      assert.equal(analysed.analysis.status, PROCESSING_STATUS.COMPLETED);
      assert.ok(analysed.hasParsedData);
      assert.ok(Array.isArray(analysed.provenanceIndex));
      assert.ok(analysed.provenanceIndex.length > 0);

      // Verify provenance index persisted in database
      const fetched = await getResume(userId, resumeDto.id);
      assert.ok(fetched.provenanceIndex.length >= 5);
      const reactEvidence = fetched.provenanceIndex.find((p) => p.name === 'React');
      assert.ok(reactEvidence);
      assert.equal(reactEvidence.canonicalSkillId, 'sk_react');
      assert.equal(reactEvidence.evidenceTier, 'claimed');

      // Verify conflicts persisted
      assert.ok(Array.isArray(fetched.conflicts));
      const gradConflict = fetched.conflicts.find((c) => c.field === 'academic.graduationYear');
      assert.ok(gradConflict, 'Profile divergence conflict should be captured and persisted');
      assert.equal(gradConflict.type, CONFLICT_TYPES.PROFILE_MISMATCH);
    });
  });
});
