import { useEffect, useRef, useState } from 'react';

import { useInView } from './animation/useInView.js';
import { useReducedMotion } from './animation/useReducedMotion.js';

/**
 * The hero's CareerTwin graph.
 *
 * A conceptual picture of what Nexora builds from a student's profile: skills
 * and sources as nodes, each carried at the strength its evidence justifies,
 * all resolving to one centre. It is a metaphor, labelled as one — the states
 * shown are the product's real four, but the skills are an example, and the
 * caption says so.
 *
 * ## How it is built, and why
 *
 * Edges are SVG, nodes are HTML positioned over them in the same percentage
 * coordinate space. The hybrid is deliberate:
 *
 *  - SVG paths get `vector-effect="non-scaling-stroke"`, which lets the
 *    drawing stretch with the container on a 0–100 viewBox without the
 *    strokes distorting.
 *  - HTML nodes are real `<button>`s. Their evidence detail is revealed on
 *    hover *and* focus by CSS alone, so it is reachable from a keyboard,
 *    announced by a screen reader, and costs no JavaScript. Node labels in
 *    SVG text would have given up all three.
 *
 * ## What runs per frame
 *
 * Nothing in React. The breathing halos and the travelling evidence pulses
 * are CSS keyframes, paused outright whenever the hero is off screen. The
 * pointer parallax writes two custom properties from a
 * requestAnimationFrame-coalesced handler, which the compositor consumes as
 * a transform — no state, no re-render, no layout read.
 */

/**
 * The example graph.
 *
 * `depth` assigns a node to a parallax plane, so the graph has some
 * dimension when the pointer moves. `dense` marks the nodes dropped on small
 * screens — a phone gets six nodes rather than ten, which is a different
 * composition rather than the same one shrunk.
 */
const NODES = [
  {
    key: 'javascript',
    label: 'JavaScript',
    state: 'supported',
    detail: 'Used in two projects',
    x: 17,
    y: 21,
    depth: 1.6,
  },
  {
    key: 'react',
    label: 'React',
    state: 'supported',
    detail: 'Used in a project, named in a resume',
    x: 38,
    y: 9,
    depth: 2.4,
  },
  {
    key: 'python',
    label: 'Python',
    state: 'claimed',
    detail: 'Listed on the profile only',
    x: 77,
    y: 14,
    depth: 1.2,
    dense: true,
  },
  {
    key: 'node',
    label: 'Node.js',
    state: 'supported',
    detail: 'Used in a project',
    x: 84,
    y: 41,
    depth: 2,
  },
  {
    key: 'projects',
    label: 'Projects',
    state: 'source',
    detail: '3 projects, with technologies listed',
    x: 80,
    y: 72,
    depth: 1.5,
  },
  {
    key: 'certifications',
    label: 'Certifications',
    state: 'source',
    detail: '2 certifications on the profile',
    x: 58,
    y: 90,
    depth: 2.2,
    dense: true,
  },
  {
    key: 'education',
    label: 'Education',
    state: 'source',
    detail: 'B.Tech, Computer Science',
    x: 31,
    y: 91,
    depth: 1.3,
  },
  {
    key: 'interests',
    label: 'Interests',
    state: 'source',
    detail: 'Web development, product engineering',
    x: 7,
    y: 71,
    depth: 1.8,
    dense: true,
  },
  {
    key: 'resume',
    label: 'Resume',
    state: 'source',
    detail: 'Analysed — skills extracted',
    x: 13,
    y: 45,
    depth: 1.1,
  },
  {
    key: 'assessment',
    label: 'Assessment',
    state: 'planned',
    detail: 'The only route to Verified. In development.',
    x: 63,
    y: 30,
    depth: 2.6,
    dense: true,
  },
];

/** Nodes whose edge carries a travelling pulse: the ones that feed evidence. */
const FLOWING = new Set(['projects', 'resume', 'certifications']);

/*
 * Node weight follows evidence weight.
 *
 * Supported skills are the strongest thing in the graph — they are what the
 * product is about — then the sources that feed them, then a bare claim,
 * then the assessment route that does not exist yet. Reading the graph
 * top-down should tell you the hierarchy before you read a single label,
 * and it has to survive the animation being paused.
 */
const NODE_STYLES = {
  supported: 'border-orange-300 bg-orange-100 text-brand-text shadow-sm shadow-orange-900/10',
  claimed: 'border-orange-200 bg-surface text-ink-muted',
  source: 'border-orange-200 bg-surface font-medium text-ink',
  planned: 'border-dashed border-ink-muted/40 bg-canvas/60 text-ink-muted',
};

const STATE_LABELS = {
  supported: 'Supported',
  claimed: 'Claimed',
  source: 'Evidence source',
  planned: 'In development',
};

export function CareerTwinVisual() {
  const prefersReduced = useReducedMotion();
  const [viewRef, isInView] = useInView({ threshold: 0.1, once: false });

  const container = useRef(null);

  // The connections draw themselves in once and stay drawn. Tying them to
  // the live flag instead would un-draw the graph every time the visitor
  // scrolled back to the top, which looks like a glitch rather than a reveal.
  const [isDrawn, setIsDrawn] = useState(false);
  useEffect(() => {
    if (isInView) setIsDrawn(true);
  }, [isInView]);

  useEffect(() => {
    const element = container.current;
    if (!element || prefersReduced) return undefined;

    // Parallax is a pointer affordance. On a touch screen there is no hover
    // state to respond to, and binding a move handler there would animate
    // the graph while someone is trying to scroll past it.
    if (window.matchMedia('(hover: none)').matches) return undefined;

    let frame = 0;
    let nextX = 0;
    let nextY = 0;

    // The container's box, read on entry and on resize only. Reading it per
    // pointer move would force a layout on every move; `offsetX` would avoid
    // that but is measured against whichever child is under the pointer, so
    // it jumps as the cursor crosses a node.
    let box = null;

    const apply = () => {
      frame = 0;
      element.style.setProperty('--nx-px', nextX.toFixed(2));
      element.style.setProperty('--nx-py', nextY.toFixed(2));
    };

    const schedule = () => {
      // Coalesce to one write per frame regardless of pointer event rate.
      if (!frame) frame = requestAnimationFrame(apply);
    };

    const onPointerEnter = () => {
      box = element.getBoundingClientRect();
    };

    const onPointerMove = (event) => {
      if (!box) box = element.getBoundingClientRect();

      nextX = ((event.clientX - box.left) / box.width - 0.5) * 12;
      nextY = ((event.clientY - box.top) / box.height - 0.5) * 12;
      schedule();
    };

    const onPointerLeave = () => {
      nextX = 0;
      nextY = 0;
      box = null;
      schedule();
    };

    element.addEventListener('pointerenter', onPointerEnter);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerleave', onPointerLeave);

    // A resize or a scroll invalidates the cached box. Both are discarded
    // rather than re-measured: the next move re-reads it once.
    const invalidate = () => {
      box = null;
    };
    window.addEventListener('resize', invalidate, { passive: true });
    window.addEventListener('scroll', invalidate, { passive: true });

    return () => {
      element.removeEventListener('pointerenter', onPointerEnter);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('resize', invalidate);
      window.removeEventListener('scroll', invalidate);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [prefersReduced]);

  return (
    <figure ref={viewRef} className="m-0">
      <div
        ref={container}
        // Everything animated below keys off this attribute, so leaving the
        // hero suspends the whole graph rather than each piece deciding.
        data-graph-live={isInView && !prefersReduced ? 'true' : 'false'}
        data-graph-drawn={isDrawn ? 'true' : 'false'}
        className="relative mx-auto aspect-square w-full max-w-[34rem] sm:aspect-[6/5]"
      >
        <Edges />

        {/* The centre. Sits above the edges and anchors them visually. */}
        <div
          className="nx-parallax absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ '--nx-depth': 0.4 }}
        >
          {/*
            The intelligence hub, and it should read as one: a ring in the
            accent, two stacked shadows for real depth, and a breathing halo
            behind it. Everything else in the graph is deliberately flatter,
            because a diagram where every node has the same weight has no
            centre.
          */}
          <div className="relative flex flex-col items-center rounded-2xl border border-orange-300 bg-surface px-4 py-3 text-center ring-1 ring-brand/25 shadow-xl shadow-orange-900/15 sm:px-6 sm:py-4">
            <span
              aria-hidden="true"
              className="nx-node-halo nx-center-halo absolute -inset-3 -z-10 rounded-3xl"
            />
            <span className="text-[10px] font-semibold tracking-[0.18em] text-brand-text uppercase">
              Nexora
            </span>
            <span className="mt-0.5 text-base font-bold tracking-tight text-ink sm:text-lg">
              CareerTwin
            </span>
            {/* Hidden on a phone: the card's width is what pushes the
                surrounding nodes off the canvas at that size, and the
                caption under the figure already says what this is. */}
            <span className="mt-1 hidden text-[11px] text-ink-muted sm:block">
              One evidence-backed model
            </span>
          </div>
        </div>

        {NODES.map((node, index) => (
          <Node key={node.key} node={node} index={index} />
        ))}
      </div>

      <figcaption className="mt-5 text-center text-xs text-ink-muted">
        <span aria-hidden="true" className="mr-1.5">
          ⓘ
        </span>
        Conceptual illustration of a CareerTwin. Example skills and sources — not real student
        data.
      </figcaption>
    </figure>
  );
}

/**
 * One node.
 *
 * A button because it discloses something on interaction. It carries no
 * click handler: the disclosure is CSS on `:hover` and `:focus-visible`,
 * which means a keyboard reaches it and the page ships no handler for it.
 * The detail is also in the accessible name, so it is never hover-only
 * information.
 */
function Node({ node, index }) {
  return (
    <div
      className={`nx-parallax group absolute -translate-x-1/2 -translate-y-1/2 ${
        node.dense ? 'hidden sm:block' : ''
      }`}
      style={{
        left: `${node.x}%`,
        top: `${node.y}%`,
        '--nx-depth': node.depth,
      }}
    >
      <button
        type="button"
        // Nothing is submitted or navigated; the button exists to be
        // focusable so the detail below is reachable without a pointer.
        aria-label={`${node.label} — ${STATE_LABELS[node.state]}. ${node.detail}`}
        className={`nx-lift relative flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap shadow-sm shadow-orange-900/5 sm:px-3 sm:py-1.5 sm:text-xs ${NODE_STYLES[node.state]}`}
      >
        <span
          aria-hidden="true"
          className="nx-node-halo absolute -inset-1.5 -z-10 rounded-full bg-brand/10"
          style={{ '--nx-delay': `${index * 260}ms` }}
        />
        <StateGlyph state={node.state} />
        {node.label}
      </button>

      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-full left-1/2 z-10 mt-1.5 hidden -translate-x-1/2 rounded-lg border border-orange-100 bg-surface px-2 py-1 text-[10px] leading-snug font-medium text-ink-muted opacity-0 shadow-md shadow-orange-900/10 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 sm:block sm:max-w-[13rem] sm:min-w-[9rem]"
      >
        {node.detail}
      </span>
    </div>
  );
}

function StateGlyph({ state }) {
  const glyphs = { supported: '◐', claimed: '○', source: '◆', planned: '◔' };

  return (
    <span aria-hidden="true" className="text-[9px] opacity-80">
      {glyphs[state]}
    </span>
  );
}

/**
 * The connections.
 *
 * One `<path>` per node, drawn in a 0–100 space that stretches with the
 * container. Each is a quadratic curve bowed away from the centre, so the
 * graph reads as organic rather than as a bicycle wheel.
 *
 * `--nx-length` is the dash length used to draw the line in. It does not
 * need to be the path's exact measured length — an over-estimate simply
 * means the stroke is fully hidden before it starts, which is what a draw-in
 * wants. Measuring each path with `getTotalLength` would mean ten forced
 * layouts at mount for no visible difference.
 */
function Edges() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 size-full"
    >
      <defs>
        <linearGradient id="nx-edge-gradient" x1="0" y1="0" x2="1" y2="1">
          {/* Theme tokens rather than literals: the same two stops are
              invisible on charcoal at the opacities that are right on
              off-white. */}
          <stop offset="0%" stopColor="var(--nx-edge-color)" stopOpacity="var(--nx-edge-strong)" />
          <stop offset="100%" stopColor="var(--nx-edge-color)" stopOpacity="var(--nx-edge-weak)" />
        </linearGradient>
      </defs>

      {NODES.map((node, index) => {
        // Bow the curve: the control point sits off the straight line
        // between centre and node, perpendicular-ish, scaled by distance.
        const midX = (50 + node.x) / 2;
        const midY = (50 + node.y) / 2;
        const bow = 0.16;
        const controlX = midX + (node.y - 50) * bow;
        const controlY = midY - (node.x - 50) * bow;

        return (
          <g key={node.key} className={node.dense ? 'hidden sm:inline' : undefined}>
            <path
              d={`M 50 50 Q ${controlX} ${controlY} ${node.x} ${node.y}`}
              fill="none"
              stroke="url(#nx-edge-gradient)"
              strokeWidth="1.25"
              strokeLinecap="round"
              strokeDasharray={node.state === 'planned' ? '3 3' : undefined}
              vectorEffect="non-scaling-stroke"
              className="nx-edge"
              style={{ '--nx-length': 160, '--nx-delay': `${240 + index * 90}ms` }}
            />

            {/* Evidence travelling towards the twin, on the edges that
                actually carry evidence in the product. */}
            {FLOWING.has(node.key) ? (
              <path
                d={`M ${node.x} ${node.y} Q ${controlX} ${controlY} 50 50`}
                fill="none"
                stroke="var(--color-brand)"
                strokeWidth="2.5"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                className="nx-flow"
                style={{ '--nx-delay': `${index * 1100}ms` }}
              />
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
