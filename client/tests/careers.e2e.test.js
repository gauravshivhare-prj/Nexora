import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { connectBrowser } from './helpers/browser.js';
import { startStack } from './helpers/stack.js';

/**
 * End-to-end career matches and skill gap.
 *
 * Both endpoints are deterministic pure reads on the backend — nothing is
 * persisted and no model is called — so these tests assert on actual scores
 * and statuses. The assertion worth having is that the four gap statuses
 * stay visibly distinct: collapsing "claimed" into "you have it" is the one
 * failure that would make the whole analysis pointless.
 */

const PASSWORD = 'Str0ngPassphrase';
const NAME = 'Gaurav Shivhare';
const ROLE = 'backend-developer';

let emailCounter = 0;
const uniqueEmail = () => `careers.e2e.${Date.now()}.${emailCounter++}@example.com`;

describe('career matches and skill gap', { timeout: 180_000 }, () => {
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

  /** See careerTwin.e2e.test.js — the two tag fields each have their own Add. */
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
   * A profile that produces both a claimed and a supported skill against the
   * backend-developer role, so the gap page has to tell them apart.
   *
   * MongoDB is listed and nothing more. Node.js is used by a project, which
   * is what raises it to supported.
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
    await addTag('Technologies used', 'Node.js');

    await page.clickText('Save profile');
    await page.waitFor('document.body.innerText.includes("Profile saved")', {
      description: 'the save confirmation',
    });
  }

  async function buildTwin() {
    await page.goto(`${stack.appUrl}/career-twin`);
    await page.waitFor(
      `[...document.querySelectorAll('button')].some((b) =>
         /^(Build my CareerTwin|Regenerate)$/.test(b.textContent.trim()))`,
      { description: 'the CareerTwin page' },
    );
    await page.clickText('Build my CareerTwin');
    await page.waitFor('document.body.innerText.includes("At a glance")', {
      description: 'the generated twin',
    });
  }

  async function openCareers() {
    await page.goto(`${stack.appUrl}/careers`);
    await page.waitFor('document.body.innerText.includes("All roles")', {
      description: 'the careers page to finish loading',
    });
  }

  async function openSkillGap(roleId = ROLE) {
    await page.goto(`${stack.appUrl}/careers/${roleId}/skill-gap`);
    await page.waitFor(
      'document.body.innerText.includes("Where you stand") || document.body.innerText.includes("Build your CareerTwin first") || document.body.innerText.includes("No such role")',
      { description: 'the skill gap page to settle' },
    );
  }

  // ------------------------------------------------------------ protection

  it('sends a signed-out visitor to login from both pages', async () => {
    await page.goto(`${stack.appUrl}/careers`);
    await page.waitFor('location.pathname === "/login"', { description: 'the redirect' });

    await page.goto(`${stack.appUrl}/careers/${ROLE}/skill-gap`);
    await page.waitFor('location.pathname === "/login"', { description: 'the redirect' });

    assert.equal(await page.storedToken(), null);
  });

  // ------------------------------------------------------- no CareerTwin

  it('asks for a CareerTwin before ranking anything', async () => {
    await signUp();
    await openCareers();

    const text = await page.bodyText();
    assert.match(text, /Build your CareerTwin first/);
    assert.match(text, /Go to CareerTwin/);

    // The catalogue still loads: it is reference data, not something that
    // depends on the student, so the page is useful rather than blank.
    assert.match(text, /Backend Developer/);
  });

  it('asks for a CareerTwin on the skill gap page too', async () => {
    await signUp();
    await openSkillGap();

    assert.match(await page.bodyText(), /Generate your CareerTwin first/);
  });

  it('is reachable from the signed-in landing page', async () => {
    await signUp();
    await page.clickText('Career matches');

    await page.waitFor('location.pathname === "/careers"', {
      description: 'navigation to /careers',
    });
  });

  // ------------------------------------------------------ recommendations

  it('ranks roles and shows the score, band and weights behind them', async () => {
    await signUp();
    await seedProfile();
    await buildTwin();
    await openCareers();

    const text = await page.bodyText();
    assert.match(text, /Backend Developer/);
    assert.match(text, /\/100/);
    assert.match(text, /How this was worked out/);
    // The weights ship with the response so the judgement is reviewable.
    assert.match(text, /Weights/);
    assert.match(text, /no AI involved/);
  });

  it('does not invent a ranking when nothing scores highly', async () => {
    await signUp();

    // A twin with one unrelated skill and nothing else to match on.
    await page.goto(`${stack.appUrl}/profile`);
    await page.waitFor('document.body.innerText.includes("Your profile")', {
      description: 'the profile form',
    });
    await page.clickText('Add a skill');
    await page.fill('Skill', 'Basket weaving');
    await page.clickText('Save profile');
    await page.waitFor('document.body.innerText.includes("Profile saved")', {
      description: 'the save confirmation',
    });

    await buildTwin();
    await openCareers();

    const text = await page.bodyText();
    // Either it found nothing, or whatever it found carries a real score —
    // what must not happen is a role presented with no basis.
    if (/No role matched strongly enough/.test(text)) {
      assert.match(text, /Include weak matches/);
    } else {
      assert.match(text, /\/100/);
    }
  });

  // ---------------------------------------------------------- skill gap

  it('keeps missing, claimed and supported visibly distinct', async () => {
    await signUp();
    await seedProfile();
    await buildTwin();
    await openSkillGap();

    const text = await page.bodyText();
    assert.match(text, /Missing/);
    assert.match(text, /Claimed only/);
    assert.match(text, /Supported/);

    // Read each skill's badge from its own row rather than from the page,
    // which also carries the legend and the summary counts.
    const rows = await page.evaluate(`(() => {
      const items = [...document.querySelectorAll('ol > li')];
      return Object.fromEntries(
        items.map((li) => [li.innerText.trim().split('\\n')[0], li.innerText]),
      );
    })()`);

    assert.match(rows['Node.js'] ?? '', /Supported/, 'a project-backed skill was not supported');
    assert.match(rows['MongoDB'] ?? '', /Claimed only/, 'a bare listed skill was not claimed');
  });

  it('explains each status in the backend’s own words', async () => {
    await signUp();
    await seedProfile();
    await buildTwin();
    await openSkillGap();

    // These strings are method.statusMeanings from the response. Rendering
    // the server's definitions rather than local wording is what stops the
    // UI telling a student something the server did not mean.
    const text = await page.bodyText();
    assert.match(text, /has not seen this skill anywhere in your profile or resumes/);
    assert.match(text, /listed this skill, but Nexora has not seen you use it/);
    assert.match(text, /Not available until assessments exist/);
  });

  it('shows what would change a gap, including what is not possible yet', async () => {
    await signUp();
    await seedProfile();
    await buildTwin();
    await openSkillGap();

    const text = await page.bodyText();
    // Case-insensitive: the heading is uppercased in CSS, and innerText
    // reports text-transform as applied rather than as authored.
    assert.match(text, /what would change this/i);
    // The route to "verified" is shown as unavailable rather than hidden.
    assert.match(text, /not available yet/);
  });

  it('reports counts without deriving a readiness percentage', async () => {
    await signUp();
    await seedProfile();
    await buildTwin();
    await openSkillGap();

    const summary = await page.evaluate(`(() => {
      const heading = [...document.querySelectorAll('h2')]
        .find((h) => h.textContent.trim() === 'Where you stand');
      return heading.closest('section').innerText;
    })()`);

    assert.match(summary, /Required/);
    assert.match(summary, /Preferred/);
    // The backend deliberately ships no coverage percentage; deriving one
    // here would reinstate exactly what it refused to return.
    assert.doesNotMatch(summary, /\d+%/);
  });

  it('answers an unknown role without pretending it exists', async () => {
    await signUp();
    await seedProfile();
    await buildTwin();
    await openSkillGap('not-a-real-role');

    const text = await page.bodyText();
    assert.match(text, /No such role/);
    assert.match(text, /No career role was found with that id/);
    // Nothing to retry — the role will not start existing.
    assert.doesNotMatch(text, /Try again/);
  });

  // -------------------------------------------------------------- errors

  it('shows a usable message when the backend is unreachable', async () => {
    await signUp();
    await seedProfile();
    await buildTwin();

    await openCareers();

    await page.evaluate(`(() => {
      const original = window.fetch;
      window.fetch = (input, init) =>
        original(String(input).replace(/:\\d+\\//, ':1/'), init);
    })()`);

    // Re-fetch without reloading: a reload would restore the real
    // window.fetch, leaving nothing broken to observe. Toggling "include
    // weak matches" changes the query and re-runs the load.
    await page.evaluate('document.querySelector(\'input[type="checkbox"]\').click()');

    await page.waitFor('document.querySelector("[role=alert]") !== null', {
      description: 'an error alert',
    });

    const alert = await page.evaluate('document.querySelector("[role=alert]").innerText');
    assert.match(alert, /Could not reach the Nexora backend|trouble right now/);
    assert.match(alert, /Try again/);
  });

  // ------------------------------------------------------- accessibility

  it('marks both pages up with headings and logs no console errors', async () => {
    await signUp();
    await seedProfile();
    await buildTwin();

    await openCareers();
    let headings = await page.evaluate('document.querySelectorAll("h1, h2, h3").length');
    assert.ok(headings >= 4, `careers page had only ${headings} headings`);

    await openSkillGap();
    headings = await page.evaluate('document.querySelectorAll("h1, h2").length');
    assert.ok(headings >= 3, `skill gap page had only ${headings} headings`);

    assert.deepEqual(page.consoleErrors, []);
  });
});
