/**
 * An AbortSignal that fires when the client goes away mid-request.
 *
 * Only worth attaching to handlers that do something expensive and
 * abandonable. For Nexora that means the AI calls: a student who closes the
 * tab mid-analysis should not leave Nexora paying a provider for an answer
 * nobody will read.
 *
 * Getting the source of truth right here took measuring rather than
 * guessing, and two plausible choices are both wrong:
 *
 * - `req.signal` does not exist. That is a Fetch API convenience; Node's
 *   `http.IncomingMessage` has no such property, so reading it yields
 *   `undefined` and passing that along looks like cancellation support
 *   while providing none.
 * - `req`'s own `close` event fires on *healthy* requests too, once the
 *   body has been consumed. Aborting on it would cancel every analysis a
 *   fraction of a second after it started.
 *
 * What actually distinguishes the two cases is the response: `res` emits
 * `close` either way, but `res.writableEnded` is only true when the reply
 * was actually sent. Close without a finished write is a disconnect.
 *
 * @param {import('http').ServerResponse} res
 * @returns {AbortSignal}
 */
export function clientGoneSignal(res) {
  const controller = new AbortController();

  res.once('close', () => {
    if (!res.writableEnded) controller.abort();
  });

  return controller.signal;
}
