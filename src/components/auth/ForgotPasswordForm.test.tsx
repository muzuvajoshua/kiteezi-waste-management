// @vitest-environment jsdom
import '@/test-support/component-testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ok, err } from '@/shared/application/result';
import { appError } from '@/shared/application/app-error';
import { ForgotPasswordForm } from './ForgotPasswordForm';

const requestPasswordResetAction = vi.hoisted(() => vi.fn());

vi.mock('@/modules/auth/presentation/password-reset.actions', () => ({
  requestPasswordResetAction,
}));

beforeEach(() => {
  requestPasswordResetAction.mockReset();
  requestPasswordResetAction.mockResolvedValue(ok(undefined));
});

async function submit(user: ReturnType<typeof userEvent.setup>, email = 'citizen@example.com') {
  await user.type(screen.getByLabelText(/email/i), email);
  await user.click(screen.getByRole('button', { name: /send reset link/i }));
}

describe('ForgotPasswordForm', () => {
  it('sends the entered address', async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await submit(user);

    expect(requestPasswordResetAction).toHaveBeenCalledWith('citizen@example.com');
  });

  it('confirms without revealing whether the address is registered', async () => {
    // The confirmation must read the same for a real and an unknown address,
    // or the UI reintroduces the enumeration the use-case avoids.
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await submit(user, 'nobody@example.com');

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(/if .*account exists/i);
    expect(status.textContent ?? '').not.toMatch(/\bwe (sent|have sent)\b/i);
  });

  it('replaces the form with the confirmation, so it cannot be spammed by hammering', async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await submit(user);

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /send reset link/i })).not.toBeInTheDocument()
    );
  });

  it('disables the button while sending', async () => {
    const user = userEvent.setup();
    let release: (value: unknown) => void = () => {};
    requestPasswordResetAction.mockReturnValue(new Promise((resolve) => (release = resolve)));
    render(<ForgotPasswordForm />);

    await submit(user);

    expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled();
    release(ok(undefined));
  });

  it('does not submit twice', async () => {
    const user = userEvent.setup();
    let release: (value: unknown) => void = () => {};
    requestPasswordResetAction.mockReturnValue(new Promise((resolve) => (release = resolve)));
    render(<ForgotPasswordForm />);
    await user.type(screen.getByLabelText(/email/i), 'citizen@example.com');
    const button = screen.getByRole('button', { name: /send reset link/i });

    await user.click(button);
    await user.click(button);

    expect(requestPasswordResetAction).toHaveBeenCalledTimes(1);
    release(ok(undefined));
  });

  it('shows the wait when rate limited', async () => {
    const user = userEvent.setup();
    requestPasswordResetAction.mockResolvedValue(
      err(appError('RATE_LIMITED', 'Too many attempts. Please try again in 600 seconds.'))
    );
    render(<ForgotPasswordForm />);

    await submit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(/600 seconds/);
  });

  it('keeps the form usable after a failure', async () => {
    const user = userEvent.setup();
    requestPasswordResetAction.mockResolvedValue(err(appError('RATE_LIMITED', 'Slow down.')));
    render(<ForgotPasswordForm />);

    await submit(user);

    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeEnabled();
  });

  it('labels and requires the email field', () => {
    render(<ForgotPasswordForm />);

    const field = screen.getByLabelText(/email/i);
    expect(field).toBeRequired();
    expect(field).toHaveAttribute('type', 'email');
  });
});
