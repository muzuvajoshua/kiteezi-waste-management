// @vitest-environment jsdom
import '@/test-support/component-testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ok, err } from '@/shared/application/result';
import { appError } from '@/shared/application/app-error';
import type { Report } from '@/modules/reports/domain/report';
import { ReportForm } from './ReportForm';

// KWM-025 — the citizen submission form.
//
// The server action is mocked at the module boundary (it is the process
// boundary: a "use server" module cannot execute in jsdom). Everything the
// component itself owns — what it sends, what it disables, what it shows on
// each outcome — is exercised for real.

const createReport = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());

vi.mock('@/modules/reports/presentation/report.actions', () => ({ createReport }));
vi.mock('react-hot-toast', () => ({ default: { error: toastError, success: vi.fn() } }));

const savedReport: Report = {
  id: 1,
  userId: 7,
  location: 'Kiteezi, Zone 3',
  wasteType: 'plastic',
  amount: '4',
  imageUrl: null,
  verificationResult: null,
  status: 'pending',
  createdAt: new Date('2026-08-26T10:00:00Z'),
  collectorId: null,
};

beforeEach(() => {
  createReport.mockReset();
  toastError.mockReset();
  createReport.mockResolvedValue(ok(savedReport));
});

async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  overrides: { location?: string; wasteType?: string; amount?: string; imageUrl?: string } = {}
) {
  await user.type(screen.getByLabelText(/location/i), overrides.location ?? 'Kiteezi, Zone 3');
  await user.selectOptions(screen.getByLabelText(/waste type/i), overrides.wasteType ?? 'plastic');
  await user.clear(screen.getByLabelText(/amount/i));
  await user.type(screen.getByLabelText(/amount/i), overrides.amount ?? '4');
  if (overrides.imageUrl) {
    await user.type(screen.getByLabelText(/photo url/i), overrides.imageUrl);
  }
}

function submit(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole('button', { name: /submit report/i }));
}

describe('ReportForm', () => {
  describe('submits what the user entered', () => {
    it('calls createReport with the entered values', async () => {
      const user = userEvent.setup();
      render(<ReportForm />);

      await fillForm(user);
      await submit(user);

      expect(createReport).toHaveBeenCalledWith('Kiteezi, Zone 3', 'plastic', '4', undefined);
    });

    it('passes the photo url through when one is given', async () => {
      const user = userEvent.setup();
      render(<ReportForm />);

      await fillForm(user, { imageUrl: 'https://example.com/waste.jpg' });
      await submit(user);

      expect(createReport).toHaveBeenCalledWith(
        'Kiteezi, Zone 3',
        'plastic',
        '4',
        'https://example.com/waste.jpg'
      );
    });

    it('sends undefined rather than an empty string for an omitted photo url', async () => {
      // The server schema rejects an empty string (min(1)) but accepts the
      // field being absent, so an untouched optional field must not be sent.
      const user = userEvent.setup();
      render(<ReportForm />);

      await fillForm(user);
      await submit(user);

      expect(createReport.mock.calls[0][3]).toBeUndefined();
    });

    it('trims surrounding whitespace from the location', async () => {
      const user = userEvent.setup();
      render(<ReportForm />);

      await fillForm(user, { location: '   Kiteezi, Zone 3   ' });
      await submit(user);

      expect(createReport.mock.calls[0][0]).toBe('Kiteezi, Zone 3');
    });

    it('offers every waste type the domain allows', async () => {
      render(<ReportForm />);

      const options = screen
        .getAllByRole('option')
        .map((option) => (option as HTMLOptionElement).value);

      expect(options).toEqual([
        'general',
        'plastic',
        'organic',
        'metal',
        'paper',
        'ewaste',
        'hazardous',
        'other',
      ]);
    });
  });

  describe('while the submission is in flight', () => {
    it('disables the submit button and says so', async () => {
      const user = userEvent.setup();
      let release: (value: unknown) => void = () => {};
      createReport.mockReturnValue(new Promise((resolve) => (release = resolve)));
      render(<ReportForm />);

      await fillForm(user);
      await submit(user);

      expect(screen.getByRole('button', { name: /submitting/i })).toBeDisabled();

      release(ok(savedReport));
      await waitFor(() => expect(screen.queryByText(/submitting/i)).not.toBeInTheDocument());
    });

    it('does not submit twice when the button is clicked again', async () => {
      const user = userEvent.setup();
      let release: (value: unknown) => void = () => {};
      createReport.mockReturnValue(new Promise((resolve) => (release = resolve)));
      render(<ReportForm />);

      await fillForm(user);
      // Held by reference rather than re-queried: the accessible name changes
      // to "Submitting…" on the first click, which is itself the guard being
      // asserted here.
      const button = screen.getByRole('button', { name: /submit report/i });
      await user.click(button);
      await user.click(button);

      expect(createReport).toHaveBeenCalledTimes(1);

      release(ok(savedReport));
      await waitFor(() => expect(createReport).toHaveBeenCalledTimes(1));
    });
  });

  describe('on success', () => {
    it('confirms the report was submitted and the points earned', async () => {
      const user = userEvent.setup();
      render(<ReportForm />);

      await fillForm(user);
      await submit(user);

      expect(await screen.findByRole('status')).toHaveTextContent(/10 points/i);
    });

    it('clears the form so a second report starts empty', async () => {
      const user = userEvent.setup();
      render(<ReportForm />);

      await fillForm(user);
      await submit(user);

      await waitFor(() => expect(screen.getByLabelText(/location/i)).toHaveValue(''));
      expect(screen.getByLabelText(/amount/i)).toHaveValue(null);
    });
  });

  describe('on failure', () => {
    it('toasts the validation message from the server', async () => {
      const user = userEvent.setup();
      createReport.mockResolvedValue(
        err(appError('VALIDATION', 'amount: amount must be a positive number'))
      );
      render(<ReportForm />);

      await fillForm(user, { amount: '0' });
      await submit(user);

      await waitFor(() =>
        expect(toastError).toHaveBeenCalledWith('amount: amount must be a positive number')
      );
    });

    it('asks an unauthenticated user to sign in', async () => {
      const user = userEvent.setup();
      createReport.mockResolvedValue(err(appError('UNAUTHENTICATED', 'Not authenticated')));
      render(<ReportForm />);

      await fillForm(user);
      await submit(user);

      await waitFor(() =>
        expect(toastError).toHaveBeenCalledWith('Please sign in to continue.')
      );
    });

    it('never shows raw fault text for an unexpected error', async () => {
      const user = userEvent.setup();
      createReport.mockResolvedValue(
        err({ code: 'UNEXPECTED', message: 'ECONNREFUSED password=hunter2' })
      );
      render(<ReportForm />);

      await fillForm(user);
      await submit(user);

      await waitFor(() => expect(toastError).toHaveBeenCalled());
      expect(toastError.mock.calls[0][0]).not.toContain('hunter2');
    });

    it('keeps what the user typed so they can correct and retry', async () => {
      const user = userEvent.setup();
      createReport.mockResolvedValue(err(appError('VALIDATION', 'amount: must be positive')));
      render(<ReportForm />);

      await fillForm(user);
      await submit(user);

      await waitFor(() => expect(toastError).toHaveBeenCalled());
      expect(screen.getByLabelText(/location/i)).toHaveValue('Kiteezi, Zone 3');
    });

    it('re-enables the submit button so a retry is possible', async () => {
      const user = userEvent.setup();
      createReport.mockResolvedValue(err(appError('VALIDATION', 'bad')));
      render(<ReportForm />);

      await fillForm(user);
      await submit(user);

      await waitFor(() =>
        expect(screen.getByRole('button', { name: /submit report/i })).toBeEnabled()
      );
    });

    it('shows no success confirmation', async () => {
      const user = userEvent.setup();
      createReport.mockResolvedValue(err(appError('VALIDATION', 'bad')));
      render(<ReportForm />);

      await fillForm(user);
      await submit(user);

      await waitFor(() => expect(toastError).toHaveBeenCalled());
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  describe('accessibility basics', () => {
    it('labels every field', () => {
      render(<ReportForm />);

      expect(screen.getByLabelText(/location/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/waste type/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/amount/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/photo url/i)).toBeInTheDocument();
    });

    it('marks the required fields as required', () => {
      render(<ReportForm />);

      expect(screen.getByLabelText(/location/i)).toBeRequired();
      expect(screen.getByLabelText(/amount/i)).toBeRequired();
      expect(screen.getByLabelText(/photo url/i)).not.toBeRequired();
    });
  });
});
