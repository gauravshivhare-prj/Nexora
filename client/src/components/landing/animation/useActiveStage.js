import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Which stage of a vertical flow the visitor is currently reading.
 *
 * Drives the scroll-linked sections: the product loop and the roadmap. A
 * stage becomes active when it crosses the middle of the viewport, which is
 * expressed entirely as an IntersectionObserver root margin rather than as a
 * scroll handler doing arithmetic on every frame.
 *
 * The result is a single integer of React state per section, changing a
 * handful of times across the whole scroll. The visual consequences —
 * highlight, line fill, dimming — are CSS transitions on that attribute.
 *
 * Stages already passed stay "completed" rather than reverting, because the
 * flow is a narrative: scrolling back up should not un-tell the story.
 */
export function useActiveStage(count) {
  const [activeIndex, setActiveIndex] = useState(0);

  // Element per index. A plain array in a ref, so registering a stage never
  // triggers a render.
  const elements = useRef([]);
  const observer = useRef(null);

  // Callback ref factory. Memoised per index so React does not detach and
  // reattach the ref on every render.
  const registryRef = useRef(new Map());

  const register = useCallback((index) => {
    const registry = registryRef.current;
    if (!registry.has(index)) {
      registry.set(index, (element) => {
        elements.current[index] = element;

        if (!observer.current) return;
        if (element) observer.current.observe(element);
      });
    }
    return registry.get(index);
  }, []);

  useEffect(() => {
    const nodes = elements.current.filter(Boolean);
    if (nodes.length === 0 || typeof IntersectionObserver === 'undefined') return undefined;

    const instance = new IntersectionObserver(
      (entries) => {
        // The band is thin, so at most one or two stages qualify. Take the
        // furthest one, which is the one being scrolled into.
        let candidate = -1;

        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = elements.current.indexOf(entry.target);
          if (index > candidate) candidate = index;
        }

        if (candidate >= 0) setActiveIndex(candidate);
      },
      // A 20%-tall band across the vertical middle of the viewport.
      { rootMargin: '-40% 0px -40% 0px', threshold: 0 },
    );

    observer.current = instance;
    for (const node of nodes) instance.observe(node);

    return () => {
      instance.disconnect();
      observer.current = null;
    };
  }, [count]);

  return [register, activeIndex];
}
