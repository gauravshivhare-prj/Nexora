import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { connectBrowser } from './helpers/browser.js';
import { startStack } from './helpers/stack.js';

/**
 * End-to-end CareerTwin, in a real browser against the real backend.
 *
 * The twin is deterministic — the backend builds it from the profile and
 * analysed resumes with no model involved — so these tests can assert on
 * exact skills and strengths rather than on the shape of a response. That is
 * the property worth protecting: if a strength here ever depended on an AI
 * call, these assertions would start flickering.
 */

const PASSWORD = 'Str0ngPassphrase';
const NAME = 'Gaurav Shivhare';

let emailCounter = 0;
const uniqueEmail = () => `twin.e2e.${Date.now()}.${emailCounter++}@example.com`;

describe('career twin page', { timeout: 180_000 }, () => {
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

  /**
   * Adds a chip to the tag field belonging to a label.
   *
   * The profile has two tag fields — career interests and a project's
   * technologies — and each has its own "Add". Clicking by text would always
   * hit the first one, which is why this walks from the label to the input
   * and takes the button beside it.
   */
  async function addTag(labelText, value) {
    const ok = await page.evaluate(`(() => {
      const label = [...document.querySelectorAll('label')]
        .find((l) => l.textContent.trim().startsWith(${JSON.stringify(labelText)}));
      if (!label) return 'no label';

      const input = document.getElementById(label.htmlFor);
      if (!input) return 'no input';

      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        .call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));

      const add = input.parentElement.querySelector('button');
      if (!add) return 'no add button';
      if (add.disabled) return 'add button disabled';

      add.click();
      return 'ok';
    })()`);

    assert.equal(ok, 'ok', `could not add "${value}" to "${labelText}": ${ok}`);
  }

  /**
   * Fills a profile with one bare skill and one project that uses another.
   *
   * Chosen so the twin has to produce both strengths it can produce today:
   * "MongoDB" is only ever claimed, "React" is supported by a project.
   */
  async function seedProfile() {
    await page.goto(`${stack.appUrl}/profile`);
    await page.waitFor('document.body.innerText.includes("Your profile")', {
      description: 'the profile form',
    });

    await page.fill('Target role', 'Backend Developer');

    await page.clickText('Add a skill');
    await page.fill('Skill', 'MongoDB');

    await page.clickText('Add a project');
    await page.fill('Project title', 'Nexora');
    await addTag('Technologies used', 'React');

    await page.clickText('Save profile');
    await page.waitFor('document.body.innerText.includes("Profile saved")', {
      description: 'the save confirmation',
    });
  }

  /**
   * Opens the page and waits for it to have finished loading.
   *
   * Waits for a control rather than for the words "CareerTwin": the loading
   * skeleton carries a screen-reader label that contains them, so keying on
   * the text would let a click race the render.
   */
  async function openTwin() {
    await page.goto(`${stack.appUrl}/career-twin`);
    await page.waitFor(
      `[...document.querySelectorAll('button')].some((b) =>
         /^(Build my CareerTwin|Regenerate)$/.test(b.textContent.trim()))`,
      { description: 'the CareerTwin page to finish loading' },
    );
  }

  async function build() {
    await page.clickText('Build my CareerTwin');
    await page.waitFor('document.body.innerText.includes("At a glance")', {
      description: 'the generated twin',
    });
  }

  // ------------------------------------------------------------ protection

  it('sends a signed-out visitor to login', async () => {
    await page.goto(`${stack.appUrl}/career-twin`);

    await page.waitFor('location.pathname === "/login"', {
      description: 'the redirect to login',
    });
    assert.equal(await page.storedToken(), null);
  });

  // ----------------------------------------------------------- empty state

  it('shows an empty state before one has been built', async () => {
    await signUp();
    await openTwin();

    const text = await page.bodyText();
    assert.match(text, /You have no CareerTwin yet/);
    assert.match(text, /Build my CareerTwin/);
    // Nothing is claimed about the student before anything is built.
    assert.doesNotMatch(text, /At a glance/);
  });

  it('is reachable from the main navigation', async () => {
    await signUp();
    await page.clickText('CareerTwin');

    await page.waitFor('location.pathname === "/career-twin"', {
      description: 'navigation to /career-twin',
    });
  });

  it('refuses to build from nothing, and says what would fix it', async () => {
    await signUp();
    await openTwin();

    await page.clickText('Build my CareerTwin');

    await page.waitFor(
      'document.body.innerText.includes("not enough in your profile")',
      { description: 'the no-input refusal' },
    );

    const text = await page.bodyText();
    // A route to the fix, rather than a retry that could not work.
    assert.match(text, /Add a skill or a project/);
    assert.doesNotMatch(text, /At a glance/);
  });

  // -------------------------------------------------- deterministic output

  it('builds a twin and separates claimed from supported', async () => {
    await signUp();
    await seedProfile();
    await openTwin();
    await build();

    const text = await page.bodyText();
    assert.match(text, /MongoDB/);
    assert.match(text, /React/);
    assert.match(text, /Claimed/);
    assert.match(text, /Supported/);
  });

  it('gives the project-backed skill the stronger evidence', async () => {
    await signUp();
    await seedProfile();
    await openTwin();
    await build();

    // Read the badge out of each skill's own row, rather than looking for
    // the words anywhere on the page — the legend uses them too.
    const strengths = await page.evaluate(`(() => {
      const rows = [...document.querySelectorAll('li')].filter((li) =>
        /^(React|MongoDB)\\b/.test(li.innerText.trim()),
      );
      return Object.fromEntries(
        rows.map((li) => [li.innerText.trim().split('\\n')[0], li.innerText]),
      );
    })()`);

    assert.match(strengths.React ?? '', /Supported/, 'a project-backed skill was not supported');
    assert.match(strengths.MongoDB ?? '', /Claimed/, 'a bare listed skill was not claimed');
  });

  it('shows the evidence behind a skill on request', async () => {
    await signUp();
    await seedProfile();
    await openTwin();
    await build();

    // Evidence is collapsed by default, and the button says how much there is.
    assert.match(await page.bodyText(), /Show 1 source/);

    // Verify the disclosure starts collapsed with correct ARIA attributes.
    const before = await page.evaluate(`(() => {
      const button = [...document.querySelectorAll('li button[aria-expanded]')]
        .find((b) => /source/.test(b.textContent));
      if (!button) return null;
      const panelId = button.getAttribute('aria-controls');
      const panel = panelId ? document.getElementById(panelId) : null;
      return {
        expanded: button.getAttribute('aria-expanded'),
        panelHidden: panel?.hidden ?? null,
        hasControls: Boolean(panelId),
      };
    })()`);
    assert.ok(before, 'no expandable evidence control was rendered');
    assert.equal(before.expanded, 'false', 'evidence should start collapsed');
    assert.equal(before.hasControls, true, 'button must have aria-controls');
    assert.equal(before.panelHidden, true, 'controlled panel should be hidden');

    // Click to expand.
    await page.evaluate(`(() => {
      const button = [...document.querySelectorAll('li button[aria-expanded="false"]')]
        .find((b) => /source/.test(b.textContent));
      if (button) button.click();
    })()`);

    await page.waitFor(
      'document.body.innerText.includes("Used in a project") || document.body.innerText.includes("Listed on your profile")',
      { description: 'the evidence detail' },
    );

    // Verify the button now reports expanded and the panel is visible.
    const after = await page.evaluate(`(() => {
      const button = [...document.querySelectorAll('li button[aria-expanded]')]
        .find((b) => /source/.test(b.textContent));
      if (!button) return null;
      const panelId = button.getAttribute('aria-controls');
      const panel = panelId ? document.getElementById(panelId) : null;
      return {
        expanded: button.getAttribute('aria-expanded'),
        panelHidden: panel?.hidden ?? null,
      };
    })()`);
    assert.equal(after.expanded, 'true', 'aria-expanded did not toggle to true');
    assert.equal(after.panelHidden, false, 'evidence panel should be visible after click');
  });

  it('reports zero verified skills as a fact about the product', async () => {
    await signUp();
    await seedProfile();
    await openTwin();
    await build();

    // Nothing in Nexora produces verified evidence yet, and a bare zero
    // would read as a judgement on the student.
    assert.match(await page.bodyText(), /a zero here is about the product, not about you/);
  });

  // ---------------------------------------------------------------- stale

  it('says the twin is out of date after the profile changes', async () => {
    await signUp();
    await seedProfile();
    await openTwin();
    await build();

    // Change an input the twin was built from.
    await page.goto(`${stack.appUrl}/profile`);
    await page.waitFor('document.body.innerText.includes("Your profile")', {
      description: 'the profile form',
    });
    await page.fill('City', 'Bhopal');
    await page.clickText('Save profile');
    await page.waitFor('document.body.innerText.includes("Profile saved")', {
      description: 'the save confirmation',
    });

    await openTwin();
    await page.waitFor(
      'document.body.innerText.includes("This CareerTwin is out of date")',
      { description: 'the stale notice' },
    );

    // The old build is still shown — reading must not silently rebuild.
    assert.match(await page.bodyText(), /still the last build/);
  });

  // ------------------------------------------------------------ narrative

  it('builds without a narrative when no provider is configured', async () => {
    await signUp();
    await seedProfile();
    await openTwin();

    await page.clickText('Build with a written summary');
    await page.waitFor('document.body.innerText.includes("At a glance")', {
      description: 'the generated twin',
    });

    const text = await page.bodyText();
    // The twin is complete; only the optional summary is missing, and no
    // placeholder prose was invented to fill the space.
    assert.match(text, /MongoDB/);
    assert.doesNotMatch(text, /Written by a model/);
  });

  // -------------------------------------------------------------- errors

  it('shows a usable message when the backend is unreachable', async () => {
    await signUp();
    await seedProfile();
    await openTwin();

    await page.evaluate(`(() => {
      const original = window.fetch;
      window.fetch = (input, init) =>
        original(String(input).replace(/:\\d+\\//, ':1/'), init);
    })()`);

    await page.clickText('Build my CareerTwin');

    await page.waitFor('document.querySelector("[role=alert]") !== null', {
      description: 'an error alert',
    });

    const alert = await page.evaluate('document.querySelector("[role=alert]").innerText');
    assert.match(alert, /Could not reach the Nexora backend|trouble right now/);
    assert.match(alert, /Try again/);
    assert.ok(!/\bat\s+\w+\s+\(/.test(alert), 'a stack trace was displayed');
  });

  // ------------------------------------------------------- accessibility

  it('marks the page up with headings and produces no console errors', async () => {
    await signUp();
    await seedProfile();
    await openTwin();
    await build();

    const headings = await page.evaluate('document.querySelectorAll("h1, h2").length');
    assert.ok(headings >= 4, `expected a heading per section, found ${headings}`);

    assert.deepEqual(page.consoleErrors, []);
  });
});
