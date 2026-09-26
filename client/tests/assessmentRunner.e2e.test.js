import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { connectBrowser } from './helpers/browser.js';
import { startStack } from './helpers/stack.js';

const PASSWORD = 'Str0ngPassphrase';
const NAME = 'Gaurav Shivhare';

let emailCounter = 0;
const uniqueEmail = () => `assessment.runner.${Date.now()}.${emailCounter++}@example.com`;

describe('assessment runner page', { timeout: 180_000 }, () => {
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

  async function openRunner() {
    // Open catalog first, then click "Start Assessment"
    await page.goto(`${stack.appUrl}/assessments`);
    await page.waitFor(
      'document.body.innerText.includes("Available Assessments")',
      { description: 'catalog load' },
    );
    await page.clickText('Start Assessment');
    await page.waitFor(
      'document.body.innerText.includes("Question 1")',
      { description: 'runner to load question 1' },
    );
  }

  // ------------------------------------------------------------ rendering & navigation

  it('renders questions, supports navigation and tracks answer state', async () => {
    await signUp();
    await openRunner();

    const text = await page.bodyText();
    assert.match(text, /Question 1/);
    assert.match(text, /Answered: 0 \//);

    // Pick an option for question 1 (handle textarea, radio, or checkbox)
    const optionSelected = await page.evaluate(`(() => {
      const textarea = document.querySelector('textarea');
      if (textarea) {
        Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(textarea, '1\\n4\\n3\\n2');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
      const radio = document.querySelector('input[type="radio"], input[type="checkbox"]');
      if (radio) {
        radio.click();
        return true;
      }
      return false;
    })()`);
    assert.ok(optionSelected, 'could not interact with question input');

    // Answered counter should increment to 1
    await page.waitFor('document.body.innerText.includes("Answered: 1 /")', {
      description: 'answered counter update',
    });

    // Navigate to Question 2 via Next
    await page.clickText('Next →');
    await page.waitFor('document.body.innerText.includes("Question 2")', {
      description: 'navigation to question 2',
    });

    // Navigate back to Question 1 via Previous
    await page.clickText('← Previous');
    await page.waitFor('document.body.innerText.includes("Question 1")', {
      description: 'navigation back to question 1',
    });

    // Answered state must be preserved
    assert.match(await page.bodyText(), /Answered: 1 \//);
  });

  // -------------------------------------------------------------- review & submission

  it('allows reviewing questions and safely submits answers', async () => {
    await signUp();
    await openRunner();

    // Toggle Review Summary
    await page.clickText('Review Summary');
    await page.waitFor('document.body.innerText.includes("Assessment Overview")', {
      description: 'review overview panel to open',
    });
    assert.match(await page.bodyText(), /Unanswered/);

    // Close review
    await page.clickText('Hide Review');

    // Submit Assessment
    await page.clickText('Submit Assessment');

    // Wait for submission result
    await page.waitFor(
      'document.body.innerText.includes("Attempt Complete") || document.body.innerText.includes("Score:")',
      { description: 'evaluation result to be displayed' },
    );

    const resultText = await page.bodyText();
    assert.match(resultText, /Attempt Complete/);
    assert.match(resultText, /Score:\s*\d+%/);
    assert.match(resultText, /Return to Assessments/);

    // Absolute zero answer-key leakage in result view
    assert.doesNotMatch(resultText, /expectedAnswer/i);
    assert.doesNotMatch(resultText, /scoringRule/i);
  });

  // ------------------------------------------------------- accessibility

  it('marks runner page with proper headings and produces no console errors', async () => {
    await signUp();
    await openRunner();

    const headings = await page.evaluate('document.querySelectorAll("h1, h2, h3").length');
    assert.ok(headings >= 2, `expected at least 2 headings, found ${headings}`);

    assert.deepEqual(page.consoleErrors, []);
  });
});
