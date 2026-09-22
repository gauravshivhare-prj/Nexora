import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { connectBrowser } from './helpers/browser.js';
import { startStack } from './helpers/stack.js';

/**
 * End-to-end role roadmap.
 *
 * The assertion this suite exists for is a negative one: there must be no
 * control on the page that marks a step complete. Completion is derived
 * from evidence — add a project, the skill becomes supported, the gap
 * closes, the step disappears — and a local flag would let the plan
 * disagree with what the student can actually demonstrate. The last test
 * drives that loop for real rather than asserting it in prose.
 */

const PASSWORD = 'Str0ngPassphrase';
const NAME = 'Gaurav Shivhare';
const ROLE = 'backend-developer';

let emailCounter = 0;
const uniqueEmail = () => `roadmap.e2e.${Date.now()}.${emailCounter++}@example.com`;

describe('role roadmap page', { timeout: 240_000 }, () => {
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

  async function openProfile() {
    await page.goto(`${stack.appUrl}/profile`);
    await page.waitFor('document.body.innerText.includes("Your profile")', {
      description: 'the profile form',
    });
  }

  async function saveProfile() {
    await page.clickText('Save profile');
    await page.waitFor('document.body.innerText.includes("Profile saved")', {
      description: 'the save confirmation',
    });
  }

  /** See careerTwin.e2e.test.js — each tag field has its own Add button. */
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

  /** A profile with one bare skill, so the roadmap has something to plan. */
  async function seedProfile() {
    await openProfile();
    await page.clickText('Add a skill');
    await page.fill('Skill', 'MongoDB');
    await saveProfile();
  }

  async function buildTwin() {
    await page.goto(`${stack.appUrl}/career-twin`);
    await page.waitFor(
      `[...document.querySelectorAll('button')].some((b) =>
         /^(Build my CareerTwin|Regenerate)$/.test(b.textContent.trim()))`,
      { description: 'the CareerTwin page' },
    );
    // Whichever of the two is showing: the button says "Regenerate" once a
    // twin exists, and this helper is called again after adding evidence.
    const clicked = await page.evaluate(`(() => {
      const button = [...document.querySelectorAll('button')]
        .find((b) => /^(Build my CareerTwin|Regenerate)$/.test(b.textContent.trim()));
      if (!button) return false;
      button.click();
      return true;
    })()`);
    assert.equal(clicked, true, 'no build/regenerate control was rendered');

    await page.waitFor('document.body.innerText.includes("At a glance")', {
      description: 'the generated twin',
    });
  }

  async function openRoadmap(roleId = ROLE) {
    await page.goto(`${stack.appUrl}/careers/${roleId}/roadmap`);
    await page.waitFor(
      'document.body.innerText.includes("The goal") || document.body.innerText.includes("Build your CareerTwin first") || document.body.innerText.includes("No such role")',
      { description: 'the roadmap page to settle' },
    );
  }

  /** The steps on screen, keyed by their heading. */
  function stepTitles() {
    return page.evaluate(
      `[...document.querySelectorAll('ol > li h3')].map((h) => h.textContent.trim())`,
    );
  }

  // ------------------------------------------------------------ protection

  it('sends a signed-out visitor to login', async () => {
    await page.goto(`${stack.appUrl}/careers/${ROLE}/roadmap`);

    await page.waitFor('location.pathname === "/login"', { description: 'the redirect' });
    assert.equal(await page.storedToken(), null);
  });

  // ------------------------------------------------------------- no twin

  it('asks for a CareerTwin before planning anything', async () => {
    await signUp();
    await openRoadmap();

    assert.match(await page.bodyText(), /Generate your CareerTwin first/);
  });

  it('answers an unknown role without pretending it exists', async () => {
    await signUp();
    await seedProfile();
    await buildTwin();
    await openRoadmap('not-a-real-role');

    const text = await page.bodyText();
    assert.match(text, /No such role/);
    assert.doesNotMatch(text, /Try again/);
  });

  // ------------------------------------------------------- ordered steps

  it('shows ordered steps with skill targets and priorities', async () => {
    await signUp();
    await seedProfile();
    await buildTwin();
    await openRoadmap();

    const titles = await stepTitles();
    assert.ok(titles.length > 0, 'the roadmap had no steps');

    const text = await page.bodyText();
    assert.match(text, /Critical/);
    assert.doesNotMatch(text, /\[object Object\]/);
    assert.match(text, /Effort/);
    // Each step is traced back to why it is on the plan at all.
    assert.match(text, /Backend Developer lists it as required/);
  });

  it('puts critical steps before lower-priority ones', async () => {
    await signUp();
    await seedProfile();
    await buildTwin();
    await openRoadmap();

    // Order is the backend's, and it is the analysis — what blocks you from
    // being considered comes first. Re-sorting in the client would replace
    // that judgement with a display preference.
    const priorities = await page.evaluate(`
      [...document.querySelectorAll('ol > li')].map((li) => {
        const match = li.innerText.match(/\\b(Critical|High|Medium|Low)\\b/);
        return match ? match[1] : null;
      })
    `);

    const rank = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    const ranks = priorities.filter(Boolean).map((p) => rank[p]);
    const sorted = [...ranks].sort((a, b) => a - b);
    assert.deepEqual(ranks, sorted, 'steps were not in priority order');
  });

  // ------------------------------------------------------------ resources

  it('offers search hints rather than links it has not verified', async () => {
    await signUp();
    await seedProfile();
    await buildTwin();
    await openRoadmap();

    const text = await page.bodyText();
    assert.match(text, /where to look/i);
    assert.match(text, /Try searching:/);
    assert.match(text, /not recommendations/);

    // No anchor inside a step: every resource url is null by design, and
    // guessing one is how a student lands on a parked domain.
    const links = await page.evaluate(
      `[...document.querySelectorAll('ol > li a')].length`,
    );
    assert.equal(links, 0, 'a roadmap step rendered a resource link');
  });

  // -------------------------------------------- evidence-driven completion

  it('offers no way to mark a step complete by hand', async () => {
    await signUp();
    await seedProfile();
    await buildTwin();
    await openRoadmap();

    // The specific thing that must not exist. A tick-box here would let the
    // plan disagree with the evidence.
    const controls = await page.evaluate(`(() => {
      const checkboxes = document.querySelectorAll('ol input[type="checkbox"]').length;
      const doneButtons = [...document.querySelectorAll('ol button')]
        .filter((b) => /\\b(done|complete|finish|mark)\\b/i.test(b.textContent)).length;
      return { checkboxes, doneButtons };
    })()`);

    assert.deepEqual(controls, { checkboxes: 0, doneButtons: 0 });

    // Instead, each step states what would actually close it.
    const text = await page.bodyText();
    assert.match(text, /closes when/i);
    assert.match(text, /Add a project to your profile that lists/);
  });

  it('closes a step when the evidence for it is added', async () => {
    await signUp();
    await seedProfile();
    await buildTwin();
    await openRoadmap();

    const before = await stepTitles();
    const target = before.find((title) => /^Learn /.test(title));
    assert.ok(target, `no "Learn X" step to close. Steps: ${before.join(', ')}`);
    const skill = target.replace(/^Learn /, '');

    // Do the real thing the step asks for: a project that uses the skill.
    await openProfile();
    await page.clickText('Add a project');
    await page.fill('Project title', `A ${skill} project`);
    await addTag('Technologies used', skill);
    await saveProfile();

    // The twin has to be rebuilt — the backend does not regenerate on read,
    // precisely so a student is never shown a silently refreshed picture.
    await buildTwin();
    await openRoadmap();

    const after = await stepTitles();
    assert.ok(
      !after.includes(target),
      `"${target}" was still on the plan after the evidence was added. Steps: ${after.join(', ')}`,
    );
  });

  // -------------------------------------------------------------- errors

  it('shows a usable message when the backend is unreachable', async () => {
    await signUp();
    await seedProfile();
    await buildTwin();

    // Start on the skill gap page, which loads normally, then break fetch
    // and walk into the roadmap. Navigating in-app re-runs the roadmap's
    // load with the override still in place; a full reload would restore
    // the real window.fetch and there would be nothing broken to observe.
    await page.goto(`${stack.appUrl}/careers/${ROLE}/skill-gap`);
    await page.waitFor('document.body.innerText.includes("Where you stand")', {
      description: 'the skill gap page',
    });

    await page.evaluate(`(() => {
      const original = window.fetch;
      window.fetch = (input, init) =>
        original(String(input).replace(/:\\d+\\//, ':1/'), init);
    })()`);

    const navigated = await page.evaluate(`(() => {
      const link = document.querySelector('a[href$="/roadmap"]');
      if (!link) return false;
      link.click();
      return true;
    })()`);
    assert.equal(navigated, true, 'no link to the roadmap was rendered');

    await page.waitFor('document.querySelector("[role=alert]") !== null', {
      description: 'an error alert',
    });

    const alert = await page.evaluate('document.querySelector("[role=alert]").innerText');
    assert.match(alert, /Could not reach the Nexora backend|trouble right now/);
    assert.ok(!/\bat\s+\w+\s+\(/.test(alert), 'a stack trace was displayed');
  });

  // ------------------------------------------------------- accessibility

  it('marks the page up with headings and logs no console errors', async () => {
    await signUp();
    await seedProfile();
    await buildTwin();
    await openRoadmap();

    const headings = await page.evaluate('document.querySelectorAll("h1, h2, h3").length');
    assert.ok(headings >= 4, `expected a heading per section and step, found ${headings}`);

    assert.deepEqual(page.consoleErrors, []);
  });
});
