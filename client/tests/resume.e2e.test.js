import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { connectBrowser } from './helpers/browser.js';
import { startStack } from './helpers/stack.js';

/**
 * End-to-end Resume page, in a real browser against the real backend.
 *
 * The analysis assertions lean on a deployment fact rather than a stub: the
 * test stack boots with no AI_PROVIDER configured, so POST
 * /api/resumes/:id/analysis answers 503 AI_PROVIDER_NOT_CONFIGURED every
 * time. That makes "analysis is unavailable" a deterministic state to test,
 * and it is the state a student on an unconfigured deployment actually sees.
 */

const PASSWORD = 'Str0ngPassphrase';
const NAME = 'Gaurav Shivhare';

/** Comfortably over the backend's 50-character minimum. */
const RESUME_TEXT = [
  'Gaurav Shivhare — Backend Developer',
  'Education: B.Tech in Computer Science, MANIT Bhopal, 2023-2027.',
  'Skills: Node.js, Express, MongoDB, React.',
  'Projects: Nexora — a career readiness platform built with Node.js and React.',
].join('\n');

let emailCounter = 0;
const uniqueEmail = () => `resume.e2e.${Date.now()}.${emailCounter++}@example.com`;

describe('resume page', { timeout: 180_000 }, () => {
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

  async function openResumes() {
    await page.goto(`${stack.appUrl}/resume`);
    await page.waitFor('document.body.innerText.includes("Add a resume")', {
      description: 'the resume page to load',
    });
  }

  /** Saves one resume and lands on its detail page. */
  async function saveResume(label = 'Backend internships') {
    await page.fill('Label', label);
    await page.fill('Resume text', RESUME_TEXT);
    await page.clickText('Save resume');

    await page.waitFor('document.body.innerText.includes("Open it to run the analysis")', {
      description: 'the save confirmation',
    });
  }

  /**
   * Opens the first row in the list.
   *
   * Clicked through the DOM rather than by link text: the row deliberately
   * carries its status badges inside the anchor, so its text is not just the
   * label, and asserting on an exact string would make the test brittle
   * against a badge wording change it is not about.
   */
  async function openFirstResume() {
    const clicked = await page.evaluate(`(() => {
      const row = document.querySelector('a[href^="/resume/"]');
      if (!row) return false;
      row.click();
      return true;
    })()`);
    assert.equal(clicked, true, 'no resume row was rendered');

    await page.waitFor('document.body.innerText.includes("Stored text")', {
      description: 'the resume detail page',
    });
  }

  // ------------------------------------------------------------ protection

  it('sends a signed-out visitor to login', async () => {
    await page.goto(`${stack.appUrl}/resume`);

    await page.waitFor('location.pathname === "/login"', {
      description: 'the redirect to login',
    });
    assert.equal(await page.storedToken(), null);
  });

  it('protects a resume detail URL too', async () => {
    await page.goto(`${stack.appUrl}/resume/507f1f77bcf86cd799439011`);

    await page.waitFor('location.pathname === "/login"', {
      description: 'the redirect to login',
    });
  });

  // ----------------------------------------------------------- empty state

  it('shows an empty state before anything is saved', async () => {
    await signUp();
    await openResumes();

    const text = await page.bodyText();
    assert.match(text, /No resumes saved yet/);
    assert.match(text, /Nothing saved yet/);
  });

  it('is reachable from the main navigation', async () => {
    await signUp();
    await page.clickText('Resume');

    await page.waitFor('location.pathname === "/resume"', {
      description: 'navigation to /resume',
    });
  });

  it('shows the enabled file upload control', async () => {
    await signUp();
    await openResumes();

    const fileInputs = await page.evaluate(
      'document.querySelectorAll(\'input[type="file"]\').length',
    );
    assert.equal(fileInputs, 1, 'the enabled upload control was not rendered');
    assert.match(await page.bodyText(), /PDF, DOCX or plain text/);
  });

  it('rejects an invalid file before making an upload request', async () => {
    await signUp();
    await openResumes();

    await page.setFileInput('resume.exe', 'not a resume', 'application/octet-stream');

    await page.waitFor('document.body.innerText.includes("Choose a PDF, DOCX or plain text")', {
      description: 'the invalid file message',
    });
    const uploadCalls = await page.evaluate('window.__uploadCalls ?? 0');
    assert.equal(uploadCalls, 0);
  });

  it('shows upload loading state and calls the upload endpoint', async () => {
    await signUp();
    await openResumes();
    await page.setFileInput('resume.txt', RESUME_TEXT, 'text/plain');

    await page.evaluate(`(() => {
      const original = window.fetch;
      window.__uploadCalls = 0;
      window.__releaseUpload = null;
      window.fetch = (input, init) => {
        if (String(input).endsWith('/api/resumes/upload')) {
          window.__uploadCalls += 1;
          return new Promise((resolve) => {
            window.__releaseUpload = () => original(input, init).then(resolve);
          });
        }
        return original(input, init);
      };
    })()`);

    await page.clickText('Upload resume');
    await page.waitFor('document.body.innerText.includes("Uploading…")', {
      description: 'the upload loading state',
    });
    assert.equal(await page.evaluate('window.__uploadCalls'), 1);
    await page.evaluate('window.__releaseUpload()');
  });

  it('reflects a successful uploaded resume and its real processing status', async () => {
    await signUp();
    await openResumes();
    await page.setFileInput('resume.txt', RESUME_TEXT, 'text/plain');
    await page.clickText('Upload resume');

    await page.waitFor('document.body.innerText.includes("Uploaded")', {
      description: 'the upload confirmation',
    });
    const text = await page.bodyText();
    assert.match(text, /resume.txt/);
    assert.match(text, /Text: Done/);
    assert.match(text, /Analysis: Not started/);
  });

  it('displays a server upload error and offers retry', async () => {
    await signUp();
    await openResumes();
    await page.setFileInput('resume.txt', RESUME_TEXT, 'text/plain');

    await page.evaluate(`(() => {
      const original = window.fetch;
      window.fetch = (input, init) => String(input).endsWith('/api/resumes/upload')
        ? Promise.resolve(new Response(JSON.stringify({
            success: false,
            message: 'The upload was rejected by the server.',
            errorCode: 'VALIDATION_ERROR',
          }), { status: 400, headers: { 'Content-Type': 'application/json' } }))
        : original(input, init);
    })()`);

    await page.clickText('Upload resume');
    await page.waitFor('document.body.innerText.includes("The upload was rejected by the server")', {
      description: 'the server upload error',
    });
    assert.match(await page.bodyText(), /Try again/);
  });

  // ---------------------------------------------------------- saving text

  it('saves a pasted resume and lists it', async () => {
    await signUp();
    await openResumes();
    await saveResume();

    const text = await page.bodyText();
    assert.match(text, /Backend internships/);
    assert.match(text, /Text: Done/);
    assert.match(text, /Analysis: Not started/);
    assert.doesNotMatch(text, /No resumes saved yet/);
  });

  it('keeps the saved resume after a reload', async () => {
    await signUp();
    await openResumes();
    await saveResume();

    await page.reload();
    await page.waitFor('document.body.innerText.includes("Backend internships")', {
      description: 'the saved resume after reload',
    });
    assert.match(await page.bodyText(), /1 of 10 saved/);
  });

  it('opens a saved resume and shows the text that was stored', async () => {
    await signUp();
    await openResumes();
    await saveResume();
    await openFirstResume();

    const text = await page.bodyText();
    assert.match(text, /MANIT Bhopal/);
    assert.match(text, /Not analysed yet/);
  });

  // ------------------------------------------------------ input validation

  it('will not submit a resume that is too short, and says why', async () => {
    await signUp();
    await openResumes();

    await page.fill('Resume text', 'Too short.');

    await page.waitFor(
      'document.body.innerText.includes("Too short to be a resume")',
      { description: 'the length message' },
    );

    const disabled = await page.evaluate(`(() => {
      const button = [...document.querySelectorAll('button')]
        .find((b) => b.textContent.trim() === 'Save resume');
      return button.disabled;
    })()`);
    assert.equal(disabled, true, 'a resume below the minimum length could be submitted');
  });

  // -------------------------------------------------------------- analysis

  it('reports that analysis is unavailable instead of inventing a result', async () => {
    await signUp();
    await openResumes();
    await saveResume();
    await openFirstResume();

    await page.clickText('Analyse this resume');

    await page.waitFor(
      'document.body.innerText.includes("no AI provider is configured")',
      { description: 'the unconfigured-provider message' },
    );

    const text = await page.bodyText();
    // A 503 is a deployment state that can change, so it offers a retry...
    assert.match(text, /Try again/);
    // ...and nothing was fabricated to fill the gap.
    assert.match(text, /Not analysed yet|analysis did not finish/);
  });

  it('does not mark the resume failed when the deployment has no provider', async () => {
    await signUp();
    await openResumes();
    await saveResume();
    await openFirstResume();

    await page.clickText('Analyse this resume');
    await page.waitFor(
      'document.body.innerText.includes("no AI provider is configured")',
      { description: 'the unconfigured-provider message' },
    );

    // analyseResume() resolves the provider before it writes anything, so an
    // unconfigured deployment leaves the document exactly as it was. The
    // badge must reflect the document, not the attempt: "Failed" here would
    // blame the resume for a deployment's missing configuration, and would
    // still be on screen after a reload.
    assert.match(await page.bodyText(), /Analysis: Not started/);

    await page.reload();
    await page.waitFor('document.body.innerText.includes("Stored text")', {
      description: 'the resume detail page after reload',
    });

    const text = await page.bodyText();
    assert.match(text, /Analysis: Not started/);
    assert.doesNotMatch(text, /The last analysis failed/);
  });

  // --------------------------------------------------------------- deleting

  it('deletes a resume behind a confirmation', async () => {
    await signUp();
    await openResumes();
    await saveResume();
    await openFirstResume();

    await page.clickText('Delete this resume');
    await page.waitFor(
      'document.body.innerText.includes("Yes, delete this resume")',
      { description: 'the delete confirmation' },
    );

    await page.clickText('Yes, delete this resume');
    await page.waitFor('location.pathname === "/resume"', {
      description: 'the return to the resume list',
    });
    await page.waitFor('document.body.innerText.includes("No resumes saved yet")', {
      description: 'the empty list after deleting',
    });
  });

  // ----------------------------------------------------------- not found

  it('does not reveal whether an unknown resume id exists', async () => {
    await signUp();
    await page.goto(`${stack.appUrl}/resume/507f1f77bcf86cd799439011`);

    await page.waitFor('document.body.innerText.includes("not there")', {
      description: 'the not-found state',
    });

    // The same wording a resume belonging to someone else produces.
    assert.match(await page.bodyText(), /No resume was found with that id/);
  });

  // -------------------------------------------------------------- errors

  it('shows a usable message when the backend is unreachable', async () => {
    await signUp();
    await openResumes();

    await page.evaluate(`(() => {
      const original = window.fetch;
      window.fetch = (input, init) =>
        original(String(input).replace(/:\\d+\\//, ':1/'), init);
    })()`);

    await page.fill('Resume text', RESUME_TEXT);
    await page.clickText('Save resume');

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
    await openResumes();
    await saveResume();
    await openFirstResume();

    const unlabelled = await page.evaluate(`(() => {
      const controls = [...document.querySelectorAll('input, select, textarea')];
      return controls.filter((control) => {
        if (control.getAttribute('aria-label')) return false;
        return !document.querySelector('label[for="' + CSS.escape(control.id) + '"]');
      }).length;
    })()`);
    assert.equal(unlabelled, 0, 'some controls have no label');

    const headings = await page.evaluate('document.querySelectorAll("h1, h2").length');
    assert.ok(headings >= 4, `expected a heading per section, found ${headings}`);
  });

  it('produces no console errors through save, open and analyse', async () => {
    await signUp();
    await openResumes();
    await saveResume();
    await openFirstResume();

    await page.clickText('Analyse this resume');
    await page.waitFor(
      'document.body.innerText.includes("no AI provider is configured")',
      { description: 'the analysis attempt to settle' },
    );

    assert.deepEqual(page.consoleErrors, []);
  });
});
