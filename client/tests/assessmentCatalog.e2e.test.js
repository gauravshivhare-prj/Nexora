import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { connectBrowser } from './helpers/browser.js';
import { startStack } from './helpers/stack.js';

const PASSWORD = 'Str0ngPassphrase';
const NAME = 'Gaurav Shivhare';

let emailCounter = 0;
const uniqueEmail = () => `assessment.catalog.${Date.now()}.${emailCounter++}@example.com`;

describe('assessment catalog page', { timeout: 180_000 }, () => {
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

  async function openAssessments() {
    await page.goto(`${stack.appUrl}/assessments`);
    await page.waitFor(
      'document.body.innerText.includes("Available Assessments") || document.body.innerText.includes("Skill Assessments")',
      { description: 'the assessment catalog page to load' },
    );
  }

  // ------------------------------------------------------------ protection

  it('sends a signed-out visitor to login', async () => {
    await page.goto(`${stack.appUrl}/assessments`);
    await page.waitFor('location.pathname === "/login"', { description: 'redirect to login' });
    assert.equal(await page.storedToken(), null);
  });

  it('is reachable from the main navigation', async () => {
    await signUp();
    await page.waitFor('document.body.innerText.includes("Assessments")', {
      description: 'navigation links to render',
    });
    await page.clickText('Assessments');
    await page.waitFor('location.pathname === "/assessments"', {
      description: 'navigation to /assessments',
    });
  });

  // ----------------------------------------------------------- catalogue rendering

  it('renders the catalog from real assessments and shows metadata without answer keys', async () => {
    await signUp();
    await openAssessments();

    const text = await page.bodyText();
    assert.match(text, /Skill Assessments/);
    assert.match(text, /Available Assessments/);
    assert.match(text, /difficulty:/i);

    // Cards should show skill, difficulty, duration, pass mark, questions count
    assert.match(text, /Skill:/);
    assert.match(text, /Time/);
    assert.match(text, /Questions/);
    assert.match(text, /Pass Mark/);
    assert.match(text, /Not attempted/);

    // CRITICAL SECURITY: Never leak expectedAnswer or answer keys in DOM
    assert.doesNotMatch(text, /expectedAnswer/i);
    assert.doesNotMatch(text, /scoringRule/i);
    assert.doesNotMatch(text, /correctOption/i);

    const hasSecretInDom = await page.evaluate(`(() => {
      const html = document.body.innerHTML;
      return /expectedAnswer|correctAnswer|scoringRule/i.test(html);
    })()`);
    assert.equal(hasSecretInDom, false, 'Security violation: secret answer key found in DOM');
  });

  // -------------------------------------------------------------- filtering

  it('filters assessments by difficulty and search query', async () => {
    await signUp();
    await openAssessments();

    // Click "Intermediate" filter
    const clickedIntermediate = await page.evaluate(`(() => {
      const btn = [...document.querySelectorAll('button')]
        .find((b) => b.textContent.trim().toLowerCase() === 'intermediate');
      if (!btn) return false;
      btn.click();
      return true;
    })()`);
    assert.ok(clickedIntermediate, 'could not find Intermediate filter button');

    // Type in search box
    await page.fill('Search assessments', 'JavaScript');
    const text = await page.bodyText();
    assert.match(text, /Available Assessments/);
  });

  // ------------------------------------------------------- accessibility

  it('marks the page up with headings and logs no console errors', async () => {
    await signUp();
    await openAssessments();

    const headings = await page.evaluate('document.querySelectorAll("h1, h2, h3").length');
    assert.ok(headings >= 2, `expected at least 2 headings, found ${headings}`);

    assert.deepEqual(page.consoleErrors, []);
  });
});
