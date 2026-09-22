import { useEffect, useRef, useState } from 'react';

/**
 * Has this element been scrolled into view?
 *
 * One IntersectionObserver per configuration is shared by every element that
 * asks for it, rather than one observer per element. The landing page has
 * around forty reveal targets; forty observers is forty sets of internal
 * bookkeeping for a question they all ask identically.
 *
 * No scroll listener is involved anywhere on this page. A scroll handler that
 * measures `getBoundingClientRect` per element is the classic way to turn a
 * reveal animation into a main-thread stall.
 */

/** Keyed by the observer's configuration, so callers share instances. */
const observers = new Map();

/** Per-observer map of element → callback, since IO reports by target. */
const callbacks = new WeakMap();

function observerFor(rootMargin, threshold) {
  const key = `${rootMargin}|${threshold}`;
  const existing = observers.get(key);
  if (existing) return existing;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        callbacks.get(entry.target)?.(entry);
      }
    },
    { rootMargin, threshold },
  );

  observers.set(key, observer);
  return observer;
}

/**
 * @param {object} [options]
 * @param {string} [options.rootMargin] Positive values start the animation
 *   slightly before the element arrives, so it is already settling by the
 *   time it is properly on screen.
 * @param {number} [options.threshold]
 * @param {boolean} [options.once] Stop observing after the first entry. The
 *   default: a section that re-animates every time it is scrolled past is
 *   distracting rather than impressive.
 * @returns {[React.RefObject, boolean]} A ref to attach, and whether the
 *   element is (or has been) in view.
 */
export function useInView({ rootMargin = '0px 0px -12% 0px', threshold = 0.15, once = true } = {}) {
  const ref = useRef(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    // No IntersectionObserver means no reveal triggers, which would leave the
    // whole page hidden. Show everything instead.
    if (typeof IntersectionObserver === 'undefined') {
      setIsInView(true);
      return undefined;
    }

    const observer = observerFor(rootMargin, threshold);

    callbacks.set(element, (entry) => {
      if (entry.isIntersecting) {
        setIsInView(true);
        if (once) observer.unobserve(element);
      } else if (!once) {
        setIsInView(false);
      }
    });

    observer.observe(element);

    return () => {
      observer.unobserve(element);
      callbacks.delete(element);
    };
  }, [rootMargin, threshold, once]);

  return [ref, isInView];
}
