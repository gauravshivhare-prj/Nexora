import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { connectBrowser } from './helpers/browser.js';
import { startStack } from './helpers/stack.js';

const PASSWORD = 'Str0ngPassphrase';
const NAME = 'P19 Test Student';

let emailCounter = 0;
const uniqueEmail = () => `interview.runner.${Date.now()}.${emailCounter++}@example.com`;

describe('P19 — interview question runner and safe submission flow', { timeout: 180_000 }, () => {
  let stack;
  let page;

  before(async () => {
    process.env.MONGODB_URI_TEST = 'mongodb://127.0.0.1:27017/nexora_praveshika_p19_test';
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

  async function signUpAndStartSession() {
    await page.goto(`${stack.appUrl}/register`);
    await page.fill('Full name', NAME);
    await page.fill('Email', uniqueEmail());
    await page.fill('Password', PASSWORD);
    await page.fill('Confirm password', PASSWORD);
    await page.clickText('Create account');
    await page.waitFor('location.pathname === "/app"', { description: 'navigation to /app' });

    // Navigate to /interviews
    await page.clickText('Interviews');
    await page.waitFor('location.pathname === "/interviews"');
    await page.waitFor('document.body.innerText.includes("Configure Interview Session")');

    // Start session
    await page.clickText('Start AI Interview');
    await page.waitFor('location.pathname.startsWith("/interviews/") && location.pathname !== "/interviews"');

    // Begin session
    await page.waitFor('document.body.innerText.includes("Begin Interview Session")');
    await page.clickText('Begin Interview Session');
    await page.waitFor('document.body.innerText.includes("In Progress")');
  }

  it('renders question prompt, stepper navigation, and character limits', async () => {
    await signUpAndStartSession();

    // Verify Question 1 header and prompt
    await page.waitFor('document.body.innerText.includes("Question 1 of")');
    const text = await page.bodyText();
    assert.match(text, /Question 1 of \d+/i);
    assert.match(text, /Your Response:/i);
    assert.match(text, /characters/i);

    // Verify stepper buttons exist with accessible touch targets (min 44px)
    const stepperCount = await page.evaluate('document.querySelectorAll("nav[aria-label=\'Interview questions\'] button").length');
    assert.ok(stepperCount >= 1, `expected at least 1 question button, found ${stepperCount}`);

    const targetSizes = await page.evaluate(`
      Array.from(document.querySelectorAll("nav[aria-label='Interview questions'] button")).map(btn => {
        const r = btn.getBoundingClientRect();
        return { w: r.width, h: r.height };
      })
    `);
    for (const size of targetSizes) {
      assert.ok(size.h >= 44, `Stepper button height ${size.h}px is less than 44px`);
      assert.ok(size.w >= 44, `Stepper button width ${size.w}px is less than 44px`);
    }
  });

  it('enforces answer length constraints and updates character counter live', async () => {
    await signUpAndStartSession();

    // Initially, submit button should be disabled
    const isInitiallyDisabled = await page.evaluate(`
      Boolean(document.querySelector("#submit-interview-answer-btn")?.disabled)
    `);
    assert.equal(isInitiallyDisabled, true, 'Submit button should be disabled when answer is empty');

    // Type short text (< 10 chars)
    await page.fill('Your Response', 'Too short');
    await page.waitFor('document.body.innerText.includes("more needed")');

    const isStillDisabled = await page.evaluate(`
      Boolean(document.querySelector("#submit-interview-answer-btn")?.disabled)
    `);
    assert.equal(isStillDisabled, true, 'Submit button should be disabled when answer < 10 characters');

    // Type valid text (>= 10 chars)
    const validAnswer = 'An event loop is a single-threaded loop that handles asynchronous callbacks.';
    await page.fill('Your Response', validAnswer);

    await page.waitFor('!document.body.innerText.includes("more needed")');
    const isNowEnabled = await page.evaluate(`
      !document.querySelector("#submit-interview-answer-btn")?.disabled
    `);
    assert.equal(isNowEnabled, true, 'Submit button should be enabled for valid answer');
  });

  it('supports navigation between questions via stepper and next/prev buttons', async () => {
    await signUpAndStartSession();

    // Question 1
    await page.waitFor('document.body.innerText.includes("Question 1 of")');

    // Click Next Question
    await page.clickText('Next Question →');
    await page.waitFor('document.body.innerText.includes("Question 2 of")');

    // Click Previous Question
    await page.clickText('← Previous Question');
    await page.waitFor('document.body.innerText.includes("Question 1 of")');
  });

  it('handles submission attempt safely with retry on provider unavailability', async () => {
    await signUpAndStartSession();

    const validAnswer = 'Node.js uses libuv to handle I/O operations through an asynchronous event loop.';
    await page.fill('Your Response', validAnswer);


    // Click submit
    await page.clickText('Submit Answer for Evaluation');

    // Wait for response: because no provider is configured on this test stack, it displays retryable error
    await page.waitFor('document.body.innerText.includes("Retry Submission") || document.body.innerText.includes("Recorded")', {
      timeout: 10_000,
    });

    const bodyText = await page.bodyText();
    // Answer text should still be intact in the textarea
    const preservedText = await page.evaluate('document.querySelector("#interview-answer-input")?.value');
    assert.equal(preservedText, validAnswer, 'User answer must be preserved on submission attempt/failure');

    assert.ok(
      bodyText.includes('Retry Submission') || bodyText.includes('Your Recorded Response'),
      'Expected either retry action or recorded evaluation',
    );
  });
});
