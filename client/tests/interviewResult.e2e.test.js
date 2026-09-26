import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import mongoose from '../../server/node_modules/mongoose/index.js';
import { connectBrowser } from './helpers/browser.js';
import { startStack } from './helpers/stack.js';

const PASSWORD = 'Str0ngPassphrase';
const NAME = 'P20 Result Student';

let emailCounter = 0;
const uniqueEmail = () => `interview.result.${Date.now()}.${emailCounter++}@example.com`;

async function markSessionCompleted(dbUri, sessionId, updates = {}) {
  const conn = await mongoose.createConnection(dbUri).asPromise();
  const collection = conn.collection('interviewsessions');
  await collection.updateOne(
    { _id: new mongoose.Types.ObjectId(sessionId) },
    {
      $set: {
        status: 'completed',
        overallScore: Number(updates.score || 0.85),
        evaluatorType: updates.evaluatorType || 'ai',
        completedAt: new Date(),
        evidenceCheck: updates.evidenceCheck || null,
        'questions.0.answer': {
          answerText: 'The event loop comprises timers, pending callbacks, poll, check, and close phases...',
          submittedAt: new Date(),
          durationSeconds: 45,
          attemptNumber: 1,
        },
        'questions.0.evaluation': {
          compositeScore: Number(updates.score || 0.85),
          dimensions: { accuracy: 0.9, depth: 0.85, clarity: 0.8, relevance: 0.85 },
          feedback: 'Solid explanation of microtasks and async event loop.',
          strengths: ['Clear queue prioritization'],
          growthAreas: ['Elaborate on I/O starvation mitigation'],
          evaluatedAt: new Date(),
        },
      },
    },
  );
  await conn.close();
}

describe('P20 — interview result UI and evidence presentation', { timeout: 180_000 }, () => {
  let stack;
  let page;

  before(async () => {
    process.env.MONGODB_URI_TEST = 'mongodb://127.0.0.1:27017/nexora_praveshika_p20_test';
    stack = await startStack();
    page = await connectBrowser(stack.debugPort);
  });

  after(async () => {
    page?.close();
    await stack?.stop();
  });

  beforeEach(async () => {
    await page.setViewport({ width: 1280, height: 800, mobile: false });
    await page.goto(`${stack.appUrl}/`);
    await page.clearStorage();
  });

  async function signUpAndCreateSession() {
    await page.goto(`${stack.appUrl}/register`);
    await page.fill('Full name', NAME);
    await page.fill('Email', uniqueEmail());
    await page.fill('Password', PASSWORD);
    await page.fill('Confirm password', PASSWORD);
    await page.clickText('Create account');
    await page.waitFor('location.pathname === "/app"', { description: 'navigation to /app' });

    // Navigate to /interviews
    await page.goto(`${stack.appUrl}/interviews`);
    await page.waitFor('document.body.innerText.includes("Configure Interview Session")');


    // Start session
    await page.clickText('Start AI Interview');
    await page.waitFor('location.pathname.startsWith("/interviews/") && location.pathname !== "/interviews"');

    const path = await page.evaluate('location.pathname');
    const sessionId = path.split('/').pop();
    return sessionId;
  }

  it('renders completed session with truthful AI formative evaluation and dimension breakdown', async () => {
    const sessionId = await signUpAndCreateSession();

    // Mark session completed with real data in mongo
    await markSessionCompleted(stack.mongoUri, sessionId, {
      evaluatorType: 'ai',
      score: 0.85,
    });

    // Reload page to fetch real completed session
    await page.goto(`${stack.appUrl}/interviews/${sessionId}`);
    await page.waitFor('document.body.innerText.includes("Evaluation Complete")');

    const text = await page.bodyText();

    // Score and authority
    assert.match(text, /85%/);
    assert.match(text, /Overall Technical Score/i);
    assert.match(text, /AI Formative Evaluation/i);
    assert.match(text, /Strong Competency/i);

    // Truthful evidence messaging
    assert.match(text, /Skill Evidence Status/i);
    assert.match(text, /Formative Evidence/i);
    assert.match(text, /Institutional verification requires human evaluator/i);

    // Dimension breakdown averages
    assert.match(text, /Rubric Dimensions Breakdown/i);
    assert.match(text, /Accuracy \(35%\)/i);
    assert.match(text, /Depth \(30%\)/i);
    assert.match(text, /Clarity \(20%\)/i);
    assert.match(text, /Relevance \(15%\)/i);

    // Consolidated strengths and growth areas
    assert.match(text, /Demonstrated Strengths/i);
    assert.match(text, /Clear queue prioritization/i);
    assert.match(text, /Recommended Growth Areas/i);

    // Question breakdown
    assert.match(text, /Question-by-Question Evaluation Breakdown/i);

    // CTAs
    assert.match(text, /Back to Interviews/i);
    assert.match(text, /View CareerTwin Profile/i);
  });

  it('renders verified credential status when evaluated by human evaluator', async () => {
    const sessionId = await signUpAndCreateSession();

    // Mark session completed by human evaluator with passing score
    await markSessionCompleted(stack.mongoUri, sessionId, {
      evaluatorType: 'human',
      score: 0.88,
      evidenceCheck: 'ev-chk-verified-789',
    });

    await page.goto(`${stack.appUrl}/interviews/${sessionId}`);
    await page.waitFor('document.body.innerText.includes("Human Evaluator")');

    const text = await page.bodyText();
    assert.match(text, /Human Evaluator/i);
    assert.match(text, /Verified Credential/i);
    assert.match(text, /Evidence granted with institutional verified credential status/i);
  });

  it('renders cleanly without horizontal overflow at mobile 320px viewport', async () => {
    const sessionId = await signUpAndCreateSession();

    await markSessionCompleted(stack.mongoUri, sessionId, {
      evaluatorType: 'ai',
      score: 0.85,
    });

    await page.setViewport({ width: 320, height: 800, mobile: true });
    await page.goto(`${stack.appUrl}/interviews/${sessionId}`);
    await page.waitFor('document.body.innerText.includes("Evaluation Complete")');

    const overflow = await page.evaluate(
      'document.documentElement.scrollWidth - document.documentElement.clientWidth',
    );
    assert.ok(overflow <= 1, `horizontal overflow of ${overflow}px detected at 320px viewport`);
  });
});
