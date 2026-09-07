import { describe, it, expect } from 'vitest';
import { BALL_RADIUS, OUTER_RADIUS, paperBall, type Facet } from './paper-ball-geometry';

// Testing invariants rather than a snapshot of the coordinates.
//
// Pinning the polygons would fail on any deliberate change to the view angle,
// the spike depth or the light — design decisions, not bugs — while passing on
// the failures that matter, like the star losing its points or the opening
// closing over.

const corners = (facet: Facet) =>
  facet.points.split(' ').map((pair) => pair.split(',').map(Number) as [number, number]);

const centroidOf = (points: readonly [number, number][]) => ({
  x: points.reduce((sum, [x]) => sum + x, 0) / points.length,
  y: points.reduce((sum, [, y]) => sum + y, 0) / points.length,
});

/** Ray casting. Used to prove the opening is genuinely uncovered. */
function contains(polygon: readonly [number, number][], [px, py]: [number, number]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const crosses = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

describe('paperBall', () => {
  const ball = paperBall();
  const facets = ball.facets;

  describe('the star', () => {
    it('shows a plausible number of pyramid sides', () => {
      // Nineteen pyramids of three sides each, less the ones facing away.
      // Far outside this band means the back-face cull is wrong — letting the
      // hidden half paint over the visible one, or culling most of the ball.
      expect(facets.length).toBeGreaterThan(15);
      expect(facets.length).toBeLessThan(45);
    });

    it('emits only triangles', () => {
      expect(facets.every((facet) => corners(facet).length === 3)).toBe(true);
    });

    it('actually has points on it', () => {
      // The test that separates a star from a ball. A plain geodesic sphere —
      // which is what the first version of this drew — has every vertex at
      // BALL_RADIUS. Stellating pushes each apex well beyond that, so
      // something has to reach past it or there are no spikes.
      const furthest = Math.max(...facets.flatMap(corners).map(([x, y]) => Math.hypot(x, y)));

      expect(furthest).toBeGreaterThan(BALL_RADIUS * 1.2);
    });

    it('keeps every corner inside its own outer radius', () => {
      const escaped = facets
        .flatMap(corners)
        .filter(([x, y]) => Math.hypot(x, y) > OUTER_RADIUS + 0.5);

      expect(escaped).toEqual([]);
    });

    it('fits inside the arrow triangle', () => {
      // Deliberately measured against a literal rather than OUTER_RADIUS.
      // Bounding the corners by the very constant under test is circular:
      // raising it raises the bound and the spikes burst through the arrows
      // unnoticed. Found by mutation on the previous version.
      //
      // RecycleBall draws the loop with a centre-to-vertex radius of 150, so
      // an equilateral triangle's inradius is half that.
      const ARROW_TRIANGLE_INRADIUS = 75;

      expect(OUTER_RADIUS).toBeLessThan(ARROW_TRIANGLE_INRADIUS);
    });

    it('gives each side a distinct polygon', () => {
      // The component keys on `points`, so duplicates would be a React key
      // collision as well as a wasted node.
      const all = facets.map((facet) => facet.points);

      expect(new Set(all).size).toBe(all.length);
    });
  });

  describe('the folds', () => {
    it('shades every side within the paper band', () => {
      const brightness = facets.map((facet) => parseInt(facet.fill.slice(1, 3), 16));

      expect(Math.min(...brightness)).toBeGreaterThanOrEqual(0x8f);
      expect(Math.max(...brightness)).toBeLessThanOrEqual(0xff);
    });

    it('uses many shades', () => {
      // Each side of a spike catches the light differently. If they collapsed
      // to one fill the ball would render as a flat blob — the shading is what
      // makes the points visible.
      expect(new Set(facets.map((facet) => facet.fill)).size).toBeGreaterThan(8);
    });

    it('lights the ball from the upper left', () => {
      // The one test that pins orientation — everything above still passes
      // with the ball flipped or the light behind it.
      //
      // Compared as halves rather than by finding the single brightest facet.
      // On a sphere a face's normal tracks its position, so the brightest
      // facet is reliably on the lit side; on a stellated solid the sides of
      // each spike tilt every which way, and the brightest one turned out to
      // sit just right of centre. The average is what actually encodes where
      // the light is.
      const meanBrightness = (subset: readonly Facet[]) =>
        subset.reduce((sum, facet) => sum + parseInt(facet.fill.slice(1, 3), 16), 0) /
        subset.length;

      const byX = (predicate: (x: number) => boolean) =>
        facets.filter((facet) => predicate(centroidOf(corners(facet)).x));
      const byY = (predicate: (y: number) => boolean) =>
        facets.filter((facet) => predicate(centroidOf(corners(facet)).y));

      expect(meanBrightness(byX((x) => x < 0))).toBeGreaterThan(meanBrightness(byX((x) => x > 0)));
      // y is SVG-down, so the upper half is the negative one.
      expect(meanBrightness(byY((y) => y < 0))).toBeGreaterThan(meanBrightness(byY((y) => y > 0)));
    });

    it('orders sides back to front', () => {
      // SVG has no z-index: document order is paint order, so a missing depth
      // sort lets far panels paint over near ones. Tested through a property
      // of the projection rather than by exposing depth — the nearest point of
      // a ball is the middle of its disc and the farthest visible faces are
      // out at the rim, so the last facet must sit nearer the middle than the
      // first.
      const distance = (facet: Facet) => {
        const middle = centroidOf(corners(facet));
        return Math.hypot(middle.x, middle.y);
      };

      expect(distance(facets[facets.length - 1])).toBeLessThan(distance(facets[0]));
    });
  });

  describe('the opening', () => {
    it('sits near the middle of the ball', () => {
      // It is the pyramid pointing most directly at the viewer, so it projects
      // close to the centre. Out at the rim would mean the wrong pyramid was
      // removed and the hole would read as a bite out of the edge.
      const middle = centroidOf(corners({ points: ball.opening.points, fill: '' }));

      expect(Math.hypot(middle.x, middle.y)).toBeLessThan(BALL_RADIUS * 0.5);
    });

    it('nests a smaller polygon inside for depth', () => {
      const spread = (points: string) => {
        const pts = corners({ points, fill: '' });
        const middle = centroidOf(pts);
        return Math.max(...pts.map(([x, y]) => Math.hypot(x - middle.x, y - middle.y)));
      };

      expect(spread(ball.opening.innerPoints)).toBeLessThan(spread(ball.opening.points));
    });

    it('is genuinely uncovered', () => {
      // The point of the whole thing: the middle has to be open, not merely
      // drawn dark and then painted over. If any facet covers the centre of
      // the hole then the front pyramid was not actually removed, or a facet
      // behind it is painting on top, and the affordance is a lie.
      const middle = centroidOf(corners({ points: ball.opening.points, fill: '' }));
      const covering = facets.filter((facet) => contains(corners(facet), [middle.x, middle.y]));

      expect(covering).toEqual([]);
    });
  });

  it('is deterministic', () => {
    // Called during render. A different ball each time would be a
    // server/client hydration mismatch.
    expect(paperBall()).toEqual(ball);
  });
});
