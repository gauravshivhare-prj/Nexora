/**
 * Minimal Chrome DevTools Protocol driver.
 *
 * Node 22 ships a WebSocket client and Chrome speaks CDP, so a real browser
 * can be driven with no test dependency at all. Deliberately small: only the
 * operations these tests need.
 */

const CDP_HTTP = 'http://127.0.0.1';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Opens a CDP session against the browser's first page target. */
export async function connectBrowser(debugPort) {
  const target = await waitForPageTarget(debugPort);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('Could not open a CDP WebSocket.'));
  });

  let nextId = 1;
  const pending = new Map();
  const consoleErrors = [];

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);

    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
      return;
    }

    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      consoleErrors.push(
        message.params.args.map((a) => a.value ?? a.description ?? a.type).join(' '),
      );
    }
    if (message.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(
        `uncaught: ${message.params.exceptionDetails.exception?.description ?? 'exception'}`,
      );
    }
  };

  function send(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate(expression) {
    const { result, exceptionDetails } = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails) {
      throw new Error(exceptionDetails.exception?.description ?? 'evaluate failed');
    }
    return result.value;
  }

  await send('Runtime.enable');
  await send('Page.enable');

  /** Polls an expression until it is truthy, or fails with context. */
  async function waitFor(expression, { timeoutMs = 10_000, description } = {}) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      if (await evaluate(`Boolean(${expression})`)) return;
      await sleep(50);
    }

    const visible = await evaluate('document.body?.innerText?.slice(0, 600) ?? "<no body>"');
    throw new Error(
      `Timed out waiting for ${description ?? expression}.\nPage text was:\n${visible}`,
    );
  }

  return {
    evaluate,
    waitFor,
    consoleErrors,

    async goto(url) {
      await send('Page.navigate', { url });
      await waitFor('document.querySelector("#root")?.children.length > 0', {
        description: 'the React app to mount',
      });
    },

    async reload() {
      await send('Page.reload');
      await waitFor('document.querySelector("#root")?.children.length > 0', {
        description: 'the React app to mount after reload',
      });
    },

    /** Current pathname, for asserting redirects. */
    path() {
      return evaluate('location.pathname');
    },

    /**
     * Types into the input belonging to a label.
     *
     * Assigns through the native value setter and dispatches `input`, which
     * is what React's synthetic onChange actually listens for — setting
     * `.value` alone would update the DOM but not the component state.
     */
    async fill(labelText, value) {
      const ok = await evaluate(`(() => {
        const label = [...document.querySelectorAll('label')]
          .find((l) => l.textContent.trim().startsWith(${JSON.stringify(labelText)}));
        if (!label) return false;
        const input = document.getElementById(label.htmlFor);
        if (!input) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, ${JSON.stringify(value)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`);

      if (!ok) throw new Error(`No input found for label "${labelText}".`);
    },

    /** Clicks the first button or link whose trimmed text matches. */
    async clickText(text) {
      const ok = await evaluate(`(() => {
        const el = [...document.querySelectorAll('button, a')]
          .find((n) => n.textContent.trim() === ${JSON.stringify(text)});
        if (!el) return false;
        el.click();
        return true;
      })()`);

      if (!ok) throw new Error(`No clickable element with text "${text}".`);
    },

    bodyText() {
      return evaluate('document.body.innerText');
    },

    /** Reads the persisted token — to assert it is stored and cleared. */
    storedToken() {
      return evaluate('window.localStorage.getItem("nexora.auth.token")');
    },

    setStoredToken(token) {
      return evaluate(
        `window.localStorage.setItem("nexora.auth.token", ${JSON.stringify(token)})`,
      );
    },

    clearStorage() {
      return evaluate('window.localStorage.clear()');
    },

    close() {
      ws.close();
    },
  };
}

async function waitForPageTarget(debugPort) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const targets = await (await fetch(`${CDP_HTTP}:${debugPort}/json/list`)).json();
      const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch {
      /* browser still starting */
    }
    await sleep(250);
  }
  throw new Error('Chrome did not expose a page target.');
}
