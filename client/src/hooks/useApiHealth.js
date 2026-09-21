import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchApiHealth } from '../services/health.service.js';

/** The four states the connection check can be in. */
export const HEALTH_STATUS = {
  IDLE: 'idle',
  LOADING: 'loading',
  SUCCESS: 'success',
  ERROR: 'error',
};

/**
 * Owns the state machine for the backend connection check.
 *
 * Kept out of the component so the UI only renders `status`; the check is not
 * run on mount because Phase 0 requires the user to trigger it deliberately.
 *
 * @returns {{ status: string, data: object | null, error: string | null, check: () => void }}
 */
export function useApiHealth() {
  const [status, setStatus] = useState(HEALTH_STATUS.IDLE);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  // Lets a still-running check be cancelled by a newer one or by unmount,
  // so a slow response can never overwrite fresher state.
  const inFlightRef = useRef(null);

  useEffect(() => () => inFlightRef.current?.abort(), []);

  const check = useCallback(async () => {
    inFlightRef.current?.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;

    setStatus(HEALTH_STATUS.LOADING);
    setError(null);

    try {
      const result = await fetchApiHealth({ signal: controller.signal });
      if (controller.signal.aborted) return;

      setData(result);
      setStatus(HEALTH_STATUS.SUCCESS);
    } catch (caught) {
      if (controller.signal.aborted) return;

      // The full error goes to the console for the developer; the component
      // renders only `caught.message`, which carries no stack or internals.
      console.error('Nexora health check failed:', caught);

      setData(null);
      setError(caught.message);
      setStatus(HEALTH_STATUS.ERROR);
    }
  }, []);

  return { status, data, error, check };
}
