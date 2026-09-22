import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { connectBrowser } from './helpers/browser.js';
import { startStack } from './helpers/stack.js';

/**
 * End-to-end authentication, in a real browser against the real backend.
 *
 * Covers what unit tests cannot: that the token is stored, attached to
 * requests, survives a reload, and is genuinely gone after logout.
 */

const PASSWORD = 'Str0ngPassphrase';
const NAME = 'Gaurav Shivhare';

/** Unique per run so repeat runs never collide on the unique email index. */
let emailCounter = 0;
const uniqueEmail = () => `e2e.${Date.now()}.${emailCounter++}@example.com`;

describe('frontend authentication', { timeout: 180_000 }, () => {
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
    // Start every test signed out, with no leftover token.
    await page.goto(`${stack.appUrl}/`);
    await page.clearStorage();
  });

  /** Registers a fresh account through the UI and lands on /app. */
  async function registerFresh(email = uniqueEmail()) {
    await page.goto(`${stack.appUrl}/register`);
    await page.fill('Full name', NAME);
    await page.fill('Email', email);
    await page.fill('Password', PASSWORD);
    await page.fill('Confirm password', PASSWORD);
    await page.clickText('Create account');
    await page.waitFor('location.pathname === "/app"', { description: 'navigation to /app' });
    return email;
  }

  async function loginAs(email, password = PASSWORD) {
    await page.goto(`${stack.appUrl}/login`);
    await page.fill('Email', email);
    await page.fill('Password', password);
    await page.clickText('Sign in');
  }

  // -------------------------------------------------------------- register

  describe('register', () => {
    it('creates an account and starts an authenticated session', async () => {
      await registerFresh();

      // The dashboard greets by name from the session, so this is a check
      // that the token was exchanged for a real user rather than that some
      // page rendered. It loads asynchronously, hence the wait.
      await page.waitFor('document.body.innerText.includes("Welcome, Gaurav Shivhare")', {
        description: 'the dashboard greeting',
      });
      assert.ok(await page.storedToken(), 'no token was stored');
    });

    it('rejects an invalid email without calling the API', async () => {
      await page.goto(`${stack.appUrl}/register`);
      await page.fill('Full name', NAME);
      await page.fill('Email', 'not-an-email');
      await page.fill('Password', PASSWORD);
      await page.fill('Confirm password', PASSWORD);
      await page.clickText('Create account');

      await page.waitFor(
        'document.body.innerText.includes("Enter a valid email address")',
        { description: 'the email validation message' },
      );
      assert.equal(await page.path(), '/register');
      assert.equal(await page.storedToken(), null);
    });

    it('rejects a weak password', async () => {
      await page.goto(`${stack.appUrl}/register`);
      await page.fill('Full name', NAME);
      await page.fill('Email', uniqueEmail());
      await page.fill('Password', 'abc');
      await page.fill('Confirm password', 'abc');
      await page.clickText('Create account');

      await page.waitFor(
        'document.body.innerText.includes("Password must be at least 8 characters")',
        { description: 'the weak-password message' },
      );
      assert.equal(await page.path(), '/register');
    });

    it('rejects a mismatched confirmation', async () => {
      await page.goto(`${stack.appUrl}/register`);
      await page.fill('Full name', NAME);
      await page.fill('Email', uniqueEmail());
      await page.fill('Password', PASSWORD);
      await page.fill('Confirm password', 'Different1Password');
      await page.clickText('Create account');

      await page.waitFor('document.body.innerText.includes("Passwords do not match")', {
        description: 'the mismatch message',
      });
      assert.equal(await page.path(), '/register');
    });

    it('surfaces a duplicate email from the backend on the email field', async () => {
      const email = await registerFresh();
      await page.clearStorage();

      await page.goto(`${stack.appUrl}/register`);
      await page.fill('Full name', NAME);
      await page.fill('Email', email);
      await page.fill('Password', PASSWORD);
      await page.fill('Confirm password', PASSWORD);
      await page.clickText('Create account');

      await page.waitFor(
        'document.body.innerText.includes("An account with this email already exists")',
        { description: 'the duplicate-email message' },
      );
      assert.equal(await page.path(), '/register');
    });

    it('disables the submit button while the request is in flight', async () => {
      await page.goto(`${stack.appUrl}/register`);
      await page.fill('Full name', NAME);
      await page.fill('Email', uniqueEmail());
      await page.fill('Password', PASSWORD);
      await page.fill('Confirm password', PASSWORD);

      // Registration hashes at bcrypt cost 12, so the busy state is reliably
      // observable without artificial throttling.
      await page.clickText('Create account');
      await page.waitFor(
        'document.querySelector("button[type=submit]")?.disabled === true',
        { description: 'the submit button to disable' },
      );

      const label = await page.evaluate(
        'document.querySelector("button[type=submit]")?.textContent',
      );
      assert.match(label, /Creating your account/);
    });
  });

  // ----------------------------------------------------------------- login

  describe('login', () => {
    it('signs in with valid credentials', async () => {
      const email = await registerFresh();
      await page.clearStorage();

      await loginAs(email);
      await page.waitFor('location.pathname === "/app"', { description: 'navigation to /app' });

      // The dashboard fetches before it greets, so the pathname changing is
      // not yet the page being there.
      await page.waitFor('document.body.innerText.includes("Welcome, Gaurav Shivhare")', {
        description: 'the dashboard greeting',
      });
      assert.ok(await page.storedToken(), 'no token was stored');
    });

    it('rejects a wrong password without revealing more', async () => {
      const email = await registerFresh();
      await page.clearStorage();

      await loginAs(email, 'Wr0ngPassword');
      await page.waitFor(
        'document.body.innerText.includes("Incorrect email or password")',
        { description: 'the credentials error' },
      );

      assert.equal(await page.path(), '/login');
      assert.equal(await page.storedToken(), null);
    });

    it('gives an unknown email the same message as a wrong password', async () => {
      await loginAs('nobody-at-all@example.com');
      await page.waitFor(
        'document.body.innerText.includes("Incorrect email or password")',
        { description: 'the credentials error' },
      );
      assert.equal(await page.path(), '/login');
    });

    it('validates the form before calling the API', async () => {
      await page.goto(`${stack.appUrl}/login`);
      await page.clickText('Sign in');

      await page.waitFor('document.body.innerText.includes("Email is required")', {
        description: 'the required-email message',
      });
      assert.match(await page.bodyText(), /Password is required/);
      assert.equal(await page.path(), '/login');
    });

    it('shows a usable message when the backend is unreachable', async () => {
      // Point the client at a port nothing is listening on, so this is a
      // genuine connection failure rather than a stubbed one.
      await page.goto(`${stack.appUrl}/login`);
      await page.evaluate(`(() => {
        const original = window.fetch;
        window.fetch = (input, init) =>
          original(String(input).replace(/:\\d+\\//, ':1/'), init);
      })()`);

      await page.fill('Email', 'someone@example.com');
      await page.fill('Password', PASSWORD);
      await page.clickText('Sign in');

      await page.waitFor('document.querySelector("[role=alert]") !== null', {
        description: 'an error alert',
      });

      const alert = await page.evaluate('document.querySelector("[role=alert]").innerText');
      assert.match(alert, /Could not reach the Nexora backend|trouble right now/);
      // A stack trace must never reach the user.
      assert.ok(!/\bat\s+\w+\s+\(/.test(alert), 'a stack trace was displayed');
      assert.equal(await page.storedToken(), null);
    });
  });

  // --------------------------------------------------------------- session

  describe('session restoration', () => {
    it('restores the session across a page reload', async () => {
      await registerFresh();
      const tokenBefore = await page.storedToken();

      await page.reload();
      await page.waitFor('document.body.innerText.includes("Welcome, Gaurav Shivhare")', {
        description: 'the restored session',
      });

      assert.equal(await page.path(), '/app');
      assert.equal(await page.storedToken(), tokenBefore, 'the token changed on reload');
    });

    it('discards an invalid stored token and redirects to /login', async () => {
      await page.goto(`${stack.appUrl}/`);
      await page.setStoredToken('not.a.real.token');

      await page.goto(`${stack.appUrl}/app`);
      await page.waitFor('location.pathname === "/login"', {
        description: 'redirect to /login',
      });

      // A token the server rejected is worthless — it must not be kept.
      assert.equal(await page.storedToken(), null, 'the rejected token was not cleared');
    });

    it('sends an unauthenticated visitor from /app to /login', async () => {
      await page.goto(`${stack.appUrl}/app`);
      await page.waitFor('location.pathname === "/login"', {
        description: 'redirect to /login',
      });
      assert.ok(!(await page.bodyText()).includes('Log out'));
    });

    it('lets an authenticated visitor reach /app directly', async () => {
      await registerFresh();
      await page.goto(`${stack.appUrl}/app`);

      await page.waitFor('document.body.innerText.includes("Log out")', {
        description: 'the protected page',
      });
      assert.equal(await page.path(), '/app');
    });

    it('redirects an already-signed-in user away from /login', async () => {
      await registerFresh();
      await page.goto(`${stack.appUrl}/login`);

      await page.waitFor('location.pathname === "/app"', { description: 'redirect to /app' });
    });
  });

  // ---------------------------------------------------------------- logout

  describe('logout', () => {
    it('clears the session and returns to /login', async () => {
      await registerFresh();
      await page.clickText('Log out');

      await page.waitFor('location.pathname === "/login"', {
        description: 'redirect to /login',
      });
      assert.equal(await page.storedToken(), null, 'the token survived logout');
    });

    it('makes the protected page inaccessible afterwards', async () => {
      await registerFresh();
      await page.clickText('Log out');
      await page.waitFor('location.pathname === "/login"', { description: 'logout redirect' });

      await page.goto(`${stack.appUrl}/app`);
      await page.waitFor('location.pathname === "/login"', {
        description: 'redirect back to /login',
      });
      assert.ok(!(await page.bodyText()).includes('Log out'));
    });

    it('survives a reload after logout', async () => {
      await registerFresh();
      await page.clickText('Log out');
      await page.waitFor('location.pathname === "/login"', { description: 'logout redirect' });

      await page.reload();
      assert.equal(await page.storedToken(), null);
      assert.equal(await page.path(), '/login');
    });
  });

  // -------------------------------------------------------------- security

  describe('security and regression', () => {
    it('never renders the token or a password in the page', async () => {
      await registerFresh();
      const token = await page.storedToken();
      const text = await page.bodyText();
      const html = await page.evaluate('document.documentElement.outerHTML');

      assert.ok(!text.includes(token), 'the token was displayed');
      assert.ok(!html.includes(token), 'the token is present in the DOM');
      assert.ok(!text.includes(PASSWORD), 'the password was displayed');
      assert.ok(!html.includes(PASSWORD), 'the password is present in the DOM');
    });

    it('keeps the public foundation page and health check working', async () => {
      await page.goto(`${stack.appUrl}/`);
      await page.clickText('Check API Connection');

      await page.waitFor('document.body.innerText.includes("Nexora API is connected")', {
        description: 'a successful health check',
      });
    });

    it('labels every auth form control for assistive technology', async () => {
      // Register page.
      await page.goto(`${stack.appUrl}/register`);
      await page.waitFor('document.querySelector("form") !== null', {
        description: 'the register form',
      });

      const registerUnlabelled = await page.evaluate(`(() => {
        const controls = [...document.querySelectorAll('input, select, textarea')];
        return controls.filter((c) => {
          if (c.type === 'hidden') return false;
          if (c.getAttribute('aria-label')) return false;
          return !document.querySelector('label[for="' + CSS.escape(c.id) + '"]');
        }).length;
      })()`);
      assert.equal(registerUnlabelled, 0, 'register page has unlabelled controls');

      // Login page.
      await page.goto(`${stack.appUrl}/login`);
      await page.waitFor('document.querySelector("form") !== null', {
        description: 'the login form',
      });

      const loginUnlabelled = await page.evaluate(`(() => {
        const controls = [...document.querySelectorAll('input, select, textarea')];
        return controls.filter((c) => {
          if (c.type === 'hidden') return false;
          if (c.getAttribute('aria-label')) return false;
          return !document.querySelector('label[for="' + CSS.escape(c.id) + '"]');
        }).length;
      })()`);
      assert.equal(loginUnlabelled, 0, 'login page has unlabelled controls');
    });

    it('produced no console errors during the run', async () => {
      // Genuine failures are asserted individually above; this catches the
      // React warnings and stray exceptions that no single test looks for.
      assert.deepEqual(page.consoleErrors, []);
    });
  });
});
