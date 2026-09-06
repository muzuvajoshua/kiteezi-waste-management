import { describe, it, expect } from 'vitest';
import { BALL_RADIUS, paperBallFacets } from './paper-ball-geometry';

// Testing invariants rather than a snapshot of the coordinates.
//
// Pinning the 39 exact polygons would fail on any deliberate change to the
// view angle or the light, which is a design decision rather than a bug — and
// it would pass on the failures that actually matter, like a facet turning
// black or escaping the ball. What follows is what has to hold for the thing
// to look like a folded ball at all.

const points = (facet: { points: string }) =>
  facet.points.split(' ').map((pair) => pair.split(',').map(Number) as [number, number]);

describe('paperBallFacets', () => {
  const facets = paperBallFacets();

  it('shows roughly half of the sphere', () => {
    // A level-1 geodesic sphere has 80 faces and the solid is convex, so about
    // half face the viewer. Far outside this band means the back-face cull is
    // wrong — letting the hidden hemisphere paint over the visible one, or
    // culling most of the ball away.
    expect(facets.length).toBeGreaterThan(30);
    expect(facets.length).toBeLessThan(50);
  });

  it('emits only triangles', () => {
    // Folded panels. A facet with two or four corners is a subdivision bug.
    expect(facets.every((facet) => points(facet).length === 3)).toBe(true);
  });

  it('keeps every corner inside the ball', () => {
    // Shape: nothing projects outside the sphere it was built from. A facet
    // past the radius means the projection or the scaling is wrong.
    const escaped = facets.flatMap(points).filter(([x, y]) => Math.hypot(x, y) > BALL_RADIUS + 0.5);

    expect(escaped).toEqual([]);
  });

  it('fits inside the arrow triangle', () => {
    // Size, which is a separate question from shape — and deliberately
    // measured against a literal rather than BALL_RADIUS. Bounding the corners
    // by the very constant under test is circular: doubling BALL_RADIUS
    // doubles the bound and the check passes while the ball bursts through the
    // arrows. Found by mutation.
    //
    // RecycleBall draws the loop with a centre-to-vertex radius of 150, so an
    // equilateral triangle's inradius is half that.
    const ARROW_TRIANGLE_INRADIUS = 75;

    expect(BALL_RADIUS).toBeLessThan(ARROW_TRIANGLE_INRADIUS);
  });

  it('orders facets back to front', () => {
    // SVG has no z-index: document order is paint order, so a missing depth
    // sort lets far panels paint over near ones. Tested through a property of
    // a projected sphere rather than by exposing depth — the nearest point of
    // a sphere is the centre of its disc, and the farthest visible faces are
    // out at the rim. So the last facet must sit nearer the middle than the
    // first.
    const distanceFromCentre = (facet: { points: string }) => {
      const corners = points(facet);
      const cx = corners.reduce((sum, [x]) => sum + x, 0) / corners.length;
      const cy = corners.reduce((sum, [, y]) => sum + y, 0) / corners.length;
      return Math.hypot(cx, cy);
    };

    expect(distanceFromCentre(facets[facets.length - 1])).toBeLessThan(
      distanceFromCentre(facets[0])
    );
  });

  it('shades every facet within the paper band', () => {
    // Paper, not plastic and not a gemstone. A fill outside this range means
    // the lighting maths produced something that will read as a hole (too
    // dark) or a blowout (pure white).
    const brightness = facets.map((facet) => parseInt(facet.fill.slice(1, 3), 16));

    expect(Math.min(...brightness)).toBeGreaterThanOrEqual(0xc4);
    expect(Math.max(...brightness)).toBeLessThanOrEqual(0xff);
  });

  it('uses more than one shade', () => {
    // If every facet resolved to the same fill the ball would render as a flat
    // disc — the folds are the whole point, and they are made of shading.
    expect(new Set(facets.map((facet) => facet.fill)).size).toBeGreaterThan(8);
  });

  it('lights the ball from the upper left', () => {
    // The one test that pins orientation. Everything above would still pass
    // with the ball flipped vertically or the light behind it — the facets
    // would be triangles, inside the radius, and variously shaded — but it
    // would no longer read as a lit object. The brightest panel has to sit
    // where the light is.
    const brightest = facets.reduce((best, facet) =>
      parseInt(facet.fill.slice(1, 3), 16) > parseInt(best.fill.slice(1, 3), 16) ? facet : best
    );
    const corners = points(brightest);
    const centroid = {
      x: corners.reduce((sum, [x]) => sum + x, 0) / corners.length,
      y: corners.reduce((sum, [, y]) => sum + y, 0) / corners.length,
    };

    expect(centroid.x).toBeLessThan(0); // left of centre
    expect(centroid.y).toBeLessThan(0); // above centre, y being SVG-down
  });

  it('is deterministic', () => {
    // Called during render. A function that returned a different ball each
    // time would produce a server/client hydration mismatch.
    expect(paperBallFacets()).toEqual(facets);
  });

  it('gives each facet a distinct polygon', () => {
    // Duplicate point strings would mean two facets stacked exactly, which is
    // both a wasted node and a sign the subdivision emitted a degenerate
    // face. The component also keys on `points`, so duplicates would be a
    // React key collision.
    const all = facets.map((facet) => facet.points);

    expect(new Set(all).size).toBe(all.length);
  });
});
