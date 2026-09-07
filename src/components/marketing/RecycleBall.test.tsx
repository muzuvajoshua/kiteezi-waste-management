// @vitest-environment jsdom
import '@/test-support/component-testing';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecycleBall } from './RecycleBall';

// Presentational: the parent owns whether the paper is unfolding and what
// happens next, so every state here is reachable by passing a boolean.

const svgOf = (container: HTMLElement) => {
  const svg = container.querySelector('svg');
  if (svg === null) throw new Error('no svg rendered');
  return svg;
};

describe('RecycleBall', () => {
  describe('the mark', () => {
    it('draws exactly three arrows', () => {
      // The recycling mark is three arrows. Two or four is a different symbol.
      const { container } = render(<RecycleBall />);

      expect(svgOf(container).querySelectorAll('polygon[fill="currentColor"]')).toHaveLength(3);
    });

    it('spaces the three arms evenly around the loop', () => {
      const { container } = render(<RecycleBall />);
      const arms = [...svgOf(container).querySelectorAll('g[transform^="rotate"]')];

      expect(arms.map((arm) => arm.getAttribute('transform'))).toEqual([
        'rotate(0 200 200)',
        'rotate(120 200 200)',
        'rotate(240 200 200)',
      ]);
    });

    it('draws each arm solid rather than dashed', () => {
      // An earlier version travelled a dash pattern along the arms, which is
      // what made the arrows dotted.
      const { container } = render(<RecycleBall />);

      expect([...svgOf(container).querySelectorAll('[stroke-dasharray]')]).toEqual([]);
    });

    it('lays a casing under each arm so crossings read as over and under', () => {
      // Solid green over solid green is invisible. Without the casing the
      // overlapping tips merge into one blob instead of one ribbon passing
      // over another.
      //
      // The colour comes from a custom property rather than being fixed,
      // because it has to match whatever the ball sits on. It was hardcoded
      // white, which was fine on a pale hero and became a bright sticker
      // outline the moment the hero turned dark green.
      // Asserted on the inline style, not the attribute: SVG presentation
      // attributes are not parsed as CSS, so `stroke="var(--x)"` is silently
      // ignored. That is exactly how the first fix shipped looking broken.
      const { container } = render(<RecycleBall />);
      const casings = [...svgOf(container).querySelectorAll<SVGPathElement>('path')].filter(
        (path) => path.style.stroke.includes('--ball-casing')
      );

      expect(casings).toHaveLength(3);
    });

    it('takes its colour from the surrounding text colour', () => {
      const { container } = render(<RecycleBall />);

      expect(svgOf(container).querySelector('path[stroke="currentColor"]')).not.toBeNull();
    });
  });

  describe('the ball', () => {
    it('renders the folded star after the arrows', () => {
      // SVG paints in document order and has no z-index, so the ball has to
      // come last or the arrows disappear behind it.
      //
      // Scoped to the ball's own group: a plain `polygon[fill^="#"]` also
      // matches the arrows' white casing heads, which sit before the ball, so
      // the first "facet" it found was an arrow and the assertion failed for
      // the wrong reason.
      const svg = svgOf(render(<RecycleBall />).container);
      const facets = svg.querySelectorAll('g[transform="translate(200 200)"] polygon');
      const lastHead = [...svg.querySelectorAll('polygon[fill="currentColor"]')].at(-1);

      expect(facets.length).toBeGreaterThan(15);
      expect(lastHead?.compareDocumentPosition(facets[0])).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    it('shows the opening in the middle', () => {
      // The affordance: two polygons, the darker nested inside the lighter.
      const svg = svgOf(render(<RecycleBall />).container);

      expect(svg.querySelector('polygon[fill="#6b6555"]')).not.toBeNull();
      expect(svg.querySelector('polygon[fill="#3d3931"]')).not.toBeNull();
    });
  });

  describe('as a control', () => {
    it('is a button, because it reveals a panel rather than navigating', () => {
      render(<RecycleBall />);

      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('says what it does', () => {
      // A control nobody can tell is a control is decoration.
      render(<RecycleBall />);

      expect(screen.getByText(/unfold to sign in/i)).toBeInTheDocument();
    });

    it('hides the graphic itself from assistive technology', () => {
      // The button carries the name; narrating the drawing too would be noise.
      const { container } = render(<RecycleBall />);

      expect(svgOf(container)).toHaveAttribute('aria-hidden', 'true');
    });

    it('reports whether the paper is open', () => {
      const { rerender } = render(<RecycleBall />);
      expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');

      rerender(<RecycleBall unfolding />);
      expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    });

    it('has a visible focus ring for keyboard use', () => {
      render(<RecycleBall />);

      expect(screen.getByRole('button').className).toContain('focus-visible:ring-2');
    });

    it('calls back when pressed', async () => {
      const onUnfold = vi.fn();
      render(<RecycleBall onUnfold={onUnfold} />);

      await userEvent.click(screen.getByRole('button'));

      expect(onUnfold).toHaveBeenCalledTimes(1);
    });

    it('is reachable by keyboard', async () => {
      // A <button> gets this for free, which is most of why it is one.
      const onUnfold = vi.fn();
      render(<RecycleBall onUnfold={onUnfold} />);

      await userEvent.tab();
      await userEvent.keyboard('{Enter}');

      expect(onUnfold).toHaveBeenCalled();
    });
  });

  describe('motion', () => {
    it('turns the loop and bobs the paper while idle', () => {
      const { container } = render(<RecycleBall />);

      expect(container.querySelector('.animate-loop-turn')).not.toBeNull();
      expect(container.querySelector('.animate-paper-bob')).not.toBeNull();
    });

    it('lets the idle motion go once unfolding', () => {
      // Otherwise the ball bobs while it is supposed to be flying apart.
      const { container } = render(<RecycleBall unfolding />);

      expect(container.querySelector('.animate-ball-unfold')).not.toBeNull();
      expect(container.querySelector('.animate-loop-open')).not.toBeNull();
      expect(container.querySelector('.animate-paper-bob')).toBeNull();
      expect(container.querySelector('.animate-loop-turn')).toBeNull();
    });

    it('carries the reduced-motion opt-out on both idle animations', () => {
      // jsdom cannot evaluate the media query, so this asserts the variant is
      // present rather than the resulting computed style.
      const { container } = render(<RecycleBall />);
      const idle = [
        container.querySelector('.animate-loop-turn'),
        container.querySelector('.animate-paper-bob'),
      ];

      expect(
        idle.every((el) => el?.getAttribute('class')?.includes('motion-reduce:animate-none'))
      ).toBe(true);
    });
  });

  it('passes its class through so the hero can size it', () => {
    render(<RecycleBall className="max-w-sm" />);

    expect(screen.getByRole('button')).toHaveClass('max-w-sm');
  });
});
