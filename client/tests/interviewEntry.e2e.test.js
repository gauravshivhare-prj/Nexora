import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { connectBrowser } from './helpers/browser.js';
import { startStack } from './helpers/stack.js';

const PASSWORD = 'Str0ngPassphrase';
const NAME = 'Gaurav Shivhare';

let emailCounter = 0;
const uniqueEmail = () => `interview.entry.${Date.now()}.${emailCounter++}@example.com`;

describe('interview entry and session initiation', { timeout: 180_000 }, () => {
  let stack;
  let page;

  before(async () => {
    stack = await startStack();
    page = await connectBrowser(stack.debugPort);
  });

  after(async () => {
    page?.close();
    await stack?.stop();
  });

  beforeEach(async () => {
    await page.goto(`${stack.appUrl}/`);
    await page.clearStorage();
  });

  async function signUp() {
    await page.goto(`${stack.appUrl}/register`);
    await page.fill('Full name', NAME);
    await page.fill('Email', uniqueEmail());
    await page.fill('Password', PASSWORD);
    await page.fill('Confirm password', PASSWORD);
    await page.clickText('Create account');
    await page.waitFor('location.pathname === "/app"', { description: 'navigation to /app' });
  }

  // ------------------------------------------------------------ access & navigation

  it('redirects unauthenticated visitors to login', async () => {
    await page.goto(`${stack.appUrl}/interviews`);
    await page.waitFor('location.pathname === "/login"', {
      description: 'redirect to login for unauthenticated visitor',
    });
  });

  it('is accessible from top navigation for authenticated students', async () => {
    await signUp();
    await page.clickText('Interviews');
    await page.waitFor('location.pathname === "/interviews"', {
      description: 'navigation to /interviews',
    });
    await page.waitFor('document.body.innerText.includes("AI Technical Interviews")');
    const text = await page.bodyText();
    assert.match(text, /AI Technical Interviews/);
  });

  // ------------------------------------------------- configuration & truthful messaging

  it('displays configuration options and truthful advisory/evidence messaging', async () => {
    await signUp();
    await page.goto(`${stack.appUrl}/interviews`);
    await page.waitFor('document.body.innerText.includes("Configure Interview Session")');

    const text = await page.bodyText();

    // Truthful advisory & non-deterministic evidence messaging
    assert.match(text, /Formative Practice & Evaluation Transparency/i);
    assert.match(text, /Advisory Credentialing/i);
    assert.match(text, /(?:do|does) not generate verified credentials without human evaluator/i);

    // Configuration controls
    assert.match(text, /Backend Developer/);
    assert.match(text, /Frontend Developer/);
    assert.match(text, /Beginner/);
    assert.match(text, /Intermediate/);
    assert.match(text, /Advanced/);
    assert.match(text, /Start AI Interview/);
  });

  // ------------------------------------------------- session initiation flow

  it('initializes a session and transitions through begin interview flow', async () => {
    await signUp();
    await page.goto(`${stack.appUrl}/interviews`);
    await page.waitFor('document.body.innerText.includes("Start AI Interview")');

    // Click "Start AI Interview" to create session
    await page.clickText('Start AI Interview');

    // Should navigate to /interviews/:sessionId
    await page.waitFor('location.pathname.startsWith("/interviews/") && location.pathname !== "/interviews"', {
      description: 'navigation to session details page',
    });

    await page.waitFor('document.body.innerText.includes("Technical Interview —")');
    const sessionText = await page.bodyText();
    assert.match(sessionText, /Ready to Start/i);
    assert.match(sessionText, /Begin Interview Session/i);
    assert.match(sessionText, /Advisory AI Evaluation Notice/i);
    assert.match(sessionText, /Technical Accuracy/i);

    // Click "Begin Interview Session" to transition to in_progress
    await page.clickText('Begin Interview Session');

    await page.waitFor('document.body.innerText.includes("In Progress")', {
      description: 'session status transition to in progress',
    });

    const activeText = await page.bodyText();
    assert.match(activeText, /In Progress/i);
    assert.match(activeText, /Question 1/i);
    assert.match(activeText, /Your Response:/i);
  });

  // ------------------------------------------------------- accessibility

  it('marks interview page with proper headings and produces no console errors', async () => {
    await signUp();
    await page.goto(`${stack.appUrl}/interviews`);
    await page.waitFor('document.body.innerText.includes("AI Technical Interviews")');

    const headings = await page.evaluate('document.querySelectorAll("h1, h2, h3").length');
    assert.ok(headings >= 2, `expected at least 2 headings, found ${headings}`);

    assert.deepEqual(page.consoleErrors, []);
  });
});
