// @vitest-environment jsdom
import '@/test-support/component-testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ok, err } from '@/shared/application/result';
import { appError } from '@/shared/application/app-error';
import { ResetPasswordForm } from './ResetPasswordForm';

const resetPasswordAction = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());

vi.mock('@/modules/auth/presentation/password-reset.actions', () => ({ resetPasswordAction }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

beforeEach(() => {
  resetPasswordAction.mockReset();
  push.mockReset();
  resetPasswordAction.mockResolvedValue(ok(undefined));
});

async function submit(user: ReturnType<typeof userEvent.setup>, password = 'a brand new password') {
  await user.type(screen.getByLabelText(/new password/i), password);
  await user.click(screen.getByRole('button', { name: /set new password/i }));
}

describe('ResetPasswordForm', () => {
  it('sends the token from the link with the new password', async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm token="tok-123" />);

    await submit(user);

    expect(resetPasswordAction).toHaveBeenCalledWith('tok-123', 'a brand new password');
  });

  it('never renders the token into the page', () => {
    // The token is a credential. Rendering it puts it on screen and into any
    // screenshot or screen-share.
    const { container } = render(<ResetPasswordForm token="tok-123" />);

    expect(container.textContent ?? '').not.toContain('tok-123');
  });

  it('refuses to show a form when the link carries no token', () => {
    render(<ResetPasswordForm token="" />);

    expect(screen.getByRole('alert')).toHaveTextContent(/incomplete/i);
    expect(screen.queryByLabelText(/new password/i)).not.toBeInTheDocument();
  });

  it('sends the user to sign in after a successful reset', async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm token="tok-123" />);

    await submit(user);

    await waitFor(() => expect(push).toHaveBeenCalledWith('/sign-in'));
  });

  it('shows the weak-password message from the domain', async () => {
    const user = userEvent.setup();
    resetPasswordAction.mockResolvedValue(
      err({
        code: 'VALIDATION',
        message: 'Password must be at least 8 characters.',
        domainCode: 'WEAK_PASSWORD',
      })
    );
    render(<ResetPasswordForm token="tok-123" />);

    await submit(user, 'short');

    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 8 characters/i);
  });

  it('explains an expired link rather than telling the user to sign in', async () => {
    // The use-case reports a bad token as UNAUTHENTICATED. Without the signIn
    // context the shared mapper would rewrite that to "Please sign in to
    // continue.", which is useless on a page they reached from an email.
    const user = userEvent.setup();
    resetPasswordAction.mockResolvedValue(
      err(
        appError(
          'UNAUTHENTICATED',
          'This reset link is invalid or has expired. Please request a new one.'
        )
      )
    );
    render(<ResetPasswordForm token="tok-123" />);

    await submit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid or has expired/i);
  });

  it('offers a route to a fresh link when one fails', async () => {
    const user = userEvent.setup();
    resetPasswordAction.mockResolvedValue(err(appError('UNAUTHENTICATED', 'expired')));
    render(<ResetPasswordForm token="tok-123" />);

    await submit(user);

    await screen.findByRole('alert');
    expect(screen.getByRole('link', { name: /request a new link/i })).toHaveAttribute(
      'href',
      '/forgot-password'
    );
  });

  it('clears the password field on failure', async () => {
    const user = userEvent.setup();
    resetPasswordAction.mockResolvedValue(err(appError('VALIDATION', 'too weak')));
    render(<ResetPasswordForm token="tok-123" />);

    await submit(user, 'short');

    await screen.findByRole('alert');
    expect(screen.getByLabelText(/new password/i)).toHaveValue('');
  });

  it('does not navigate when the reset failed', async () => {
    const user = userEvent.setup();
    resetPasswordAction.mockResolvedValue(err(appError('VALIDATION', 'too weak')));
    render(<ResetPasswordForm token="tok-123" />);

    await submit(user, 'short');

    await screen.findByRole('alert');
    expect(push).not.toHaveBeenCalled();
  });

  it('does not submit twice', async () => {
    const user = userEvent.setup();
    let release: (value: unknown) => void = () => {};
    resetPasswordAction.mockReturnValue(new Promise((resolve) => (release = resolve)));
    render(<ResetPasswordForm token="tok-123" />);
    await user.type(screen.getByLabelText(/new password/i), 'a brand new password');
    const button = screen.getByRole('button', { name: /set new password/i });

    await user.click(button);
    await user.click(button);

    expect(resetPasswordAction).toHaveBeenCalledTimes(1);
    release(ok(undefined));
  });

  it('tells the password manager this is a new password', () => {
    render(<ResetPasswordForm token="tok-123" />);

    expect(screen.getByLabelText(/new password/i)).toHaveAttribute('autocomplete', 'new-password');
  });
});
