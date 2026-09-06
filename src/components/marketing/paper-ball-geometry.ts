// The geometry of the folded-paper ball in the landing page hero.
//
// A kusudama — a sphere folded from flat triangular panels — is a level-1
// geodesic sphere: an icosahedron with every face split into four. This builds
// one, turns it away from the viewer's axis, projects it flat, discards the
// faces pointing away, and shades each remaining face by how squarely it meets
// the light. It reads as folded paper because that is what it is: flat panels
// meeting at angles.
//
// A pure function rather than 39 literal polygons pasted into the component.
// The first version of this was a build script whose output was copied in by
// hand, which meant the component held forty lines of arbitrary-looking
// decimals that nothing could verify and any edit would silently desynchronise
// from the script. Running the arithmetic is free — the page is static, so it
// happens once at build time.

const PHI = (1 + Math.sqrt(5)) / 2;

/** Radius in user units, measured in the SVG's own coordinate space. */
export const BALL_RADIUS = 70;

// Off-axis on both axes. A vertex pointed straight at the viewer produces a
// symmetric rosette that reads as a flat pattern rather than an object.
const ROTATE_X = 0.42;
const ROTATE_Y = 0.62;

// Upper-left, matching the way the reference photograph is lit.
const LIGHT = normalise([-0.45, 0.72, 0.65]);

// Paper, not plastic. A wider band reads as a cut gemstone; a narrower one and
// the folds melt into a smooth gradient.
const SHADOW = [0xc4, 0xbf, 0xb2] as const;
const HIGHLIGHT = [0xff, 0xfe, 0xfa] as const;

/** The colour of a fold. Without it the facets blur into one another. */
export const CREASE = '#b9b4a6';

type Vec3 = readonly [number, number, number];

export interface Facet {
  /** `points` for an SVG polygon, relative to the ball's centre. */
  readonly points: string;
  readonly fill: string;
}

function normalise([x, y, z]: Vec3): Vec3 {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}

function midpoint(a: Vec3, b: Vec3): Vec3 {
  return normalise([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
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

const ICOSAHEDRON_VERTICES: readonly Vec3[] = (
  [
    [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
    [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
    [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
  ] as Vec3[]
).map(normalise);

const ICOSAHEDRON_FACES: readonly (readonly [number, number, number])[] = [
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

/**
 * The facets facing the viewer, back to front.
 *
 * Sorted by depth so nearer panels paint over farther ones — SVG has no
 * z-buffer, so document order *is* the depth order.
 */
export function paperBallFacets(): Facet[] {
  const subdivided: Vec3[][] = [];
  for (const [a, b, c] of ICOSAHEDRON_FACES) {
    const va = ICOSAHEDRON_VERTICES[a];
    const vb = ICOSAHEDRON_VERTICES[b];
    const vc = ICOSAHEDRON_VERTICES[c];
    const ab = midpoint(va, vb);
    const bc = midpoint(vb, vc);
    const ca = midpoint(vc, va);
    subdivided.push([va, ab, ca], [ab, vb, bc], [ca, bc, vc], [ab, bc, ca]);
  }

  return subdivided
    .map((face) => face.map(rotate) as Vec3[])
    .map((face) => {
      // For a face of a sphere centred on the origin the centroid direction is
      // close enough to the surface normal, and cheaper than a cross product.
      const normal = normalise([
        (face[0][0] + face[1][0] + face[2][0]) / 3,
        (face[0][1] + face[1][1] + face[2][1]) / 3,
        (face[0][2] + face[1][2] + face[2][2]) / 3,
      ]);
      return {
        face,
        normal,
        depth: (face[0][2] + face[1][2] + face[2][2]) / 3,
        lambert: Math.max(0, normal[0] * LIGHT[0] + normal[1] * LIGHT[1] + normal[2] * LIGHT[2]),
      };
    })
    .filter(({ normal }) => normal[2] > 0.02)
    .sort((a, b) => a.depth - b.depth)
    .map(({ face, lambert }) => ({
      // SVG's y axis points down, so the projected y is negated.
      points: face
        .map(([x, y]) => `${round(x * BALL_RADIUS)},${round(-y * BALL_RADIUS)}`)
        .join(' '),
      // Gamma below 1 lifts the midtones. Without it most facets crush to the
      // shadow end and the ball looks grubby rather than folded.
      fill: fill(Math.pow(lambert, 0.85)),
    }));
}
