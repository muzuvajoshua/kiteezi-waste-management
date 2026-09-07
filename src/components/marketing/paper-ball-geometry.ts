// The geometry of the star-folded paper ball in the landing page hero.
//
// The reference is a kusudama star ball: paper modules folded so that each
// face of an icosahedron carries a raised pyramid, and five pyramids meet at
// every vertex to form a star rosette. So this is a stellated icosahedron —
// twenty pyramids, three visible sides each — not a sphere with flat facets.
//
// An earlier version modelled a plain geodesic sphere. It read as a low-poly
// ball rather than folded paper, because a sphere's panels all tilt the same
// way and nothing casts a point. The spikes are what make it a star.
//
// The ball is open at the front: the pyramid nearest the viewer is left out,
// exposing the hollow inside. That opening is the affordance for unfolding it
// — see RecycleBall.tsx.
//
// A pure function rather than literal polygons. Running the arithmetic is
// free, since the page is static and this happens once at build time.

const PHI = (1 + Math.sqrt(5)) / 2;

/** Radius of the icosahedron's vertices, in the SVG's own units. */
export const BALL_RADIUS = 50;

/**
 * How far each pyramid's apex sits beyond the sphere, as a multiple of the
 * radius. Below about 1.15 the ball looks merely bumpy; above about 1.6 the
 * spikes go needly and the paper reads as plastic.
 *
 * BALL_RADIUS * SPIKE is the real outer extent, and it has to stay under the
 * arrow triangle's inradius of 75 or the points push through the arrows. That
 * product is the constraint, which is why raising the spike meant lowering
 * the radius rather than both going up.
 */
const SPIKE = 1.45;

/** The furthest any point reaches from the centre. */
export const OUTER_RADIUS = BALL_RADIUS * SPIKE;

// Off-axis on both axes. A vertex pointed straight at the viewer gives a
// symmetric rosette that reads as a flat pattern rather than an object.
const ROTATE_X = 0.42;
const ROTATE_Y = 0.62;

// Upper-left, matching the way the reference photograph is lit.
const LIGHT = normalise([-0.45, 0.72, 0.65]);

// Paper, not plastic. The band is wider than a sphere's would need to be,
// because a stellated solid genuinely has faces turned right away from the
// light and flattening them loses the spikes.
const SHADOW = [0x8f, 0x88, 0x77] as const;
const HIGHLIGHT = [0xff, 0xfe, 0xfa] as const;

/** The colour of a fold. Without it adjacent panels blur together. */
export const CREASE = '#9c9686';

type Vec3 = readonly [number, number, number];

export interface Facet {
  /** `points` for an SVG polygon, relative to the ball's centre. */
  readonly points: string;
  readonly fill: string;
}

export interface Opening {
  /** `points` for the hole itself — the base of the pyramid taken out. */
  readonly points: string;
  /** A smaller polygon inside it, to read as depth rather than a flat patch. */
  readonly innerPoints: string;
}

export interface PaperBall {
  readonly facets: readonly Facet[];
  /** Where the missing front pyramid leaves the ball hollow. */
  readonly opening: Opening;
}

function normalise([x, y, z]: Vec3): Vec3 {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}

function scale([x, y, z]: Vec3, k: number): Vec3 {
  return [x * k, y * k, z * k];
}

function centroid(face: readonly Vec3[]): Vec3 {
  return [
    face.reduce((s, v) => s + v[0], 0) / face.length,
    face.reduce((s, v) => s + v[1], 0) / face.length,
    face.reduce((s, v) => s + v[2], 0) / face.length,
  ];
}

/**
 * True surface normal, by cross product.
 *
 * A sphere lets you cheat and use the centroid direction, which is what the
 * geodesic version did. A pyramid's sides tilt away from the centroid, so
 * cheating here would light every side of a spike identically and the spike
 * would vanish.
 */
function faceNormal([a, b, c]: readonly Vec3[]): Vec3 {
  const u: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return normalise([
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ]);
}

function rotate([x, y, z]: Vec3): Vec3 {
  const y1 = y * Math.cos(ROTATE_X) - z * Math.sin(ROTATE_X);
  const z1 = y * Math.sin(ROTATE_X) + z * Math.cos(ROTATE_X);
  return [
    x * Math.cos(ROTATE_Y) + z1 * Math.sin(ROTATE_Y),
    y1,
    -x * Math.sin(ROTATE_Y) + z1 * Math.cos(ROTATE_Y),
  ];
}

const VERTICES: readonly Vec3[] = (
  [
    [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
    [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
    [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
  ] as Vec3[]
).map(normalise);

const FACES: readonly (readonly [number, number, number])[] = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

const round = (n: number) => Math.round(n * 10) / 10;

const channel = (index: 0 | 1 | 2, level: number) =>
  Math.round(SHADOW[index] + (HIGHLIGHT[index] - SHADOW[index]) * level)
    .toString(16)
    .padStart(2, '0');

const fill = (level: number) => `#${channel(0, level)}${channel(1, level)}${channel(2, level)}`;

const project = ([x, y]: Vec3) => [round(x * BALL_RADIUS), round(-y * BALL_RADIUS)] as const;

/** One side of one pyramid. */
interface Side {
  readonly tri: readonly Vec3[];
  readonly depth: number;
  readonly lambert: number;
}

export function paperBall(): PaperBall {
  // Build every pyramid in view space, keeping them grouped so the front one
  // can be dropped whole. Dropping loose triangles would leave a ragged notch
  // rather than an opening.
  const pyramids = FACES.map(([a, b, c]) => {
    const base = [VERTICES[a], VERTICES[b], VERTICES[c]].map(rotate) as Vec3[];
    const apex = scale(normalise(centroid(base)), SPIKE);
    const sides: Side[] = [0, 1, 2].map((i) => {
      const tri = [base[i], base[(i + 1) % 3], apex];
      return {
        tri,
        depth: centroid(tri)[2],
        lambert: (() => {
          const n = faceNormal(tri);
          return Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
        })(),
      };
    });
    return { apex, base, sides };
  });

  // The pyramid pointing most directly at the viewer becomes the opening.
  const front = pyramids.reduce((best, p) => (p.apex[2] > best.apex[2] ? p : best));

  const facets = pyramids
    .filter((p) => p !== front)
    .flatMap((p) => p.sides)
    // Cull sides facing away. Per-side, not per-pyramid: on a pyramid at the
    // ball's edge one side faces the viewer while another faces away.
    .filter((side) => faceNormal(side.tri)[2] > 0)
    // SVG has no z-buffer, so document order is paint order.
    .sort((a, b) => a.depth - b.depth)
    .map((side) => ({
      points: side.tri.map(project).map(([x, y]) => `${x},${y}`).join(' '),
      // Gamma below 1 lifts the midtones; without it most sides crush to the
      // shadow end and the ball looks grubby rather than folded.
      fill: fill(Math.pow(side.lambert, 0.8)),
    }));

  // The hole is the exact triangle the removed pyramid stood on, not a circle
  // approximating it — a circle left a visible mismatch against the straight
  // edges of the panels around it.
  const middle = centroid(front.base);
  const toPoints = (shrink: number) =>
    front.base
      .map((v) => project([
        middle[0] + (v[0] - middle[0]) * shrink,
        middle[1] + (v[1] - middle[1]) * shrink,
        middle[2] + (v[2] - middle[2]) * shrink,
      ] as Vec3))
      .map(([x, y]) => `${x},${y}`)
      .join(' ');

  return { facets, opening: { points: toPoints(1), innerPoints: toPoints(0.55) } };
}
