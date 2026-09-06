// The hero visual: a ball folded from waste paper, circled by the three
// arrows of the recycling mark.
//
// The two halves share a shape on purpose. A kusudama is a sphere built from
// flat triangular panels, and the recycling mark is a triangle of three
// arrows — so the facets and the loop are the same form at two scales. That
// correspondence is the whole idea; everything else here is restraint.
//
// Inline SVG, no image asset and no library: it scales to any size, takes the
// brand colour from `currentColor`, and costs no network request — where a PNG
// of this would be larger, fixed-resolution and another thing to host.
//
// The ball's facets come from paper-ball-geometry.ts rather than being pasted
// in as literals. See that file for why.
//
// Marked `aria-hidden`: it is decorative. The hero's headline already says
// what this says, and describing an abstract graphic to a screen reader adds
// noise rather than information.

import { CREASE, paperBallFacets } from "./paper-ball-geometry";

// --- geometry -------------------------------------------------------------
//
// The arrow triangle has its centre at (200, 200) with a centre-to-vertex
// radius of 150, its top vertex pointing up. One arm is drawn along the side
// from the top vertex to the bottom-right one; the other two are that same arm
// rotated 120° and 240°, which is why only one set of coordinates appears
// below.
//
// Those numbers came from the side's own unit vector rather than from
// eyeballing: the shaft runs from 10% to 70% along the side, and the
// arrowhead's tip sits at 92% with its base 18 units either side of the shaft
// end, perpendicular to it. Corner gaps are what remains.
const ARM = {
  shaft: { x1: 213, y1: 72.5, x2: 290.9, y2: 207.5 },
  head: '319.5,257 306.5,198.5 275.3,216.5',
} as const;

// Clockwise, matching the standard mark. Each arm's dashes start a third of a
// cycle behind the one before, so the three read as one continuous loop
// rather than three arrows twitching in unison.
const ARMS = [
  { rotate: 0, delay: '0s' },
  { rotate: 120, delay: '-0.867s' },
  { rotate: 240, delay: '-1.733s' },
] as const;

export function RecycleBall({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 400"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {ARMS.map(({ rotate, delay }) => (
        <g key={rotate} transform={`rotate(${rotate} 200 200)`}>
          <line
            x1={ARM.shaft.x1}
            y1={ARM.shaft.y1}
            x2={ARM.shaft.x2}
            y2={ARM.shaft.y2}
            stroke="currentColor"
            strokeWidth={15}
            strokeLinecap="round"
            strokeDasharray="22 13"
            style={{ animationDelay: delay }}
            className="animate-dash-travel motion-reduce:animate-none"
          />
          <polygon points={ARM.head} fill="currentColor" />
        </g>
      ))}

      {/*
        Two nested groups, not one. The outer group positions the ball with an
        SVG `transform` attribute; the inner one carries the CSS animation. A
        CSS `transform` overrides the attribute rather than composing with it,
        so animating the positioned group directly throws the ball to the
        viewBox origin — which is exactly what happened on the first attempt.
      */}
      <g transform="translate(200 200)">
        <g
          className="animate-paper-bob motion-reduce:animate-none"
          stroke={CREASE}
          strokeWidth={0.5}
          strokeLinejoin="round"
        >
          {paperBallFacets().map((facet) => (
            <polygon key={facet.points} points={facet.points} fill={facet.fill} />
          ))}
        </g>
      </g>
    </svg>
  );
}
