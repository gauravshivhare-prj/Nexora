import { ApiRequestError } from '../services/apiClient.js';

/**
 * Turns a failure into something a student can act on.
 *
 * The backend writes its 4xx messages for display, so they are shown as-is;
 * anything unexpected gets a generic line rather than risking internals on
 * screen.
 *
 * Originally in ResumePage.jsx; moved here because every data-loading page
 * uses the same logic.
 */
export function toMessage(error, fallback) {
  if (error instanceof ApiRequestError) {
    if (error.status === null) return error.message; // network / timeout

    // 502 and 503 are the AI pipeline's own answers — "the provider is not
    // configured", "its output could not be trusted" — and the backend
    // writes both for display. Replacing them with a generic line would
    // hide the one thing that tells a student whether to wait or give up.
    if (error.status >= 500 && error.status !== 502 && error.status !== 503) {
      return 'Nexora is having trouble right now. Please try again in a moment.';
    }
    return error.message;
  }

  console.error(fallback, error);
  return fallback;
}
