// @vitest-environment jsdom
import '@/test-support/component-testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ok, err } from '@/shared/application/result';
import { appError } from '@/shared/application/app-error';
import { EmailPasswordForm } from './EmailPasswordForm';

// The email/password form. Server actions are mocked at the module boundary
// (a "use server" module cannot execute in jsdom); everything the component
// itself owns is exercised for real.

const registerWithEmailPassword = vi.hoisted(() => vi.fn());
const signInWithEmailPassword = vi.hoisted(() => vi.fn());

vi.mock('@/modules/auth/presentation/password.actions', () => ({
  registerWithEmailPassword,
  signInWithEmailPassword,
}));

const signedInUser = { id: 1, email: 'citizen@example.com', name: 'Citizen' };

beforeEach(() => {
  registerWithEmailPassword.mockReset();
  signInWithEmailPassword.mockReset();
  registerWithEmailPassword.mockResolvedValue(ok(signedInUser));
  signInWithEmailPassword.mockResolvedValue(ok(signedInUser));
});

type User = ReturnType<typeof userEvent.setup>;

async function fill(user: User, email = 'citizen@example.com', password = 'correct horse battery staple') {
  await user.clear(screen.getByLabelText(/email/i));
  await user.type(screen.getByLabelText(/email/i), email);
  await user.clear(screen.getByLabelText(/^password/i));
  await user.type(screen.getByLabelText(/^password/i), password);
}

function submit(user: User, name: RegExp) {
  return user.click(screen.getByRole('button', { name }));
}

describe('EmailPasswordForm', () => {
  describe('signing in', () => {
    it('calls signInWithEmailPassword with what was entered', async () => {
      const user = userEvent.setup();
      render(<EmailPasswordForm />);

      await fill(user);
      await submit(user, /^sign in$/i);

      expect(signInWithEmailPassword).toHaveBeenCalledWith(
        'citizen@example.com',
        'correct horse battery staple'
      );
    });

    it('does not send a name when signing in', async () => {
      const user = userEvent.setup();
      render(<EmailPasswordForm />);

      await fill(user);
      await submit(user, /^sign in$/i);

      expect(signInWithEmailPassword.mock.calls[0]).toHaveLength(2);
    });

    it('reports success to the caller', async () => {
      const user = userEvent.setup();
      const onAuthenticated = vi.fn();
      render(<EmailPasswordForm onAuthenticated={onAuthenticated} />);

      await fill(user);
      await submit(user, /^sign in$/i);

      await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith(signedInUser));
    });

    it('offers no name field in sign-in mode', () => {
      render(<EmailPasswordForm />);

      expect(screen.queryByLabelText(/your name/i)).not.toBeInTheDocument();
    });
  });

  describe('registering', () => {
    it('switches to registration and calls the register action', async () => {
      const user = userEvent.setup();
      render(<EmailPasswordForm />);

      await user.click(screen.getByRole('button', { name: /create one/i }));
      await fill(user);
      await user.type(screen.getByLabelText(/your name/i), 'New Citizen');
      await submit(user, /^create account$/i);

      expect(registerWithEmailPassword).toHaveBeenCalledWith(
        'citizen@example.com',
        'correct horse battery staple',
        'New Citizen'
      );
      expect(signInWithEmailPassword).not.toHaveBeenCalled();
    });

    it('sends undefined rather than an empty string for an omitted name', async () => {
      const user = userEvent.setup();
      render(<EmailPasswordForm />);

      await user.click(screen.getByRole('button', { name: /create one/i }));
      await fill(user);
      await submit(user, /^create account$/i);

      expect(registerWithEmailPassword.mock.calls[0][2]).toBeUndefined();
    });

    it('can switch back to signing in', async () => {
      const user = userEvent.setup();
      render(<EmailPasswordForm />);
      await user.click(screen.getByRole('button', { name: /create one/i }));

      await user.click(screen.getByRole('button', { name: /sign in instead/i }));

      expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
      expect(screen.queryByLabelText(/your name/i)).not.toBeInTheDocument();
    });

    it('clears a previous error when switching mode', async () => {
      // Otherwise "Incorrect email address or password" lingers over the
      // registration form, where it makes no sense.
      const user = userEvent.setup();
      signInWithEmailPassword.mockResolvedValue(
        err(appError('UNAUTHENTICATED', 'Incorrect email address or password.'))
      );
      render(<EmailPasswordForm />);
      await fill(user);
      await submit(user, /^sign in$/i);
      await screen.findByRole('alert');

      await user.click(screen.getByRole('button', { name: /create one/i }));

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('while submitting', () => {
    it('disables the button and says so', async () => {
      const user = userEvent.setup();
      let release: (value: unknown) => void = () => {};
      signInWithEmailPassword.mockReturnValue(new Promise((resolve) => (release = resolve)));
      render(<EmailPasswordForm />);

      await fill(user);
      await submit(user, /^sign in$/i);

      expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
      release(ok(signedInUser));
      await waitFor(() => expect(screen.queryByText(/signing in/i)).not.toBeInTheDocument());
    });

    it('does not submit twice', async () => {
      const user = userEvent.setup();
      let release: (value: unknown) => void = () => {};
      signInWithEmailPassword.mockReturnValue(new Promise((resolve) => (release = resolve)));
      render(<EmailPasswordForm />);

      await fill(user);
      const button = screen.getByRole('button', { name: /^sign in$/i });
      await user.click(button);
      await user.click(button);

      expect(signInWithEmailPassword).toHaveBeenCalledTimes(1);
      release(ok(signedInUser));
      await waitFor(() => expect(signInWithEmailPassword).toHaveBeenCalledTimes(1));
    });
  });

  describe('when it fails', () => {
    it('shows the server message in an alert', async () => {
      const user = userEvent.setup();
      signInWithEmailPassword.mockResolvedValue(
        err(appError('UNAUTHENTICATED', 'Incorrect email address or password.'))
      );
      render(<EmailPasswordForm />);

      await fill(user);
      await submit(user, /^sign in$/i);

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Incorrect email address or password.'
      );
    });

    it('shows the conflict message when the address is taken', async () => {
      const user = userEvent.setup();
      registerWithEmailPassword.mockResolvedValue(
        err(appError('CONFLICT', 'An account already exists for this email address.'))
      );
      render(<EmailPasswordForm />);

      await user.click(screen.getByRole('button', { name: /create one/i }));
      await fill(user);
      await submit(user, /^create account$/i);

      expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/i);
    });

    it('shows the weak-password message from the domain', async () => {
      const user = userEvent.setup();
      registerWithEmailPassword.mockResolvedValue(
        err({
          code: 'VALIDATION',
          message: 'Password must be at least 8 characters.',
          domainCode: 'WEAK_PASSWORD',
        })
      );
      render(<EmailPasswordForm />);

      await user.click(screen.getByRole('button', { name: /create one/i }));
      await fill(user, 'citizen@example.com', 'short');
      await submit(user, /^create account$/i);

      expect(await screen.findByRole('alert')).toHaveTextContent(/at least 8 characters/i);
    });

    it('never shows raw fault text for an unexpected error', async () => {
      const user = userEvent.setup();
      signInWithEmailPassword.mockResolvedValue(
        err({ code: 'UNEXPECTED', message: 'ECONNREFUSED password=hunter2' })
      );
      render(<EmailPasswordForm />);

      await fill(user);
      await submit(user, /^sign in$/i);

      const alert = await screen.findByRole('alert');
      expect(alert.textContent ?? '').not.toContain('hunter2');
    });

    it('keeps the email so the user can retry without retyping', async () => {
      const user = userEvent.setup();
      signInWithEmailPassword.mockResolvedValue(err(appError('UNAUTHENTICATED', 'Incorrect.')));
      render(<EmailPasswordForm />);

      await fill(user);
      await submit(user, /^sign in$/i);
      await screen.findByRole('alert');

      expect(screen.getByLabelText(/email/i)).toHaveValue('citizen@example.com');
    });

    it('clears the password field on failure', async () => {
      // A wrong password left in the box invites a blind resubmit, and on a
      // shared device it leaves the secret sitting on screen.
      const user = userEvent.setup();
      signInWithEmailPassword.mockResolvedValue(err(appError('UNAUTHENTICATED', 'Incorrect.')));
      render(<EmailPasswordForm />);

      await fill(user);
      await submit(user, /^sign in$/i);
      await screen.findByRole('alert');

      expect(screen.getByLabelText(/^password/i)).toHaveValue('');
    });

    it('re-enables the button so a retry is possible', async () => {
      const user = userEvent.setup();
      signInWithEmailPassword.mockResolvedValue(err(appError('UNAUTHENTICATED', 'Incorrect.')));
      render(<EmailPasswordForm />);

      await fill(user);
      await submit(user, /^sign in$/i);

      await waitFor(() =>
        expect(screen.getByRole('button', { name: /^sign in$/i })).toBeEnabled()
      );
    });

    it('does not report success to the caller', async () => {
      const user = userEvent.setup();
      const onAuthenticated = vi.fn();
      signInWithEmailPassword.mockResolvedValue(err(appError('UNAUTHENTICATED', 'Incorrect.')));
      render(<EmailPasswordForm onAuthenticated={onAuthenticated} />);

      await fill(user);
      await submit(user, /^sign in$/i);
      await screen.findByRole('alert');

      expect(onAuthenticated).not.toHaveBeenCalled();
    });
  });

  describe('accessibility and input hygiene', () => {
    it('labels every field', async () => {
      const user = userEvent.setup();
      render(<EmailPasswordForm />);

      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /create one/i }));
      expect(screen.getByLabelText(/your name/i)).toBeInTheDocument();
    });

    it('masks the password field', () => {
      render(<EmailPasswordForm />);

      expect(screen.getByLabelText(/^password/i)).toHaveAttribute('type', 'password');
    });

    it('marks email and password required', () => {
      render(<EmailPasswordForm />);

      expect(screen.getByLabelText(/email/i)).toBeRequired();
      expect(screen.getByLabelText(/^password/i)).toBeRequired();
    });

    it('tells the password manager which flow it is in', async () => {
      // Wrong autocomplete makes managers save the wrong thing, or offer a
      // saved password on a registration form.
      const user = userEvent.setup();
      render(<EmailPasswordForm />);

      expect(screen.getByLabelText(/^password/i)).toHaveAttribute(
        'autocomplete',
        'current-password'
      );

      await user.click(screen.getByRole('button', { name: /create one/i }));
      expect(screen.getByLabelText(/^password/i)).toHaveAttribute('autocomplete', 'new-password');
    });
  });
});
