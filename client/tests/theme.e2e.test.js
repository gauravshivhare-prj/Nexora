import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { connectBrowser } from './helpers/browser.js';
import { startWebStack } from './helpers/stack.js';

/**
 * The theme: light, dark and system, in a real browser.
 *
 * Frontend only — the theme never touches the API, so this boots Vite and
 * Chrome and nothing else.
 *
 * Two things are asserted throughout rather than taken on trust. First, the
 * preference is read back from the browser's own computed styles, not from a
 * class name: a `data-theme` attribute that no token responds to would pass
 * an attribute assertion and leave the page white. Second, the dark palette's
 * contrast is computed rather than eyeballed, because "premium dark mode" and
 * "grey text nobody can read" look the same in a screenshot taken by someone
 * who already knows what it says.
 */

/** Token pairs that carry text, and the surface each is used on. */
const CONTRAST_PAIRS = [
  ['--color-ink', '--color-canvas'],
  ['--color-ink', '--color-surface'],
  ['--color-ink-muted', '--color-canvas'],
  ['--color-ink-muted', '--color-surface'],
  ['--color-ink-muted', '--color-orange-50'],
  ['--color-brand-text', '--color-surface'],
  ['--color-brand-text', '--color-orange-100'],
  ['--color-danger-text', '--color-red-50'],
  ['--color-warning-text', '--color-orange-100'],
  ['--color-green-700', '--color-green-50'],
  ['--color-on-brand', '--color-brand'],
];

/**
 * Reads the pairs above out of the live document and returns their contrast
 * ratios. Runs in the page because the values are whatever CSS actually
 * resolved, which is the only version that matters.
 */
const CONTRAST_SCRIPT = `(() => {
  const styles = getComputedStyle(document.documentElement);

  /*
   * Colours are resolved by painting them.
   *
   * The tokens are a mix of notations — the theme's own values are hex, and
   * Tailwind's default ramp is oklch — so string-parsing a computed value
   * works for some and silently produces nonsense for others. A 1×1 canvas
   * accepts every notation the browser does and hands back plain sRGB bytes.
   */
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d');

  const channels = (token) => {
    const value = styles.getPropertyValue(token).trim();

    context.clearRect(0, 0, 1, 1);
    context.fillStyle = '#000000';
    context.fillStyle = value;
    if (context.fillStyle === '#000000' && !/^(#000000|black)$/i.test(value)) {
      throw new Error('could not resolve ' + token + ' ("' + value + '")');
    }

    context.fillRect(0, 0, 1, 1);
    return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
  };

  const luminance = (token) => {
    const [r, g, b] = channels(token).map((value) => {
      const channel = value / 255;
      return channel <= 0.03928
        ? channel / 12.92
        : Math.pow((channel + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const result = ${JSON.stringify(CONTRAST_PAIRS)}.map(([foreground, background]) => {
    const [lighter, darker] = [luminance(foreground), luminance(background)]
      .sort((a, b) => b - a);
    return [
      foreground + ' on ' + background,
      Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100,
    ];
  });

  return result;
})()`;

describe('theme', { timeout: 180_000 }, () => {
  let stack;
  let page;

  /** The switcher's radio for one option, anywhere on the page. */
  const option = (value) => `[role="radiogroup"] input[value="${value}"]`;

  const resolvedTheme = () => page.evaluate('document.documentElement.dataset.theme');
  const preference = () => page.evaluate('document.documentElement.dataset.themePreference');
  const storedTheme = () => page.evaluate('window.localStorage.getItem("nexora.theme")');

  /**
   * Waits for the switch's colour cross-fade to finish.
   *
   * Necessary before reading any computed colour: during the transition
   * `getComputedStyle` reports the interpolated value, which at the first
   * frame is still the *old* colour. Measuring without this made the
   * repaint and contrast assertions read the light theme immediately after
   * switching to dark.
   */
  const settleTheme = () =>
    page.waitFor('!document.documentElement.hasAttribute("data-theme-changing")', {
      description: 'the theme cross-fade to finish',
    });

  /** The canvas colour the browser actually painted. */
  const canvas = async () => {
    await settleTheme();
    return page.evaluate('getComputedStyle(document.body).backgroundColor');
  };

  before(async () => {
    stack = await startWebStack();
    page = await connectBrowser(stack.debugPort);
  });

  after(async () => {
    page?.close();
    await stack?.stop();
  });

  beforeEach(async () => {
    await page.setViewport({ width: 1440, height: 900 });
    await page.setReducedMotion(false);
    // A clean slate: no stored preference, and an OS that prefers light.
    await page.setColorScheme('light');
    await page.goto(`${stack.appUrl}/`);
    await page.clearStorage();
    await page.goto(`${stack.appUrl}/`);
  });

  // ---------------------------------------------------------------- system

  it('follows the operating system when nothing has been chosen', async () => {
    assert.equal(await preference(), 'system');
    assert.equal(await resolvedTheme(), 'light');

    await page.setColorScheme('dark');
    await page.goto(`${stack.appUrl}/`);

    assert.equal(await preference(), 'system');
    assert.equal(await resolvedTheme(), 'dark');
  });

  it('follows the operating system changing while the page is open', async () => {
    assert.equal(await resolvedTheme(), 'light');

    // No reload: someone whose machine switches at sunset expects the open
    // tab to follow.
    await page.setColorScheme('dark');
    await page.waitFor('document.documentElement.dataset.theme === "dark"', {
      description: 'the page to follow the system into dark',
    });

    await page.setColorScheme('light');
    await page.waitFor('document.documentElement.dataset.theme === "light"', {
      description: 'the page to follow the system back to light',
    });
  });

  // -------------------------------------------------------------- choosing

  it('switches to dark, and actually repaints', async () => {
    const lightCanvas = await canvas();

    await page.clickSelector(option('dark'));
    await page.waitFor('document.documentElement.dataset.theme === "dark"', {
      description: 'the dark theme to apply',
    });

    const darkCanvas = await canvas();
    assert.notEqual(darkCanvas, lightCanvas, 'the canvas colour did not change');

    // Not merely different — actually dark. The three channels of a warm
    // charcoal are all well below the midpoint.
    const channels = darkCanvas.match(/\d+/g).slice(0, 3).map(Number);
    assert.ok(
      channels.every((channel) => channel < 80),
      `expected a dark canvas, got ${darkCanvas}`,
    );
  });

  it('overrides a dark operating system when light is chosen', async () => {
    await page.setColorScheme('dark');
    await page.goto(`${stack.appUrl}/`);
    assert.equal(await resolvedTheme(), 'dark');

    await page.clickSelector(option('light'));
    await page.waitFor('document.documentElement.dataset.theme === "light"', {
      description: 'the explicit light choice to win over the system',
    });

    assert.equal(await preference(), 'light');
  });

  it('returns to following the system when system is chosen again', async () => {
    await page.clickSelector(option('dark'));
    await page.waitFor('document.documentElement.dataset.theme === "dark"');

    await page.clickSelector(option('system'));
    await page.waitFor('document.documentElement.dataset.theme === "light"', {
      description: 'the system preference (light) to take over again',
    });

    assert.equal(await preference(), 'system');

    await page.setColorScheme('dark');
    await page.waitFor('document.documentElement.dataset.theme === "dark"', {
      description: 'the restored system preference to track the system',
    });
  });

  // ------------------------------------------------------------ persistence

  it('remembers the choice across a reload', async () => {
    await page.clickSelector(option('dark'));
    await page.waitFor('document.documentElement.dataset.theme === "dark"');

    assert.equal(await storedTheme(), 'dark');

    await page.goto(`${stack.appUrl}/`);

    assert.equal(await resolvedTheme(), 'dark');
    assert.equal(await preference(), 'dark');

    // And the selected option is still the selected option, which is what a
    // visitor checks when they come back.
    assert.equal(
      await page.evaluate(`document.querySelector('${option('dark')}').checked`),
      true,
    );
  });

  it('survives an unusable localStorage', async () => {
    // Safari's private mode and hardened browser settings reject writes. The
    // theme should degrade to "not remembered", not take the page down.
    await page.evaluate(`(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new Error('storage is blocked');
        },
      });
    })()`);

    await page.clickSelector(option('dark'));
    await page.waitFor('document.documentElement.dataset.theme === "dark"', {
      description: 'the theme to apply without storage',
    });

    assert.deepEqual(page.consoleErrors, []);
  });

  it('applies the theme before the app mounts', async () => {
    /*
     * The no-flash mechanism, asserted structurally: a blocking inline
     * script in <head> that reads the stored preference, placed before the
     * module that boots React.
     *
     * Structural rather than behavioural because the flash it prevents lasts
     * one paint — by the time a test can ask the page a question, React has
     * mounted and both mechanisms would give the same answer. What can be
     * checked is that the early script exists, runs first, and is not
     * deferred.
     */
    const head = await page.evaluate(`(() => {
      const scripts = [...document.querySelectorAll('script')];
      const inline = scripts.findIndex(
        (script) => !script.src && script.textContent.includes('nexora.theme'),
      );
      // The application's own entry, not simply the first module script:
      // the dev server injects its client before everything else, and the
      // question here is whether the theme is set before the app boots.
      const app = scripts.findIndex(
        (script) => script.src && /main\\.jsx|\\/assets\\/index-/.test(script.src),
      );
      const themeScript = scripts[inline];

      return {
        hasInline: inline !== -1,
        runsFirst: inline !== -1 && (app === -1 || inline < app),
        inHead: themeScript ? themeScript.closest('head') !== null : false,
        blocking: themeScript ? !themeScript.defer && !themeScript.async : false,
      };
    })()`);

    assert.deepEqual(head, {
      hasInline: true,
      runsFirst: true,
      inHead: true,
      blocking: true,
    });
  });

  // ----------------------------------------------------- the whole product

  it('themes the auth screens, not only the landing page', async () => {
    await page.clickSelector(option('dark'));
    await page.waitFor('document.documentElement.dataset.theme === "dark"');

    for (const path of ['/login', '/register']) {
      await page.goto(`${stack.appUrl}${path}`);

      assert.equal(await resolvedTheme(), 'dark', `${path} lost the theme`);

      // The card, not just the page: a dark background with white panels on
      // it is the failure this is looking for.
      await settleTheme();
      const card = await page.evaluate(`(() => {
        const section = document.querySelector('section[aria-labelledby="auth-heading"]');
        return getComputedStyle(section).backgroundColor;
      })()`);

      const channels = card.match(/\d+/g).slice(0, 3).map(Number);
      assert.ok(
        channels.every((channel) => channel < 90),
        `${path} card should be a dark surface, got ${card}`,
      );
    }
  });

  it('offers the switcher on the auth screens and inside the app shell', async () => {
    // Public page, auth page: both reachable without a session. The
    // signed-in shell's copy is covered by the dashboard suite, which has a
    // session to reach it with.
    for (const path of ['/', '/login']) {
      await page.goto(`${stack.appUrl}${path}`);

      const groups = await page.evaluate(
        'document.querySelectorAll(\'[role="radiogroup"]\').length',
      );
      assert.ok(groups >= 1, `no theme switcher on ${path}`);
    }
  });

  // --------------------------------------------------------- accessibility

  it('exposes the switcher as a labelled radio group', async () => {
    const semantics = await page.evaluate(`(() => {
      const group = document.querySelector('[role="radiogroup"]');
      const radios = [...group.querySelectorAll('input[type="radio"]')];

      return {
        label: group.getAttribute('aria-label'),
        values: radios.map((radio) => radio.value),
        // Each radio's accessible name comes from its wrapping label, so
        // the option is announced rather than read as an unnamed control.
        named: radios.every((radio) => radio.closest('label')?.textContent.trim().length > 0),
        checked: radios.filter((radio) => radio.checked).length,
        sameName: new Set(radios.map((radio) => radio.name)).size === 1,
      };
    })()`);

    assert.deepEqual(semantics, {
      label: 'Colour theme',
      values: ['light', 'dark', 'system'],
      named: true,
      checked: 1,
      sameName: true,
    });
  });

  it('is operable from the keyboard', async () => {
    // Focus the first option and walk the group with the arrow keys, which
    // is behaviour the browser provides to a radio group and the reason the
    // switcher is built from radios rather than from buttons.
    await page.evaluate(`document.querySelector('${option('light')}').focus()`);

    assert.equal(
      await page.evaluate(
        `document.activeElement === document.querySelector('${option('light')}')`,
      ),
      true,
      'the first option did not take focus',
    );

    await page.pressKey('ArrowRight');
    await page.waitFor('document.documentElement.dataset.themePreference === "dark"', {
      description: 'ArrowRight to select the dark option',
    });
    assert.equal(await resolvedTheme(), 'dark');

    await page.pressKey('ArrowRight');
    await page.waitFor('document.documentElement.dataset.themePreference === "system"', {
      description: 'ArrowRight to select the system option',
    });
  });

  it('shows a focus ring on the focused option', async () => {
    /*
     * Focused, then moved with a key.
     *
     * `:focus-visible` only matches once the browser is in keyboard
     * modality, so a programmatic `focus()` on its own — after the clicks
     * earlier in this suite — draws no ring and would make this assert the
     * opposite of what it means to.
     */
    await page.evaluate(`document.querySelector('${option('light')}').focus()`);
    await page.pressKey('ArrowRight');
    await page.waitFor('document.documentElement.dataset.themePreference === "dark"');

    // The ring is drawn on the label, because the input itself is visually
    // hidden. Asserted as a real computed outline width rather than as a
    // class name.
    const outline = await page.evaluate(`(() => {
      const label = document.querySelector('${option('dark')}').closest('label');
      const styles = getComputedStyle(label);
      return { width: styles.outlineWidth, style: styles.outlineStyle };
    })()`);

    assert.notEqual(outline.style, 'none');
    assert.ok(
      Number.parseFloat(outline.width) >= 2,
      `expected a visible focus ring, got ${outline.width}`,
    );
  });

  // --------------------------------------------------------------- quality

  it('meets AA contrast for every text token in dark mode', async () => {
    await page.clickSelector(option('dark'));
    await page.waitFor('document.documentElement.dataset.theme === "dark"');

    await settleTheme();
    const ratios = await page.evaluate(CONTRAST_SCRIPT);
    const failures = ratios.filter(([, ratio]) => ratio < 4.5);

    assert.deepEqual(
      failures,
      [],
      `these dark-theme pairs are below 4.5:1 — ${JSON.stringify(ratios)}`,
    );
  });

  it('meets AA contrast for every text token in light mode', async () => {
    await page.clickSelector(option('light'));
    await page.waitFor('document.documentElement.dataset.theme === "light"');

    await settleTheme();
    const ratios = await page.evaluate(CONTRAST_SCRIPT);

    // `--color-on-brand` is white on #EA580C in this theme: 3.7:1, which
    // passes AA only at large text sizes. It is the accepted design of the
    // primary button and predates the theme work, so it is excluded here by
    // name rather than silently by a lowered threshold.
    const failures = ratios.filter(
      ([pair, ratio]) => ratio < 4.5 && !pair.startsWith('--color-on-brand'),
    );

    assert.deepEqual(
      failures,
      [],
      `these light-theme pairs are below 4.5:1 — ${JSON.stringify(ratios)}`,
    );
  });

  it('does not overflow horizontally in dark mode at any supported width', async () => {
    await page.clickSelector(option('dark'));
    await page.waitFor('document.documentElement.dataset.theme === "dark"');

    for (const width of [320, 375, 414, 768, 1024, 1440]) {
      await page.setViewport({ width, height: 900, mobile: width < 768 });
      await page.goto(`${stack.appUrl}/`);

      const overflow = await page.evaluate(
        'document.documentElement.scrollWidth - document.documentElement.clientWidth',
      );

      assert.ok(overflow <= 1, `horizontal overflow of ${overflow}px at ${width}px in dark mode`);
    }
  });

  it('transitions colours only while the theme is changing', async () => {
    // A permanent global colour transition would fire on every hover and
    // every scroll-linked state change on the landing page. The attribute
    // that enables it must therefore be temporary.
    assert.equal(
      await page.evaluate('document.documentElement.hasAttribute("data-theme-changing")'),
      false,
    );

    await page.clickSelector(option('dark'));
    assert.equal(
      await page.evaluate('document.documentElement.hasAttribute("data-theme-changing")'),
      true,
      'the switch did not enable a colour transition',
    );

    await page.waitFor('!document.documentElement.hasAttribute("data-theme-changing")', {
      description: 'the colour transition to be removed after the switch',
    });
  });

  it('keeps the dark page readable with reduced motion', async () => {
    await page.clickSelector(option('dark'));
    await page.waitFor('document.documentElement.dataset.theme === "dark"');

    await page.setReducedMotion(true);
    await page.goto(`${stack.appUrl}/`);

    assert.equal(await resolvedTheme(), 'dark');

    const hidden = await page.evaluate(`(() => {
      return [...document.querySelectorAll('.nx-reveal, .nx-line, .nx-scatter')]
        .filter((element) => Number(getComputedStyle(element).opacity) < 0.9).length;
    })()`);

    assert.equal(hidden, 0);
  });

  it('renders the themed pages without console errors', async () => {
    await page.clickSelector(option('dark'));
    await page.waitFor('document.documentElement.dataset.theme === "dark"');

    for (const path of ['/', '/login', '/register']) {
      await page.goto(`${stack.appUrl}${path}`);
    }

    assert.deepEqual(page.consoleErrors, []);
  });
});
