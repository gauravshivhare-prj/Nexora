import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { connectBrowser } from './helpers/browser.js';
import { startStack } from './helpers/stack.js';

/**
 * End-to-end dashboard and navigation.
 *
 * Two things are worth pinning here. The dashboard must not invent a
 * headline readiness figure — every number on it has to be one a backend
 * endpoint returned — and each section must fail on its own, so one service
 * being down costs a tile rather than the page.
 */

const PASSWORD = 'Str0ngPassphrase';
const NAME = 'Gaurav Shivhare';

/** Every route inside the authenticated layout. */
const PROTECTED_PATHS = [
  '/app',
  '/profile',
  '/resume',
  '/career-twin',
  '/careers',
  '/careers/backend-developer/skill-gap',
  '/careers/backend-developer/roadmap',
];

let emailCounter = 0;
const uniqueEmail = () => `dashboard.e2e.${Date.now()}.${emailCounter++}@example.com`;

describe('dashboard and navigation', { timeout: 240_000 }, () => {
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
    await page.setViewport?.(1280, 900);
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

  /** Waits for the dashboard body, not the skeleton. */
  async function openDashboard() {
    await page.goto(`${stack.appUrl}/app`);
    await page.waitFor(`document.body.innerText.includes("Welcome, ${NAME}")`, {
      description: 'the dashboard to finish loading',
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

  /**
   * Enough of a profile that a role actually matches.
   *
   * The dashboard drills into the top-ranked role for its gap and roadmap
   * tiles, so a profile too thin to match anything leaves both empty and
   * the populated cases untested.
   */
  async function addSkillAndProject() {
    await page.goto(`${stack.appUrl}/profile`);
    await page.waitFor('document.body.innerText.includes("Your profile")', {
      description: 'the profile form',
    });

    await page.fill('Target role', 'Backend Developer');

    for (const [index, skill] of ['MongoDB', 'JavaScript', 'SQL'].entries()) {
      await page.clickText('Add a skill');
      await page.fill('Skill', skill, { nth: index });
    }

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
    const clicked = await page.evaluate(`(() => {
      const button = [...document.querySelectorAll('button')]
        .find((b) => /^(Build my CareerTwin|Regenerate)$/.test(b.textContent.trim()));
      if (!button) return false;
      button.click();
      return true;
    })()`);
    assert.equal(clicked, true, 'no build control was rendered');

    await page.waitFor('document.body.innerText.includes("At a glance")', {
      description: 'the generated twin',
    });
  }

  // ---------------------------------------------------- route protection

  it('sends a signed-out visitor from every protected route to login', async () => {
    for (const path of PROTECTED_PATHS) {
      await page.goto(`${stack.appUrl}${path}`);
      await page.waitFor('location.pathname === "/login"', {
        description: `the redirect from ${path}`,
      });
    }

    assert.equal(await page.storedToken(), null);
  });

  it('lets a signed-in visitor reach every protected route', async () => {
    await signUp();

    for (const path of PROTECTED_PATHS) {
      await page.goto(`${stack.appUrl}${path}`);
      // The nav only renders inside the authenticated layout, so its
      // presence is the proof the guard let the page through.
      await page.waitFor('document.body.innerText.includes("Log out")', {
        description: `the authenticated layout at ${path}`,
      });
      assert.equal(await page.path(), path);
    }
  });

  // -------------------------------------------------------------- empty

  it('tells a brand-new student what to do first', async () => {
    await signUp();
    await openDashboard();

    const text = await page.bodyText();
    assert.match(text, /Start by filling in your profile/);
    assert.match(text, /No CareerTwin built yet/);
    assert.match(text, /No resumes saved yet/);
  });

  it('moves the next step on as each stage is completed', async () => {
    await signUp();
    await addSkillAndProject();

    await openDashboard();
    assert.match(await page.bodyText(), /Build your CareerTwin/);

    await buildTwin();
    await openDashboard();

    const text = await page.bodyText();
    assert.doesNotMatch(text, /Start by filling in your profile/);
    assert.doesNotMatch(text, /No CareerTwin built yet/);
  });

  // ------------------------------------------------------------ populated

  it('shows counts the backend computed, linked to the page that explains them', async () => {
    await signUp();
    await addSkillAndProject();
    await buildTwin();
    await openDashboard();

    const text = await page.bodyText();
    assert.match(text, /Claimed only/);
    assert.match(text, /Supported/);
    assert.match(text, /Top career matches/);

    // Each tile leads somewhere that can justify its numbers.
    const destinations = await page.evaluate(
      `[...new Set([...document.querySelectorAll('a')].map((a) => a.getAttribute('href')))]`,
    );
    for (const expected of ['/profile', '/resume', '/career-twin', '/careers']) {
      assert.ok(destinations.includes(expected), `no dashboard link to ${expected}`);
    }
  });

  it('does not invent a readiness score', async () => {
    await signUp();
    await addSkillAndProject();
    await buildTwin();
    await openDashboard();

    const text = await page.bodyText();
    // The only percentage the product computes is the per-role match score,
    // which lives on the careers page. A headline "you are 62% ready" here
    // would be a number no endpoint produces.
    assert.doesNotMatch(text, /readiness/i);
    assert.doesNotMatch(text, /\d+%\s*(ready|complete)/i);
  });

  it('reports roadmap work as outstanding rather than as progress', async () => {
    await signUp();
    await addSkillAndProject();
    await buildTwin();
    await openDashboard();

    const roadmap = await page.evaluate(`(() => {
      const heading = [...document.querySelectorAll('h2')]
        .find((h) => h.textContent.trim() === 'Roadmap');
      return heading ? heading.closest('section').innerText : '';
    })()`);

    assert.match(roadmap, /Roadmap/);
    // Nothing can produce "3 of 10 done": a closed step leaves the plan
    // entirely, so there is no completed count to divide by.
    assert.doesNotMatch(roadmap, /\d+\s*(of|\/)\s*\d+\s*(done|complete)/i);
    assert.match(roadmap, /nothing here to tick off/i);
  });

  // ------------------------------------------------- independent failure

  it('loses one tile rather than the page when a section fails', async () => {
    await signUp();
    await addSkillAndProject();
    await buildTwin();
    await openDashboard();

    // Break only the resumes endpoint, then reload the dashboard in-app.
    await page.evaluate(`(() => {
      const original = window.fetch;
      window.fetch = (input, init) => {
        const url = String(input);
        if (url.includes('/api/resumes')) return Promise.reject(new TypeError('Failed to fetch'));
        return original(input, init);
      };
    })()`);

    await page.evaluate(`(() => {
      const link = [...document.querySelectorAll('a')]
        .find((a) => a.getAttribute('href') === '/profile');
      link.click();
    })()`);
    await page.waitFor('location.pathname === "/profile"', { description: 'the profile page' });

    await page.evaluate(`(() => {
      const link = [...document.querySelectorAll('a')]
        .find((a) => a.getAttribute('href') === '/app');
      link.click();
    })()`);
    await page.waitFor(`document.body.innerText.includes("Welcome, ${NAME}")`, {
      description: 'the dashboard again',
    });

    const text = await page.bodyText();
    // The broken section says so and offers a retry...
    assert.match(text, /Could not reach the Nexora backend|trouble right now/);
    // ...and the rest of the dashboard is still there.
    assert.match(text, /Top career matches/);
    assert.match(text, /CareerTwin/);
  });

  // ------------------------------------------------------------- nav

  it('navigates between sections and marks the current one', async () => {
    await signUp();
    await openDashboard();

    await page.clickText('Careers');
    await page.waitFor('location.pathname === "/careers"', { description: 'the careers page' });

    const current = await page.evaluate(`(() => {
      const link = document.querySelector('[aria-current="page"]');
      return link ? link.textContent.trim() : null;
    })()`);
    assert.equal(current, 'Careers', 'the current section was not marked for assistive tech');
  });

  it('offers a working menu on a narrow viewport', async () => {
    await signUp();
    await openDashboard();

    // The disclosure exists and starts closed.
    const initial = await page.evaluate(`(() => {
      const button = [...document.querySelectorAll('button')]
        .find((b) => b.textContent.trim() === 'Menu');
      if (!button) return null;
      const panel = document.getElementById(button.getAttribute('aria-controls'));
      return { expanded: button.getAttribute('aria-expanded'), panelHidden: panel?.hidden ?? null };
    })()`);
    assert.deepEqual(initial, { expanded: 'false', panelHidden: true });

    await page.clickText('Menu');
    await page.waitFor(
      `document.querySelector('#app-nav-panel')?.hidden === false`,
      { description: 'the menu panel to open' },
    );

    const expanded = await page.evaluate(`(() => {
      const button = [...document.querySelectorAll('button')]
        .find((b) => b.textContent.trim() === 'Menu');
      return button.getAttribute('aria-expanded');
    })()`);
    assert.equal(expanded, 'true');
  });

  it('offers a skip link before the navigation', async () => {
    await signUp();
    await openDashboard();

    const first = await page.evaluate(`(() => {
      const link = document.querySelector('a');
      return { text: link.textContent.trim(), href: link.getAttribute('href') };
    })()`);

    assert.deepEqual(first, { text: 'Skip to content', href: '#main-content' });
    const target = await page.evaluate('Boolean(document.getElementById("main-content"))');
    assert.equal(target, true, 'the skip link points at nothing');
  });

  // ------------------------------------------------------- accessibility

  it('marks the page up with headings and logs no console errors', async () => {
    await signUp();
    await addSkillAndProject();
    await buildTwin();
    await openDashboard();

    const headings = await page.evaluate('document.querySelectorAll("h1, h2").length');
    assert.ok(headings >= 5, `expected a heading per tile, found ${headings}`);

    assert.deepEqual(page.consoleErrors, []);
  });
});
