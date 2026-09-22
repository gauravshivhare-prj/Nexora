import { useEffect, useState } from 'react';

/**
 * Which of the navigation's sections the visitor is currently reading.
 *
 * Powers the navbar's active state. One IntersectionObserver over the four
 * named sections, watching a band in the upper half of the viewport — the
 * same technique as the scroll-linked flows, and for the same reason: a
 * scroll handler that calls `getBoundingClientRect` on four elements per
 * frame is a measurable cost for a piece of navigation feedback.
 *
 * Returns `null` above the first section, so the navbar shows nothing as
 * active while the hero is on screen rather than falsely highlighting the
 * first link.
 *
 * @param {string[]} ids Element ids, in document order.
 */
export function useActiveSection(ids) {
  const [activeId, setActiveId] = useState(null);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;

    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((element) => element !== null);

    if (elements.length === 0) return undefined;

    // Tracks intersection per element, because the callback only reports what
    // changed and the answer depends on all of them.
    const visible = new Set();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }

        // The last one in document order that qualifies: scrolling down, the
        // section being entered is the one being read.
        const current = ids.filter((id) => visible.has(id)).at(-1) ?? null;
        setActiveId(current);
      },
      // A band from just under the sticky navbar to the middle of the
      // viewport. Narrow enough that two sections rarely qualify at once.
      { rootMargin: '-15% 0px -50% 0px', threshold: 0 },
    );

    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
    // `ids` is a module-level constant at every call site; joining it keeps
    // the effect from re-subscribing on every render without asking callers
    // to memoise an array literal.
  }, [ids.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  return activeId;
}
