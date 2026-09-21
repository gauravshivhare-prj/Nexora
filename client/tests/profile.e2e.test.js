import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { connectBrowser } from './helpers/browser.js';
import { startStack } from './helpers/stack.js';

/**
 * End-to-end Student Profile, in a real browser against the real backend.
 *
 * The questions worth answering here are the ones a backend test cannot: that
 * what a student types actually reaches the database, that it is still there
 * after a reload, and that a server-side rejection lands on the field it is
 * about rather than in a console somewhere.
 */

const PASSWORD = 'Str0ngPassphrase';
const NAME = 'Gaurav Shivhare';

let emailCounter = 0;
const uniqueEmail = () => `profile.e2e.${Date.now()}.${emailCounter++}@example.com`;

describe('student profile page', { timeout: 180_000 }, () => {
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

  /** Registers a fresh account through the UI, leaving the browser signed in. */
  async function signUp() {
    await page.goto(`${stack.appUrl}/register`);
    await page.fill('Full name', NAME);
    await page.fill('Email', uniqueEmail());
    await page.fill('Password', PASSWORD);
    await page.fill('Confirm password', PASSWORD);
    await page.clickText('Create account');
    await page.waitFor('location.pathname === "/app"', { description: 'navigation to /app' });
  }

  /** Opens /profile and waits for the form, not the skeleton. */
  async function openProfile() {
    await page.goto(`${stack.appUrl}/profile`);
    await page.waitFor('document.body.innerText.includes("Your profile")', {
      description: 'the profile form to load',
    });
  }

  const save = () => page.clickText('Save profile');

  const waitForSaved = () =>
    page.waitFor('document.body.innerText.includes("Profile saved")', {
      description: 'the save confirmation',
    });

  // ------------------------------------------------------------ protection

  it('sends a signed-out visitor to login and back again', async () => {
    await page.goto(`${stack.appUrl}/profile`);

    await page.waitFor('location.pathname === "/login"', {
      description: 'the redirect to login',
    });
    assert.equal(await page.storedToken(), null);
  });

  // ----------------------------------------------------------- empty state

  it('shows an empty state before anything has been saved', async () => {
    await signUp();
    await openProfile();

    const text = await page.bodyText();
    assert.match(text, /Nothing saved yet/);
    assert.match(text, /No skills added yet/);
    assert.match(text, /No projects added yet/);
    assert.match(text, /No certifications added yet/);
  });

  it('is reachable from the signed-in landing page', async () => {
    await signUp();
    await page.clickText('Your profile');

    await page.waitFor('location.pathname === "/profile"', {
      description: 'navigation to /profile',
    });
  });

  // ------------------------------------------------------------ saving

  it('saves a profile and confirms it', async () => {
    await signUp();
    await openProfile();

    await page.fill('City', 'Bhopal');
    await page.fill('State', 'Madhya Pradesh');
    await page.fill('College', 'Maulana Azad National Institute of Technology');
    await page.fill('CGPA', '8.4');
    await page.selectOption('Current semester', '6');
    await page.selectOption('Gender', 'male');

    await save();
    await waitForSaved();
  });

  it('keeps the saved profile after a reload', async () => {
    await signUp();
    await openProfile();

    await page.fill('City', 'Indore');
    await page.fill('Target role', 'Backend Developer');
    await save();
    await waitForSaved();

    await page.reload();
    await page.waitFor('document.body.innerText.includes("Your profile")', {
      description: 'the profile form after reload',
    });

    assert.equal(await page.valueOf('City'), 'Indore');
    assert.equal(await page.valueOf('Target role'), 'Backend Developer');
    // The empty-state line must be gone once something is stored.
    assert.doesNotMatch(await page.bodyText(), /Nothing saved yet/);
  });

  it('shows the value the server stored, not the one that was typed', async () => {
    await signUp();
    await openProfile();

    // The server rounds a CGPA to two decimals and trims whitespace.
    await page.fill('CGPA', '8.456789');
    await page.fill('City', '  Pune  ');
    await save();
    await waitForSaved();

    assert.equal(await page.valueOf('CGPA'), '8.46');
    assert.equal(await page.valueOf('City'), 'Pune');
  });

  // ------------------------------------------------------------- lists

  it('adds a skill and saves it', async () => {
    await signUp();
    await openProfile();

    await page.clickText('Add a skill');
    await page.fill('Skill', 'Node.js');
    await page.selectOption('Level you would claim', 'advanced');

    await save();
    await waitForSaved();

    await page.reload();
    await page.waitFor('document.body.innerText.includes("Your profile")', {
      description: 'the profile form after reload',
    });

    assert.equal(await page.valueOf('Skill'), 'Node.js');
    assert.equal(await page.valueOf('Level you would claim'), 'advanced');
    assert.match(await page.bodyText(), /1 skill/);
  });

  it('removes a skill', async () => {
    await signUp();
    await openProfile();

    await page.clickText('Add a skill');
    await page.fill('Skill', 'MongoDB');
    await save();
    await waitForSaved();

    await page.clickText('Remove');
    await save();
    await waitForSaved();

    await page.reload();
    await page.waitFor('document.body.innerText.includes("No skills added yet")', {
      description: 'the empty skills state',
    });
  });

  it('adds a career interest as a chip and drops a duplicate', async () => {
    await signUp();
    await openProfile();

    await page.fill('Career interests', 'Distributed systems');
    await page.clickText('Add');
    await page.fill('Career interests', 'distributed systems');
    await page.clickText('Add');

    const chips = await page.evaluate(
      'document.querySelectorAll(\'button[aria-label^="Remove "]\').length',
    );
    assert.equal(chips, 1, 'the duplicate interest was added anyway');

    await save();
    await waitForSaved();
  });

  it('drops an abandoned blank row instead of failing the save', async () => {
    await signUp();
    await openProfile();

    // "Add a skill" then think better of it, and save the rest of the form.
    await page.clickText('Add a skill');
    await page.fill('City', 'Bhopal');

    await save();
    await waitForSaved();

    assert.match(await page.bodyText(), /No skills added yet/);
  });

  // -------------------------------------------------------------- errors

  it('shows a server validation failure on the field it is about', async () => {
    await signUp();
    await openProfile();

    // The phone pattern is enforced by the server, not by the input, so this
    // exercises the whole round trip rather than a browser-side check.
    await page.fill('Phone', 'call me maybe');
    await save();

    await page.waitFor('document.body.innerText.includes("Must be a phone number")', {
      description: 'the phone validation message',
    });

    assert.match(await page.bodyText(), /Some fields need attention/);

    // The field is marked invalid for assistive technology too.
    const invalid = await page.evaluate(
      'document.querySelectorAll(\'[aria-invalid="true"]\').length',
    );
    assert.ok(invalid >= 1, 'no field was marked aria-invalid');
  });

  it('moves focus to the field the server rejected', async () => {
    await signUp();
    await openProfile();

    // Phone sits in the first section; scroll to the bottom so the rejected
    // field is genuinely off-screen when the answer comes back.
    await page.fill('Phone', 'call me maybe');
    await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
    await save();

    await page.waitFor(
      'document.activeElement?.getAttribute("aria-invalid") === "true"',
      { description: 'focus to move to the rejected field' },
    );

    // Focus landed on Phone specifically, not just on some invalid control.
    const label = await page.evaluate(
      'document.querySelector(\'label[for="\' + CSS.escape(document.activeElement.id) + \'"]\').innerText',
    );
    assert.match(label, /Phone/);
  });

  it('offers a retry on the save alert when the backend is unreachable', async () => {
    await signUp();
    await openProfile();

    // Break fetch, fail a save, then restore it and use the alert's retry —
    // so the retry is what completes the save, not a second Save press.
    await page.evaluate(`(() => {
      window.__realFetch = window.fetch;
      window.fetch = (input, init) =>
        window.__realFetch(String(input).replace(/:\\d+\\//, ':1/'), init);
    })()`);

    await page.fill('City', 'Bhopal');
    await save();
    await page.waitFor('document.body.innerText.includes("Try again")', {
      description: 'the retry action on the save alert',
    });

    await page.evaluate('window.fetch = window.__realFetch');
    await page.clickText('Try again');
    await waitForSaved();

    assert.equal(await page.valueOf('City'), 'Bhopal');
  });

  it('says so instead of silently dropping a duplicate interest', async () => {
    await signUp();
    await openProfile();

    await page.fill('Career interests', 'Distributed systems');
    await page.clickText('Add');
    await page.fill('Career interests', 'distributed systems');
    await page.clickText('Add');

    await page.waitFor(
      'document.body.innerText.includes("is already in the list")',
      { description: 'the duplicate notice' },
    );

    // Typing again retracts the notice: it is about the attempt, not a state.
    await page.fill('Career interests', 'Compilers');
    await page.waitFor(
      '!document.body.innerText.includes("is already in the list")',
      { description: 'the duplicate notice to clear' },
    );
  });

  it('clears an error once the field is corrected and saved', async () => {
    await signUp();
    await openProfile();

    await page.fill('Phone', 'nonsense');
    await save();
    await page.waitFor('document.body.innerText.includes("Must be a phone number")', {
      description: 'the phone validation message',
    });

    await page.fill('Phone', '+91 98765 43210');
    await save();
    await waitForSaved();

    assert.doesNotMatch(await page.bodyText(), /Must be a phone number/);
  });

  it('shows a usable message when the backend is unreachable', async () => {
    await signUp();
    await openProfile();

    // Redirect the client's requests to a port nothing is listening on, so
    // this is a real connection failure rather than a stubbed one.
    await page.evaluate(`(() => {
      const original = window.fetch;
      window.fetch = (input, init) =>
        original(String(input).replace(/:\\d+\\//, ':1/'), init);
    })()`);

    await page.fill('City', 'Bhopal');
    await save();

    await page.waitFor('document.querySelector("[role=alert]") !== null', {
      description: 'an error alert',
    });

    const alert = await page.evaluate('document.querySelector("[role=alert]").innerText');
    assert.match(alert, /Could not reach the Nexora backend|trouble right now/);
    assert.ok(!/\bat\s+\w+\s+\(/.test(alert), 'a stack trace was displayed');
  });

  // ------------------------------------------------------- accessibility

  it('labels every control and marks the page up with headings', async () => {
    await signUp();
    await openProfile();

    const unlabelled = await page.evaluate(`(() => {
      const controls = [...document.querySelectorAll('input, select, textarea')];
      return controls.filter((control) => {
        if (control.getAttribute('aria-label')) return false;
        return !document.querySelector('label[for="' + CSS.escape(control.id) + '"]');
      }).length;
    })()`);
    assert.equal(unlabelled, 0, 'some controls have no label');

    const headings = await page.evaluate('document.querySelectorAll("h1, h2").length');
    assert.ok(headings >= 6, `expected a heading per section, found ${headings}`);
  });

  it('produces no console errors through a full save', async () => {
    await signUp();
    await openProfile();

    await page.fill('City', 'Bhopal');
    await page.clickText('Add a project');
    await page.fill('Project title', 'Nexora');
    await save();
    await waitForSaved();

    assert.deepEqual(page.consoleErrors, []);
  });
});
