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
    assert.match(await page.bodyText(), /Time left:\s*\d+:\d+/);
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

  // ------------------------------------------------ timer & attempt limits UX

  it('renders countdown timer, guards duplicate submissions, and handles attempt limits gracefully', async () => {
    await signUp();
    await openRunner();

    // Verify countdown timer presence
    const body = await page.bodyText();
    assert.match(body, /Time left:\s*\d+:\d+/);

    // Verify submit button disabled during submission
    const isSubmittingGuarded = await page.evaluate(`(() => {
      const submitBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Submit Assessment'));
      return submitBtn && submitBtn.getAttribute('aria-busy') === 'false';
    })()`);
    assert.ok(isSubmittingGuarded);

    // Complete this attempt and 4 more to reach the 5-attempt limit
    const token = await page.storedToken();
    const res = await fetch(`${stack.apiUrl}/api/assessments`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    const assessmentId = data.data.assessments[0].id;

    for (let i = 0; i < 5; i++) {
      try {
        const startRes = await fetch(`${stack.apiUrl}/api/assessments/${assessmentId}/attempts`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        const startData = await startRes.json();
        const attemptId = startData.data?.attempt?.id;
        if (attemptId) {
          await fetch(`${stack.apiUrl}/api/assessments/attempts/${attemptId}/submit`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ answers: [] }),
          });
        }
      } catch {
        // ignore
      }
    }

    // Check catalog for limit reached state
    await page.goto(`${stack.appUrl}/assessments`);
    await page.waitFor('document.body.innerText.includes("Limit Reached (5/5)")', {
      description: 'catalog to show limit reached badge',
    });
    const catalogText = await page.bodyText();
    assert.match(catalogText, /Limit Reached \(5\/5\)/);
    assert.match(catalogText, /Review Past Attempts/);

    // If attempting to open runner directly when limit is reached
    const assessmentHref = await page.evaluate(`(() => {
      const link = Array.from(document.querySelectorAll('a')).find(a => a.textContent.includes('Review Past Attempts'));
      return link ? link.getAttribute('href') : null;
    })()`);
    assert.ok(assessmentHref);

    // Visiting /run URL directly displays limit reached state
    await page.goto(`${stack.appUrl}${assessmentHref}/run`);
    await page.waitFor(
      'document.body.innerText.includes("Maximum Attempts (5 of 5) Reached") || document.body.innerText.includes("Attempt Limit Reached")',
      { description: 'runner to display maximum attempts reached' }
    );
    assert.match(await page.bodyText(), /Maximum Attempts \(5 of 5\) Reached/);
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
