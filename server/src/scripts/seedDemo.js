import { pathToFileURL } from 'node:url';
import bcrypt from 'bcryptjs';

import {
  Assessment,
  AssessmentAttempt,
  CareerTwin,
  InterviewSession,
  Resume,
  SkillEvidenceCheck,
  StudentProfile,
  User,
  ensureModelIndexes,
} from '../models/index.js';
import { generateCareerTwin } from '../services/careerTwin.service.js';
import { scoringTestAssessment } from '../../tests/fixtures/assessmentScoringFixtures.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../utils/logger.js';

export const DEMO_USERS = Object.freeze({
  STUDENT: {
    name: 'Nexora Demo Student',
    email: 'demo.student@nexora.app',
    password: 'DemoStudent123!',
    role: 'student',
  },
  ADMIN: {
    name: 'Nexora Demo Admin',
    email: 'demo.admin@nexora.app',
    password: 'DemoAdmin123!',
    role: 'admin',
  },
});

export const DEMO_EMAILS = Object.freeze([
  DEMO_USERS.STUDENT.email,
  DEMO_USERS.ADMIN.email,
]);

/**
 * Safely seeds demo accounts and foundational test data.
 *
 * Safety Guarantees:
 * 1. Accidental production execution is blocked unless explicitly overridden.
 * 2. Never deletes, overwrites, or modifies non-demo user data.
 * 3. Idempotent: Can be executed multiple times without generating duplicate documents or collisions.
 *
 * @param {object} [options]
 * @param {boolean} [options.allowProduction=false]
 * @param {boolean} [options.forceReset=false]
 * @param {boolean} [options.cleanDemo=false]
 * @param {boolean} [options.silent=false]
 * @returns {Promise<{ studentUser: object, adminUser: object, seededAt: Date }>}
 */
export async function seedDemo(options = {}) {
  const {
    allowProduction = false,
    forceReset = false,
    cleanDemo = false,
    silent = false,
  } = options;

  // 1. Production safety guard
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction && !allowProduction) {
    throw new Error(
      'Production seeding is blocked. To proceed in production, explicitly provide allowProduction: true or --allow-production flag.',
    );
  }

  const log = (msg) => {
    if (!silent) logger.info(`[DemoSeed] ${msg}`);
  };

  log('Ensuring model indexes before seeding...');
  await ensureModelIndexes();

  // 2. Clean only demo records if requested
  if (forceReset || cleanDemo) {
    log('Cleaning existing demo data...');
    const demoUserDocs = await User.find({ email: { $in: DEMO_EMAILS } });
    const demoUserIds = demoUserDocs.map((u) => u._id);

    if (demoUserIds.length > 0) {
      await Promise.all([
        StudentProfile.deleteMany({ user: { $in: demoUserIds } }),
        CareerTwin.deleteMany({ user: { $in: demoUserIds } }),
        AssessmentAttempt.deleteMany({ user: { $in: demoUserIds } }),
        InterviewSession.deleteMany({ user: { $in: demoUserIds } }),
        SkillEvidenceCheck.deleteMany({ user: { $in: demoUserIds } }),
        Resume.deleteMany({ user: { $in: demoUserIds } }),
        User.deleteMany({ _id: { $in: demoUserIds } }),
      ]);
    }
    log(`Cleaned data for ${demoUserIds.length} demo accounts.`);
  }

  // 3. Upsert Demo Users with known evaluator credentials
  log('Upserting demo user accounts...');
  const studentPasswordHash = await bcrypt.hash(DEMO_USERS.STUDENT.password, 10);
  const adminPasswordHash = await bcrypt.hash(DEMO_USERS.ADMIN.password, 10);

  const studentUser = await User.findOneAndUpdate(
    { email: DEMO_USERS.STUDENT.email },
    {
      $set: {
        name: DEMO_USERS.STUDENT.name,
        passwordHash: studentPasswordHash,
        role: DEMO_USERS.STUDENT.role,
        isActive: true,
      },
      $setOnInsert: {
        email: DEMO_USERS.STUDENT.email,
      },
    },
    { upsert: true, new: true, runValidators: true },
  );

  const adminUser = await User.findOneAndUpdate(
    { email: DEMO_USERS.ADMIN.email },
    {
      $set: {
        name: DEMO_USERS.ADMIN.name,
        passwordHash: adminPasswordHash,
        role: DEMO_USERS.ADMIN.role,
        isActive: true,
      },
      $setOnInsert: {
        email: DEMO_USERS.ADMIN.email,
      },
    },
    { upsert: true, new: true, runValidators: true },
  );

  // 4. Upsert active assessment in catalogue
  log('Upserting active demo assessment definition...');
  const assessmentDoc = await Assessment.findOneAndUpdate(
    { assessmentId: scoringTestAssessment.id },
    {
      $set: {
        ...scoringTestAssessment,
        skillName: 'Node.js',
        assessmentId: scoringTestAssessment.id,
        status: 'active',
      },
    },
    { upsert: true, new: true, runValidators: true },
  );

  // 5. Upsert Demo Student Profile
  log('Upserting rich demo student profile...');
  await StudentProfile.findOneAndUpdate(
    { user: studentUser._id },
    {
      $set: {
        personal: {
          city: 'Bengaluru',
          state: 'Karnataka',
        },
        academic: {
          collegeName: 'National Institute of Technology',
          degree: 'B.Tech',
          branch: 'Computer Science',
          currentSemester: 7,
          graduationYear: 2025,
          cgpa: 8.8,
        },
        career: {
          targetRole: 'Backend Developer',
          preferredLocation: 'Bengaluru',
          careerInterests: ['Distributed Systems', 'Cloud Architecture'],
          bio: 'Full-stack engineering student enthusiastic about scalable distributed systems and backend architectures.',
        },
        skills: [
          { name: 'JavaScript', level: 'advanced' },
          { name: 'Node.js', level: 'intermediate' },
          { name: 'React', level: 'intermediate' },
          { name: 'MongoDB', level: 'intermediate' },
          { name: 'Git', level: 'advanced' },
          { name: 'Docker', level: 'beginner' },
        ],
        projects: [
          {
            title: 'High-Concurrency Event Pipeline',
            description: 'Stream processing service handling simulated message bursts using Node.js streams and MongoDB queues.',
            technologies: ['Node.js', 'MongoDB', 'Docker'],
            githubUrl: 'https://github.com/nexora-demo/event-pipeline',
          },
        ],
      },
      $setOnInsert: { user: studentUser._id },
    },
    { upsert: true, new: true, runValidators: true },
  );

  // 6. Upsert Assessment Attempt & Verified Evidence Check
  log('Upserting demo assessment evaluation and verified skill evidence...');
  const completedDate = new Date();
  const startedDate = new Date(completedDate.getTime() - 15 * 60 * 1000);

  await AssessmentAttempt.findOneAndUpdate(
    { user: studentUser._id, assessmentId: assessmentDoc.assessmentId, attemptNumber: 1 },
    {
      $set: {
        version: assessmentDoc.version,
        skillKey: assessmentDoc.skillKey,
        skillName: assessmentDoc.skillName,
        difficulty: assessmentDoc.difficulty,
        passMark: assessmentDoc.passMark,
        status: 'evaluated',
        score: 0.85,
        passed: true,
        outcome: 'pass',
        earnedPoints: 85,
        maxPoints: 100,
        totalQuestions: 4,
        correctQuestionsCount: 4,
        durationSeconds: 900,
        startedAt: startedDate,
        completedAt: completedDate,
        answers: {
          q_sc_single: 'opt_pipe',
          q_mc_partial: ['opt_promise', 'opt_nexttick'],
          q_code_out: 'OK',
          q_drag_drop: ['opt_1', 'opt_2', 'opt_3'],
        },
      },
      $setOnInsert: {
        user: studentUser._id,
        assessmentId: assessmentDoc.assessmentId,
        attemptNumber: 1,
      },
    },
    { upsert: true, new: true, runValidators: true },
  );

  // Skill evidence check for verified assessment
  await SkillEvidenceCheck.findOneAndUpdate(
    {
      user: studentUser._id,
      kind: 'assessment',
      skillKey: 'Node.js',
      reference: assessmentDoc.assessmentId,
    },
    {
      $set: {
        skillName: 'Node.js',
        score: 0.85,
        passMark: 0.7,
        outcome: 'pass',
        eligibleForVerified: true,
        evaluatedBy: 'deterministic',
        completedAt: completedDate,
      },
      $setOnInsert: {
        user: studentUser._id,
        kind: 'assessment',
        skillKey: 'Node.js',
        reference: assessmentDoc.assessmentId,
      },
    },
    { upsert: true, new: true, runValidators: true },
  );

  // 7. Synchronize CareerTwin
  log('Synchronizing CareerTwin for demo student...');
  await generateCareerTwin(String(studentUser._id), { withNarrative: false });

  log('Demo seeding complete and verified.');
  return {
    studentUser,
    adminUser,
    seededAt: completedDate,
  };
}

// Direct CLI invocation
const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const allowProduction = process.argv.includes('--allow-production');
  const forceReset = process.argv.includes('--force-reset') || process.argv.includes('--clean-demo');

  try {
    await connectDatabase();
    await seedDemo({ allowProduction, forceReset });
    logger.info('Demo seeding process finished successfully.');
    await disconnectDatabase();
    process.exit(0);
  } catch (err) {
    logger.error('Failed to seed demo database:', err);
    await disconnectDatabase().catch(() => {});
    process.exit(1);
  }
}
