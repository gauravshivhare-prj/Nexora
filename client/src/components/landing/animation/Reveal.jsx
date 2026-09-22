import { useInView } from './useInView.js';

/**
 * The page's one entrance animation.
 *
 * Every section reveal on the landing page goes through this, so the timing
 * curve and distance are defined once. The animation itself is CSS — opacity
 * and transform only, both compositor properties — and the only thing React
 * does is flip a data attribute when the element arrives. There is no
 * per-frame React work anywhere in a reveal.
 *
 * `delay` staggers siblings. Kept small and capped by the caller: a stagger
 * long enough to notice as a queue reads as the page being slow.
 */
export function Reveal({ as: Tag = 'div', delay = 0, className = '', children, ...rest }) {
  const [ref, isInView] = useInView();

  return (
    <Tag
      ref={ref}
      data-visible={isInView ? 'true' : 'false'}
      style={delay ? { '--nx-delay': `${delay}ms` } : undefined}
      className={`nx-reveal ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}
