import { useCallback, useEffect, useState } from 'react';

import { useInView } from './useInView.js';
import { useReducedMotion } from './useReducedMotion.js';

/**
 * A short sequence that plays itself once the visitor can see it.
 *
 * Used where the point being made *is* a progression — claimed becoming
 * supported becoming verified — so a static diagram would have to be read
 * rather than understood.
 *
 * Three constraints it exists to honour:
 *
 *  - It does not run off screen. `once: false` on the view hook means the
 *    interval is cleared the moment the section leaves the viewport, so a
 *    visitor at the bottom of the page is not paying for animation at the
 *    top of it.
 *  - It stops at the end. No looping: an indefinitely repeating animation is
 *    a permanent distraction and a permanent timer.
 *  - Under reduced motion it never starts, and the sequence is reported as
 *    already finished so the final state is what gets rendered.
 *
 * Returns a setter as well, so the same component can be stepped by hand.
 * A visitor's click wins: `stop` ends the autoplay for good.
 */
export function useStepCycle(count, { intervalMs = 1600, startDelayMs = 400 } = {}) {
  const prefersReduced = useReducedMotion();
  const [ref, isInView] = useInView({ threshold: 0.4, once: false });

  const [step, setStep] = useState(0);
  const [isAuto, setIsAuto] = useState(true);

  const select = useCallback((next) => {
    setIsAuto(false);
    setStep(next);
  }, []);

  useEffect(() => {
    if (prefersReduced) {
      setStep(count - 1);
      setIsAuto(false);
    }
  }, [prefersReduced, count]);

  useEffect(() => {
    if (prefersReduced || !isAuto || !isInView) return undefined;
    if (step >= count - 1) return undefined;

    const delay = step === 0 ? startDelayMs + intervalMs : intervalMs;
    const timer = setTimeout(() => setStep((current) => current + 1), delay);

    return () => clearTimeout(timer);
  }, [prefersReduced, isAuto, isInView, step, count, intervalMs, startDelayMs]);

  return { ref, step, select, isComplete: step >= count - 1 };
}
