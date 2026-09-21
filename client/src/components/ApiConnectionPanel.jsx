import { HEALTH_STATUS, useApiHealth } from '../hooks/useApiHealth.js';
import { StatusRow } from './StatusRow.jsx';

/**
 * The Phase 0 connection check.
 *
 * Calls the real GET /api/health through the shared API client. Nothing here
 * is mocked: until the button is pressed and the backend answers, the panel
 * reports the backend as unknown rather than implying it is connected.
 */

/** Maps the hook's state to what the backend row should say. */
const BACKEND_ROW = {
  [HEALTH_STATUS.IDLE]: { state: 'Unknown', tone: 'unknown', note: 'Not checked yet.' },
  [HEALTH_STATUS.LOADING]: { state: 'Checking', tone: 'pending', note: 'Contacting the API…' },
  [HEALTH_STATUS.SUCCESS]: { state: 'Connected', tone: 'ready' },
  [HEALTH_STATUS.ERROR]: { state: 'Unreachable', tone: 'failed' },
};

/** The sentence shown in the live region beneath the button. */
const RESULT_MESSAGE = {
  [HEALTH_STATUS.LOADING]: 'Checking Nexora services…',
  [HEALTH_STATUS.SUCCESS]: 'Nexora API is connected.',
  [HEALTH_STATUS.ERROR]: 'Unable to connect to Nexora services.',
};

export function ApiConnectionPanel() {
  const { status, data, error, check } = useApiHealth();

  const isLoading = status === HEALTH_STATUS.LOADING;
  const backendRow = BACKEND_ROW[status];
  const resultMessage = RESULT_MESSAGE[status];

  const backendNote =
    status === HEALTH_STATUS.SUCCESS && data?.environment
      ? `Responded from the "${data.environment}" environment.`
      : backendRow.note;

  return (
    <section
      aria-labelledby="connection-heading"
      className="animate-rise rounded-2xl border border-orange-100 bg-surface p-6 shadow-sm shadow-orange-900/5 sm:p-8"
    >
      <h2 id="connection-heading" className="text-base font-semibold text-ink">
        Service connectivity
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Verify that this interface can reach the Nexora API.
      </p>

      <button
        type="button"
        onClick={check}
        disabled={isLoading}
        // aria-busy tells assistive tech the control is working; the disabled
        // state prevents the duplicate submissions the UX rules call out.
        aria-busy={isLoading}
        className="mt-5 w-full rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:bg-brand-soft disabled:cursor-not-allowed disabled:bg-ink-muted sm:w-auto"
      >
        {isLoading ? 'Checking Nexora services…' : 'Check API Connection'}
      </button>

      {/*
        role="status" announces the outcome to screen readers without stealing
        focus. It is always in the DOM so the announcement is not missed.
      */}
      <div role="status" aria-live="polite" className="mt-4 empty:mt-0">
        {resultMessage ? (
          <ResultMessage status={status} message={resultMessage} detail={error} />
        ) : null}
      </div>

      <dl className="mt-6 divide-y divide-orange-100 border-t border-orange-100 pt-1">
        <StatusRow
          label="Frontend"
          state="Ready"
          tone="ready"
          note="This React application rendered successfully."
        />
        <StatusRow label="Backend API" state={backendRow.state} tone={backendRow.tone} note={backendNote} />
        <StatusRow
          label="Database"
          state="Not reported"
          tone="unknown"
          note="Backend dependent — GET /api/health does not report database status, so it cannot be confirmed here."
        />
      </dl>
    </section>
  );
}

/** Renders the outcome line, including the user-facing reason on failure. */
function ResultMessage({ status, message, detail }) {
  const isError = status === HEALTH_STATUS.ERROR;
  const isSuccess = status === HEALTH_STATUS.SUCCESS;

  const tone = isError
    ? 'border-red-200 bg-red-50 text-danger'
    : isSuccess
      ? 'border-green-200 bg-green-50 text-success'
      : 'border-orange-200 bg-orange-50 text-ink-muted';

  return (
    <div className={`animate-rise rounded-xl border px-4 py-3 text-sm ${tone}`}>
      <p className="font-semibold">
        <span aria-hidden="true" className="mr-2">
          {isError ? '✕' : isSuccess ? '✓' : '…'}
        </span>
        {message}
      </p>

      {/* The reason is shown, never swallowed — but it is a plain sentence
          from the API client, never a stack trace. */}
      {isError && detail ? <p className="mt-1 text-ink-muted">{detail}</p> : null}
    </div>
  );
}
