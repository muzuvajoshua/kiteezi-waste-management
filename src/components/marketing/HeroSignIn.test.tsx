// @vitest-environment jsdom
import '@/test-support/component-testing';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HeroSignIn } from './HeroSignIn';

// The behaviour that moved off /sign-in when that page was deleted.
//
// SignInPanel is stubbed. It has its own tests, it pulls in Google's script
// loader and two server actions, and none of that is what this file is about —
// what matters here is that pressing the paper reveals it, that the header's
// `#sign-in` link reveals it too, and that closing puts the paper back.

vi.mock('@/components/auth/SignInPanel', () => ({
  SignInPanel: () => <div data-testid="sign-in-panel" />,
}));

const UNFOLD_MS = 520;

function setReducedMotion(reduce: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: reduce,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

function setHash(hash: string) {
  window.history.replaceState(null, '', hash === '' ? '/' : `/${hash}`);
}

beforeEach(() => {
  setReducedMotion(false);
  setHash('');
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

const press = async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  await user.click(screen.getByRole('button', { name: /unfold to sign in/i }));
};

// The unfold finishes on a setTimeout, and the state it sets lands outside
// React's act() unless the advance is wrapped — without this the card never
// appears and every timing test fails for a reason that has nothing to do with
// the component.
const finishUnfold = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(UNFOLD_MS);
  });
};

describe('HeroSignIn', () => {
  it('starts as the folded paper, with no sign-in card', () => {
    render(<HeroSignIn />);

    expect(screen.getByRole('button', { name: /unfold to sign in/i })).toBeInTheDocument();
    expect(screen.queryByTestId('sign-in-panel')).not.toBeInTheDocument();
  });

  describe('unfolding', () => {
    it('plays the unfold before the card arrives', async () => {
      render(<HeroSignIn />);

      await press();

      // Mid-flight: the paper is opening and the card has not replaced it yet.
      expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
      expect(screen.queryByTestId('sign-in-panel')).not.toBeInTheDocument();

      await finishUnfold();
      expect(screen.getByTestId('sign-in-panel')).toBeInTheDocument();
    });

    it('replaces the paper with the card', async () => {
      render(<HeroSignIn />);

      await press();
      await finishUnfold();

      expect(screen.queryByRole('button', { name: /unfold to sign in/i })).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    });

    it('shows the card at once when reduced motion is asked for', async () => {
      // Half a second of nothing visible is worse than no animation.
      setReducedMotion(true);
      render(<HeroSignIn />);

      await press();

      expect(screen.getByTestId('sign-in-panel')).toBeInTheDocument();
    });

    it('ignores a second press while already unfolding', async () => {
      // An impatient double-press must not queue a second reveal.
      render(<HeroSignIn />);

      await press();
      await press();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(UNFOLD_MS * 3);
      });

      expect(screen.getAllByTestId('sign-in-panel')).toHaveLength(1);
    });
  });

  describe('the #sign-in fragment', () => {
    it('opens the card when the page loads on it', () => {
      // How the header's Sign in link works — it is a plain anchor to
      // `/#sign-in`, so there is one mechanism rather than a second path
      // through a context or a custom event.
      setHash('#sign-in');
      setReducedMotion(true);

      render(<HeroSignIn />);

      expect(screen.getByTestId('sign-in-panel')).toBeInTheDocument();
    });

    it('opens the card when the fragment changes', () => {
      setReducedMotion(true);
      render(<HeroSignIn />);
      expect(screen.queryByTestId('sign-in-panel')).not.toBeInTheDocument();

      setHash('#sign-in');
      act(() => {
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      });

      expect(screen.getByTestId('sign-in-panel')).toBeInTheDocument();
    });

    it('leaves the paper alone for any other fragment', () => {
      setHash('#how-it-works');

      render(<HeroSignIn />);

      expect(screen.queryByTestId('sign-in-panel')).not.toBeInTheDocument();
    });

    it('keeps the anchor on the paper too, so the link always has a target', () => {
      // The fragment has to resolve whether the card is open or shut, or
      // clicking Sign in from another page scrolls nowhere.
      const { container } = render(<HeroSignIn />);

      expect(container.querySelector('#sign-in')).not.toBeNull();
    });
  });

  describe('closing', () => {
    it('puts the paper back', async () => {
      setReducedMotion(true);
      render(<HeroSignIn />);
      await press();

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.click(screen.getByRole('button', { name: /close sign in/i }));

      expect(screen.getByRole('button', { name: /unfold to sign in/i })).toBeInTheDocument();
      expect(screen.queryByTestId('sign-in-panel')).not.toBeInTheDocument();
    });

    it('clears the fragment so the card does not reopen on reload', async () => {
      // Without this the close button looks like it did nothing the next time
      // the page loads.
      setHash('#sign-in');
      setReducedMotion(true);
      render(<HeroSignIn />);

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.click(screen.getByRole('button', { name: /close sign in/i }));

      expect(window.location.hash).toBe('');
    });

    it('can be reopened after closing', async () => {
      setReducedMotion(true);
      render(<HeroSignIn />);
      await press();
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.click(screen.getByRole('button', { name: /close sign in/i }));

      await press();

      expect(screen.getByTestId('sign-in-panel')).toBeInTheDocument();
    });
  });
});
