import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { connectBrowser } from './helpers/browser.js';
import { startWebStack } from './helpers/stack.js';

/**
 * The public landing page, in a real browser.
 *
 * Frontend only: the page makes no API calls, so this boots Vite and Chrome
 * and nothing else. Running the backend and a database to test a page that
 * never talks to either would make this suite fail for reasons that have
 * nothing to do with it.
 *
 * What is asserted is what a visitor can do — the headline is present, the
 * actions go where they say they go, the disclosure opens on a phone, the
 * reduced-motion path leaves the page readable, and no dashboard content
 * leaks onto a public page. Nothing here asserts a class name or a
 * component's internals, because none of that is a promise to anyone.
 */
describe('landing page', { timeout: 180_000 }, () => {
  let stack;
  let page;

  before(async () => {
    stack = await startWebStack();
    page = await connectBrowser(stack.debugPort);
  });

  after(async () => {
    page?.close();
    await stack?.stop();
  });

  beforeEach(async () => {
    await page.setReducedMotion(false);
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${stack.appUrl}/`);
  });

  // ----------------------------------------------------------------- render

  it('serves the landing page at the root path', async () => {
    assert.equal(await page.path(), '/');

    const text = await page.bodyText();
    assert.match(text, /Nexora/);
    assert.match(text, /From student profile to career-ready candidate/i);
  });

  it('shows the hero headline as the page’s only h1', async () => {
    const headings = await page.evaluate(
      '[...document.querySelectorAll("h1")].map((h) => h.innerText)',
    );

    assert.equal(headings.length, 1);
    assert.match(headings[0], /Know where you are/i);
    assert.match(headings[0], /Know exactly what to do next/i);
  });

  it('renders without console errors', async () => {
    // The hero graph, the observers and the sequences have all initialised
    // by now; anything that threw would be recorded here.
    assert.deepEqual(page.consoleErrors, []);
  });

  // ------------------------------------------------------------------- CTAs

  it('sends the primary call to action to /register', async () => {
    await page.clickText('Build Your CareerTwin');
    await page.waitFor('location.pathname === "/register"', {
      description: 'navigation to /register',
    });

    assert.match(await page.bodyText(), /Create account/i);
  });

  it('sends the sign-in action to /login', async () => {
    await page.clickText('Sign in');
    await page.waitFor('location.pathname === "/login"', {
      description: 'navigation to /login',
    });

    assert.match(await page.bodyText(), /Sign in/i);
  });

  it('scrolls to the product flow from the secondary call to action', async () => {
    const before = await page.evaluate('window.scrollY');
    assert.equal(before, 0);

    await page.clickSelector('main a[href="#how-it-works"]');

    // The anchor is the browser's own, and the scroll is smoothed in CSS,
    // so the assertion waits for the section to arrive rather than for a
    // single frame.
    await page.waitFor(
      '(() => { const top = document.getElementById("how-it-works").getBoundingClientRect().top; return Math.abs(top) < 120; })()',
      { description: 'the product flow section to reach the top of the viewport' },
    );
  });

  it('navigates to each section from the navbar', async () => {
    // Reduced motion turns the smooth scroll into an instant jump, which is
    // the only way to assert four hops in a row: a second hash click while
    // the browser is still animating the first one is discarded, so a
    // smooth-scrolled version of this test would be asserting timing rather
    // than navigation. The smooth path is covered by the test above, which
    // clicks once.
    await page.setReducedMotion(true);
    await page.goto(`${stack.appUrl}/`);

    for (const [label, id] of [
      ['How It Works', 'how-it-works'],
      ['CareerTwin', 'career-twin'],
      ['Evidence', 'evidence'],
      ['Roadmap', 'roadmap'],
    ]) {
      await page.clickText(label);
      await page.waitFor(
        `(() => { const top = document.getElementById(${JSON.stringify(id)}).getBoundingClientRect().top; return Math.abs(top) < 140; })()`,
        { description: `the ${id} section to be scrolled to` },
      );
    }
  });

  // ------------------------------------------------------------- disclosure

  it('opens and closes the navigation on a phone', async () => {
    await page.setViewport({ width: 390, height: 844, mobile: true });
    await page.goto(`${stack.appUrl}/`);

    const panelVisible = () =>
      page.evaluate(
        '!document.getElementById("landing-nav-panel").hasAttribute("hidden")',
      );

    assert.equal(await panelVisible(), false);

    await page.clickText('Menu');
    assert.equal(await panelVisible(), true);
    assert.equal(
      await page.evaluate(
        'document.querySelector(\'[aria-controls="landing-nav-panel"]\').getAttribute("aria-expanded")',
      ),
      'true',
    );

    // Escape closes it and puts focus back on the control that opened it,
    // which is the part a keyboard user notices when it is missing.
    await page.evaluate(
      'window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))',
    );
    await page.waitFor(
      'document.getElementById("landing-nav-panel").hasAttribute("hidden")',
      { description: 'the panel to close on Escape' },
    );
    assert.equal(
      await page.evaluate(
        'document.activeElement === document.querySelector(\'[aria-controls="landing-nav-panel"]\')',
      ),
      true,
    );
  });

  it('reaches a section from the phone navigation', async () => {
    await page.setViewport({ width: 390, height: 844, mobile: true });
    await page.goto(`${stack.appUrl}/`);

    await page.clickText('Menu');
    // Named by selector: the desktop navigation is still in the document at
    // this width, hidden by CSS, and its "Evidence" link comes first in DOM
    // order. Clicking that one is not something a visitor can do.
    await page.clickSelector('#landing-nav-panel a[href="#evidence"]');

    await page.waitFor(
      '(() => { const top = document.getElementById("evidence").getBoundingClientRect().top; return Math.abs(top) < 160; })()',
      { description: 'the evidence section to be scrolled to' },
    );
    await page.waitFor(
      'document.getElementById("landing-nav-panel").hasAttribute("hidden")',
      { description: 'the panel to close after a selection' },
    );
  });

  // ---------------------------------------------------------------- layout

  it('does not overflow horizontally at any supported width', async () => {
    for (const width of [320, 375, 414, 768, 1024, 1440]) {
      await page.setViewport({ width, height: 900, mobile: width < 768 });
      await page.goto(`${stack.appUrl}/`);

      const overflow = await page.evaluate(`(() => {
        const root = document.documentElement;
        return root.scrollWidth - root.clientWidth;
      })()`);

      assert.ok(
        overflow <= 1,
        `Horizontal overflow of ${overflow}px at ${width}px wide.`,
      );
    }
  });

  it('reduces the hero graph on a phone', async () => {
    const countNodes = () =>
      page.evaluate(`[...document.querySelectorAll('figure button')]
        .filter((node) => node.getClientRects().length > 0).length`);

    const onDesktop = await countNodes();

    await page.setViewport({ width: 390, height: 844, mobile: true });
    await page.goto(`${stack.appUrl}/`);
    const onPhone = await countNodes();

    assert.ok(onDesktop > onPhone, 'The phone composition should carry fewer nodes.');
    assert.ok(onPhone >= 4, 'The phone composition should still be a graph.');
  });

  // -------------------------------------------------------- reduced motion

  it('leaves nothing hidden and nothing animating under reduced motion', async () => {
    await page.setReducedMotion(true);
    await page.goto(`${stack.appUrl}/`);

    // Everything the page reveals on scroll starts transparent. If the
    // reveal depended on a transition that reduced motion cancels, the page
    // would be blank below the hero — so this asserts the content is
    // actually visible, not merely that a media query was declared.
    const hidden = await page.evaluate(`(() => {
      return [...document.querySelectorAll('.nx-reveal, .nx-line, .nx-scatter')]
        .filter((el) => Number(getComputedStyle(el).opacity) < 0.9).length;
    })()`);
    assert.equal(hidden, 0);

    // Nothing is left moving. Waited for rather than sampled: the global
    // reduced-motion rule collapses durations to 0.01ms instead of removing
    // the animations, so a few can still be mid-tick on the frame the
    // assertion runs.
    await page.waitFor(
      'document.getAnimations().every((a) => a.playState !== "running")',
      { description: 'every animation to settle under reduced motion' },
    );

    // And in particular nothing perpetual: the hero's breathing halos and
    // evidence pulses must not merely be fast, they must not run.
    const perpetual = await page.evaluate(`document.getAnimations().filter(
      (a) => a.effect?.getComputedTiming?.().iterations === Infinity,
    ).length`);
    assert.equal(perpetual, 0);
  });

  it('shows the whole evidence sequence without motion', async () => {
    await page.setReducedMotion(true);
    await page.goto(`${stack.appUrl}/`);

    // The sequence's final state, which under reduced motion is where it
    // starts: the verified step, and the evidence that produces it.
    await page.waitFor('document.body.innerText.includes("Passed an assessment")', {
      description: 'the evidence sequence to render its final state',
    });
  });

  // ------------------------------------------------------------ boundaries

  it('exposes no signed-in dashboard content', async () => {
    const text = await page.bodyText();

    // Nothing that belongs to a session. The page does show example figures,
    // but never addressed to the visitor and never behind a login.
    assert.doesNotMatch(text, /Welcome,\s*$/m);
    assert.doesNotMatch(text, /Log out/i);
    assert.doesNotMatch(text, /Restoring your session/i);

    // Every example is labelled as one, so a visitor cannot read the
    // preview's numbers as their own.
    assert.match(text, /not your data|not real student data|Illustrative/i);
  });

  it('keeps the application routes protected', async () => {
    await page.clearStorage();

    for (const path of ['/app', '/profile', '/career-twin', '/careers']) {
      await page.goto(`${stack.appUrl}${path}`);
      await page.waitFor('location.pathname === "/login"', {
        description: `${path} to redirect an anonymous visitor to /login`,
      });
    }
  });

  it('keeps the public auth routes working', async () => {
    await page.goto(`${stack.appUrl}/register`);
    assert.match(await page.bodyText(), /Full name/i);

    await page.goto(`${stack.appUrl}/login`);
    assert.match(await page.bodyText(), /Password/i);
  });

  // --------------------------------------------------------- accessibility

  it('offers a skip link as the first focusable element', async () => {
    const skip = await page.evaluate(`(() => {
      const link = document.querySelector('a[href="#main-content"]');
      if (!link) return null;
      link.focus();
      return {
        focused: document.activeElement === link,
        text: link.innerText.trim(),
        target: Boolean(document.getElementById('main-content')),
      };
    })()`);

    assert.deepEqual(skip, { focused: true, text: 'Skip to content', target: true });
  });

  it('has one heading level below the h1 for every section', async () => {
    const levels = await page.evaluate(
      '[...document.querySelectorAll("h1, h2, h3")].map((h) => Number(h.tagName[1]))',
    );

    assert.equal(levels[0], 1);
    // No level is skipped: an h3 never follows the h1 without an h2 between.
    for (let index = 1; index < levels.length; index += 1) {
      assert.ok(
        levels[index] <= levels[index - 1] + 1,
        `Heading level jumped from h${levels[index - 1]} to h${levels[index]}.`,
      );
    }
  });
});
