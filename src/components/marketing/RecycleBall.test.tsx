// @vitest-environment jsdom
import '@/test-support/component-testing';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { RecycleBall } from './RecycleBall';

// Queried through the container rather than by role: the whole graphic is
// aria-hidden, so nothing in it is reachable by an accessible query — which is
// itself one of the things asserted below.

function renderBall() {
  const { container } = render(<RecycleBall />);
  const svg = container.querySelector('svg');
  if (svg === null) throw new Error('no svg rendered');
  return svg;
}

describe('RecycleBall', () => {
  it('draws exactly three arrows', () => {
    // The recycling mark is three arrows. Two or four is a different symbol.
    const heads = renderBall().querySelectorAll('polygon[fill="currentColor"]');

    expect(heads).toHaveLength(3);
  });

  it('spaces the three arms evenly around the loop', () => {
    const arms = [...renderBall().querySelectorAll('g[transform^="rotate"]')];

    expect(arms.map((arm) => arm.getAttribute('transform'))).toEqual([
      'rotate(0 200 200)',
      'rotate(120 200 200)',
      'rotate(240 200 200)',
    ]);
  });

  it('offsets each arm\'s dashes so the three read as one loop', () => {
    // Identical delays would make all three arrows pulse in unison, which
    // looks like a blinking triangle rather than a turning loop.
    const delays = [...renderBall().querySelectorAll('line')].map(
      (line) => (line as SVGLineElement).style.animationDelay
    );

    expect(new Set(delays).size).toBe(3);
  });

  it('takes its colour from the surrounding text colour', () => {
    // `currentColor` is what lets the hero set the arrows with a text class
    // rather than this file hardcoding a brand hex.
    const svg = renderBall();

    expect(svg.querySelector('line')?.getAttribute('stroke')).toBe('currentColor');
    expect(svg.querySelector('polygon[fill="currentColor"]')).not.toBeNull();
  });

  it('is hidden from assistive technology', () => {
    // Decorative. The hero's headline already says what this says, and
    // narrating an abstract graphic adds noise rather than information.
    const svg = renderBall();

    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
  });

  it('stops moving when the viewer asks for reduced motion', () => {
    // Every animated element has to carry the opt-out. A `prefers-reduced-
    // motion` media query cannot be evaluated in jsdom, so this asserts the
    // variant is present rather than the resulting computed style.
    const svg = renderBall();
    const animated = [...svg.querySelectorAll('[class*="animate-"]')];

    expect(animated.length).toBeGreaterThan(0);
    expect(
      animated.every((el) => el.getAttribute('class')?.includes('motion-reduce:animate-none'))
    ).toBe(true);
  });

  it('renders the folded ball behind the arrows', () => {
    // SVG paints in document order and has no z-index, so the ball has to come
    // last or the arrows disappear behind it.
    const svg = renderBall();
    const facets = svg.querySelectorAll('polygon[fill^="#"]');
    const firstFacet = facets[0];
    const lastHead = [...svg.querySelectorAll('polygon[fill="currentColor"]')].at(-1);

    expect(facets.length).toBeGreaterThan(30);
    expect(lastHead?.compareDocumentPosition(firstFacet)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it('passes its class through so the hero can size it', () => {
    const { container } = render(<RecycleBall className="h-auto w-full" />);

    expect(container.querySelector('svg')).toHaveClass('h-auto', 'w-full');
  });
});
