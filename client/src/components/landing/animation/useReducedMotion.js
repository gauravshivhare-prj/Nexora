import { useEffect, useState } from 'react';

/**
 * Whether the visitor has asked for reduced motion.
 *
 * The CSS in landing.css already neutralises every keyframe animation under
 * the media query, so this hook exists only for the motion JavaScript cannot
 * express in CSS: the timers that advance the evidence sequence, the pointer
 * parallax, the scroll-linked progress. Those must not merely run faster —
 * they must not run at all, and the component has to show its finished state
 * instead.
 *
 * Read as a subscription rather than once, because the setting can change
 * while the page is open.
 */
const QUERY = '(prefers-reduced-motion: reduce)';

export function useReducedMotion() {
  // Guarded because this module is imported by tests that render without a
  // window, and because the first paint should not depend on an effect.
  const [prefersReduced, setPrefersReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches,
  );

  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const onChange = (event) => setPrefersReduced(event.matches);

    setPrefersReduced(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return prefersReduced;
}
