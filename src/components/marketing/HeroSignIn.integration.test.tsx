// @vitest-environment jsdom
import '@/test-support/component-testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HeroSignIn } from './HeroSignIn';

// The card with its REAL contents, not a stub.
//
// HeroSignIn.test.tsx mocks SignInPanel, which is right for testing the
// open/close behaviour — but it is also what let a crash ship. SignInPanel
// contains Google's button, which calls useGoogleAuth, and the marketing
// layout deliberately does not mount GoogleAuthProvider. Opening the card
// threw "useGoogleAuth must be used within a GoogleAuthProvider" and took the
// whole page down. Every unit test passed, because the component that throws
// had been replaced with a div.
//
// So this file mounts the real thing and mocks only what reaches out of the
// browser: the two server actions, and fetch.

vi.mock('@/modules/auth/presentation/password.actions', () => ({
  signInWithEmailPassword: vi.fn(),
  registerWithEmailPassword: vi.fn(),
}));

// SignInPanel sends a signed-in user to /my-reports, so it needs a router.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    // Reduced motion, so the card appears without waiting on a timer.
    value: (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });

  // GoogleAuthProvider fetches /api/auth/me on mount and loads Google's
  // script. Neither is reachable here; what matters is that mounting it does
  // not throw.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }))
  );
  window.history.replaceState(null, '', '/');
});

describe('the sign-in card, fully assembled', () => {
  it('opens without throwing', async () => {
    // The regression test. If the Google provider is missing above the panel,
    // rendering throws and this fails.
    render(<HeroSignIn />);

    await userEvent.click(screen.getByRole('button', { name: /unfold to sign in/i }));

    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
  });

  it('offers both ways in', async () => {
    // Everything /sign-in used to provide has to be here, or deleting that
    // page lost functionality rather than moving it.
    render(<HeroSignIn />);

    await userEvent.click(screen.getByRole('button', { name: /unfold to sign in/i }));

    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
  });

  it('keeps the way to recover a password', async () => {
    // /forgot-password moved out of the app shell for exactly this: it has to
    // be reachable by someone who cannot sign in.
    render(<HeroSignIn />);

    await userEvent.click(screen.getByRole('button', { name: /unfold to sign in/i }));

    expect(screen.getByRole('link', { name: /forgot your password/i })).toHaveAttribute(
      'href',
      '/forgot-password'
    );
  });

  it('keeps the way to register', async () => {
    render(<HeroSignIn />);

    await userEvent.click(screen.getByRole('button', { name: /unfold to sign in/i }));

    expect(screen.getByRole('button', { name: /create one/i })).toBeInTheDocument();
  });
});
