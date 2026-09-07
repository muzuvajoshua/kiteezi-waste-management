"use client";

import { CREASE, paperBall } from "./paper-ball-geometry";

// The hero visual: a star ball folded from waste paper, held inside the three
// arrows of the recycling mark. Pressing it unfolds the paper to reveal the
// sign-in card.
//
// The two halves share a shape on purpose. A kusudama is a sphere of folded
// triangles and the mark is a triangle of three arrows, so the star's points
// and the loop are the same form at two scales.
//
// A `<button>`, not a link: it reveals a panel on this page rather than
// navigating. Presentational — the parent owns whether it is unfolding and
// what happens next, which keeps every state reachable in a test by passing a
// boolean.
//
// Inline SVG, no image asset and no library: it scales, takes the brand colour
// from `currentColor`, and costs no request.

// --- the recycling mark ---------------------------------------------------
//
// Centre (200, 200), centre-to-vertex radius 150, top vertex up, running
// clockwise like the standard mark.
//
// One arm is described here and the other two are it rotated 120° and 240°, so
// there is one set of numbers to get wrong rather than three. An arm starts
// partway along its own side, rounds the corner, and its head continues onto
// the NEXT side far enough to overlap where that arm begins — which is what
// makes the tips look tucked into one another instead of three loose chevrons.
const LOOP_CENTRE = 200;
const LOOP_RADIUS = 150;

/** Fraction along its own side where an arm begins. */
const START = 0.4;
/** Fraction along the next side where the shaft stops and the head begins. */
const HEAD_BASE = 0.3;
/** Fraction along the next side where the head's point lands. */
const HEAD_TIP = 0.58;
/** Distance either side of a corner used to round it. */
const CORNER = 36;
/** Half-width of the arrowhead. Wider than the shaft or it reads as a kink. */
const HEAD_HALF = 27;

/**
 * The casing colour: what shows in the gap where one arrow crosses another.
 *
 * Solid green over solid green is invisible, so without a casing the
 * overlapping tips merge into one blob rather than reading as a ribbon passing
 * over another.
 *
 * It has to match whatever the ball is sitting on, so it comes from a custom
 * property the parent sets. Hardcoding white was fine while the hero was pale
 * and became obviously wrong the moment the hero turned dark green — the
 * casing read as a bright sticker outline traced around the arrows.
 *
 * Applied through `style`, NOT through the `stroke`/`fill` attributes. SVG
 * presentation attributes are not parsed as CSS values, so `stroke="var(--x)"`
 * is silently ignored and the fallback never even applies — the first attempt
 * at this looked exactly as broken as the hardcoded white it replaced.
 */
const CASING = "var(--ball-casing, #ffffff)";

type Point = readonly [number, number];

const VERTICES: readonly Point[] = [0, 1, 2].map((i) => {
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
  return [
    LOOP_CENTRE + LOOP_RADIUS * Math.cos(angle),
    LOOP_CENTRE + LOOP_RADIUS * Math.sin(angle),
  ] as const;
});

const round = (n: number) => Math.round(n * 10) / 10;

const lerp = (a: Point, b: Point, t: number): Point => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];

const unit = (a: Point, b: Point): Point => {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const length = Math.hypot(dx, dy);
  return [dx / length, dy / length];
};

function buildArm() {
  const [a, b, c] = [VERTICES[0], VERTICES[1], VERTICES[2]];
  const into = unit(a, b);
  const outOf = unit(b, c);

  const start = lerp(a, b, START);
  const beforeCorner: Point = [b[0] - into[0] * CORNER, b[1] - into[1] * CORNER];
  const afterCorner: Point = [b[0] + outOf[0] * CORNER, b[1] + outOf[1] * CORNER];
  const headBase = lerp(b, c, HEAD_BASE);
  const tip = lerp(b, c, HEAD_TIP);

  const perpendicular: Point = [-outOf[1], outOf[0]];
  const cornerA: Point = [
    headBase[0] - perpendicular[0] * HEAD_HALF,
    headBase[1] - perpendicular[1] * HEAD_HALF,
  ];
  const cornerB: Point = [
    headBase[0] + perpendicular[0] * HEAD_HALF,
    headBase[1] + perpendicular[1] * HEAD_HALF,
  ];

  return {
    ribbon: [
      `M ${round(start[0])} ${round(start[1])}`,
      `L ${round(beforeCorner[0])} ${round(beforeCorner[1])}`,
      `Q ${round(b[0])} ${round(b[1])} ${round(afterCorner[0])} ${round(afterCorner[1])}`,
      `L ${round(headBase[0])} ${round(headBase[1])}`,
    ].join(" "),
    head: [tip, cornerA, cornerB].map(([x, y]) => `${round(x)},${round(y)}`).join(" "),
  };
}

const ARM = buildArm();
const ROTATIONS = [0, 120, 240];
const BALL = paperBall();

export interface RecycleBallProps {
  readonly className?: string;
  /** True once the paper is opening. Driven by the parent. */
  readonly unfolding?: boolean;
  readonly onUnfold?: () => void;
}

export function RecycleBall({ className, unfolding = false, onUnfold }: RecycleBallProps) {
  return (
    <button
      type="button"
      onClick={onUnfold}
      aria-expanded={unfolding}
      className={`group block w-full rounded-2xl outline-none ring-brand-600 ring-offset-4 focus-visible:ring-2 ${className ?? ""}`}
    >
      <svg viewBox="0 0 400 400" aria-hidden="true" focusable="false" className="h-auto w-full">
        {/*
          The whole loop turns rather than each arrow animating on its own.
          Three-fold symmetry means 120° is a complete cycle, so it repeats
          seamlessly. An earlier version travelled a dash pattern along each
          arm, which is what made the arrows dotted.
        */}
        <g
          className={
            unfolding
              ? "origin-[200px_200px] animate-loop-open"
              : "origin-[200px_200px] animate-loop-turn motion-reduce:animate-none"
          }
        >
          {ROTATIONS.map((rotation) => (
            <g key={rotation} transform={`rotate(${rotation} 200 200)`}>
              <path
                d={ARM.ribbon}
                fill="none"
                style={{ stroke: CASING }}
                strokeWidth={38}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <polygon
                points={ARM.head}
                style={{ fill: CASING, stroke: CASING }}
                strokeWidth={12}
                strokeLinejoin="round"
              />
              <path
                d={ARM.ribbon}
                fill="none"
                stroke="currentColor"
                strokeWidth={26}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <polygon points={ARM.head} fill="currentColor" />
            </g>
          ))}
        </g>

        {/*
          Two nested groups, not one. The outer positions the ball with an SVG
          `transform` attribute; the inner carries the CSS animation. A CSS
          transform overrides the attribute rather than composing with it, so
          animating the positioned group directly threw the ball to the viewBox
          origin — which is what the first attempt did.
        */}
        <g transform="translate(200 200)">
          <g
            className={
              unfolding
                ? "origin-center animate-ball-unfold"
                : "origin-center animate-paper-bob motion-reduce:animate-none"
            }
            stroke={CREASE}
            strokeWidth={0.6}
            strokeLinejoin="round"
          >
            {/*
              The open middle. The pyramid nearest the viewer is left out of
              the geometry, so these two polygons are the hollow inside showing
              through — and they are the affordance, the thing that suggests
              the paper can be opened.
            */}
            <polygon points={BALL.opening.points} fill="#6b6555" />
            <polygon points={BALL.opening.innerPoints} fill="#3d3931" />
            {BALL.facets.map((facet) => (
              <polygon key={facet.points} points={facet.points} fill={facet.fill} />
            ))}
          </g>
        </g>
      </svg>

      {/*
        A control nobody can tell is a control is decoration. The hero already
        has two buttons, so this one says what it does — quietly, and it is the
        only text in the graphic.
      */}
      {/*
        Inherits its colour from the parent rather than naming one, for the
        same reason as the casing: this now sits on a dark band, and a fixed
        grey was unreadable there.
      */}
      <span className="mt-3 block text-center text-sm text-current/70 transition-colors group-hover:text-accent-500">
        Unfold to sign in
      </span>
    </button>
  );
}
