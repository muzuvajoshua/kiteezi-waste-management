// @vitest-environment jsdom
import '@/test-support/component-testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ok, err, type Result } from '@/shared/application/result';
import { appError, type AppError } from '@/shared/application/app-error';
import type { Report } from '@/modules/reports/domain/report';
import { SupervisorInboxView, type SupervisorInboxViewProps } from './SupervisorInboxView';

// KWM-032 — the supervisor's triage queue.
//
// Same shape as MyReportsView: the loaded Result comes in as a prop, and the
// review call comes in as a function, so every state is reachable from a
// plain input and nothing here talks to a server action.
//
// The rules worth protecting are about not destroying work by accident:
// rejecting must be impossible without a reason, and the selection must not
// silently carry over to a batch the supervisor did not intend.

function report(overrides: Partial<Report> = {}): Report {
  return {
    id: 1,
    userId: 7,
    location: 'Kiteezi, Zone 3',
    wasteType: 'plastic',
    amount: '4',
    imageUrl: null,
    verificationResult: null,
    status: 'pending',
    createdAt: new Date('2026-08-20T09:30:00Z'),
    collectorId: null,
    reviewReason: null,
    ...overrides,
  };
}

// Typed as the prop itself rather than a bare Mock, so a signature change
// on SupervisorInboxView is a compile error here instead of a silent any.
let onReview: SupervisorInboxViewProps['onReview'] & ReturnType<typeof vi.fn>;

beforeEach(() => {
  onReview = vi.fn(async () => ok([] as Report[]));
});

function renderInbox(reports: Report[] = [report()]) {
  return render(<SupervisorInboxView result={ok(reports)} onReview={onReview} />);
}

const checkboxFor = (id: number) => screen.getByRole('checkbox', { name: new RegExp(`report ${id}`, 'i') });

describe('SupervisorInboxView', () => {
  describe('loading states', () => {
    it('lists each pending report', () => {
      renderInbox([
        report({ id: 1, location: 'Zone 3' }),
        report({ id: 2, location: 'Zone 7' }),
      ]);

      expect(screen.getByText('Zone 3')).toBeInTheDocument();
      expect(screen.getByText('Zone 7')).toBeInTheDocument();
    });

    it('says the queue is clear when there is nothing pending', () => {
      renderInbox([]);

      expect(screen.getByText(/nothing pending/i)).toBeInTheDocument();
    });

    it('reports a failure to load rather than an empty queue', () => {
      // An empty list and a failed query must never look the same: one means
      // "no work", the other means "we don't know".
      render(
        <SupervisorInboxView
          result={err(appError('UNEXPECTED', 'Database unavailable'))}
          onReview={onReview}
        />
      );

      expect(screen.getByRole('alert')).toHaveTextContent(/could not load/i);
      expect(screen.queryByText(/nothing pending/i)).not.toBeInTheDocument();
    });
  });

  describe('selection', () => {
    it('disables both decisions until something is selected', () => {
      renderInbox();

      expect(screen.getByRole('button', { name: /approve/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /reject/i })).toBeDisabled();
    });

    it('enables approving once a report is selected', async () => {
      renderInbox();

      await userEvent.click(checkboxFor(1));

      expect(screen.getByRole('button', { name: /approve/i })).toBeEnabled();
    });

    it('selects and clears every report with the header checkbox', async () => {
      renderInbox([report({ id: 1 }), report({ id: 2 })]);

      await userEvent.click(screen.getByRole('checkbox', { name: /select all/i }));
      expect(checkboxFor(1)).toBeChecked();
      expect(checkboxFor(2)).toBeChecked();

      await userEvent.click(screen.getByRole('checkbox', { name: /select all/i }));
      expect(checkboxFor(1)).not.toBeChecked();
    });

    it('shows how many are selected', async () => {
      renderInbox([report({ id: 1 }), report({ id: 2 })]);

      await userEvent.click(checkboxFor(1));
      await userEvent.click(checkboxFor(2));

      expect(screen.getByText(/2 selected/i)).toBeInTheDocument();
    });
  });

  describe('approving', () => {
    it('sends the selected ids and the decision', async () => {
      renderInbox([report({ id: 4 }), report({ id: 9 })]);
      await userEvent.click(checkboxFor(9));

      await userEvent.click(screen.getByRole('button', { name: /approve/i }));

      expect(onReview).toHaveBeenCalledWith([9], 'approved', undefined);
    });

    it('sends only the selected reports', async () => {
      renderInbox([report({ id: 4 }), report({ id: 9 })]);
      await userEvent.click(checkboxFor(4));

      await userEvent.click(screen.getByRole('button', { name: /approve/i }));

      expect(onReview).toHaveBeenCalledWith([4], 'approved', undefined);
    });
  });

  describe('rejecting', () => {
    it('does not submit without a reason', async () => {
      // The domain refuses this too, but a supervisor should be told before a
      // round trip, not after.
      renderInbox();
      await userEvent.click(checkboxFor(1));

      await userEvent.click(screen.getByRole('button', { name: /reject/i }));

      expect(onReview).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent(/reason/i);
    });

    it('does not accept a whitespace-only reason', async () => {
      renderInbox();
      await userEvent.click(checkboxFor(1));
      await userEvent.type(screen.getByLabelText(/reason/i), '   ');

      await userEvent.click(screen.getByRole('button', { name: /reject/i }));

      expect(onReview).not.toHaveBeenCalled();
    });

    it('sends the trimmed reason once one is given', async () => {
      renderInbox();
      await userEvent.click(checkboxFor(1));
      await userEvent.type(screen.getByLabelText(/reason/i), '  Photo is unclear  ');

      await userEvent.click(screen.getByRole('button', { name: /reject/i }));

      expect(onReview).toHaveBeenCalledWith([1], 'rejected', 'Photo is unclear');
    });

    it('does not require a reason to approve', async () => {
      renderInbox();
      await userEvent.click(checkboxFor(1));

      await userEvent.click(screen.getByRole('button', { name: /approve/i }));

      expect(onReview).toHaveBeenCalled();
    });
  });

  describe('after a review', () => {
    it('reports how many were reviewed', async () => {
      onReview = vi.fn(async () => ok([report({ id: 1, status: 'approved' })]));
      renderInbox();
      await userEvent.click(checkboxFor(1));

      await userEvent.click(screen.getByRole('button', { name: /approve/i }));

      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/1 report/i));
    });

    it('says so when fewer changed than were selected', async () => {
      // Another supervisor got there first. Claiming both were reviewed would
      // be a lie the supervisor acts on.
      onReview = vi.fn(async () => ok([report({ id: 1, status: 'approved' })]));
      render(
        <SupervisorInboxView
          result={ok([report({ id: 1 }), report({ id: 2 })])}
          onReview={onReview}
        />
      );
      await userEvent.click(screen.getByRole('checkbox', { name: /select all/i }));

      await userEvent.click(screen.getByRole('button', { name: /approve/i }));

      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(/1 of 2|already/i)
      );
    });

    it('clears the selection so the next batch starts clean', async () => {
      // Leaving it selected is how a supervisor rejects a report twice, or
      // approves one they had already dealt with.
      onReview = vi.fn(async () => ok([report({ id: 1, status: 'approved' })]));
      renderInbox();
      await userEvent.click(checkboxFor(1));

      await userEvent.click(screen.getByRole('button', { name: /approve/i }));

      await waitFor(() => expect(screen.getByRole('button', { name: /approve/i })).toBeDisabled());
    });

    it('clears the reason so it cannot leak into the next batch', async () => {
      onReview = vi.fn(async () => ok([report({ id: 1, status: 'rejected' })]));
      renderInbox();
      await userEvent.click(checkboxFor(1));
      await userEvent.type(screen.getByLabelText(/reason/i), 'Photo is unclear');

      await userEvent.click(screen.getByRole('button', { name: /reject/i }));

      await waitFor(() => expect(screen.getByLabelText(/reason/i)).toHaveValue(''));
    });

    it('surfaces a failure and keeps the selection', async () => {
      // The work was not done, so the supervisor must not have to re-tick
      // everything to retry.
      onReview = vi.fn(async () => err(appError('UNEXPECTED', 'Database unavailable')));
      renderInbox();
      await userEvent.click(checkboxFor(1));

      await userEvent.click(screen.getByRole('button', { name: /approve/i }));

      await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
      expect(checkboxFor(1)).toBeChecked();
    });

    it('does not leak the underlying fault message', async () => {
      // actionErrorMessage replaces UNEXPECTED with a generic line on purpose:
      // a raw fault can carry a connection string, credentials or SQL. Going
      // through it rather than rendering error.message is what keeps that true
      // here.
      onReview = vi.fn(async () =>
        err(appError('UNEXPECTED', 'postgres://user:pw@host/db timed out'))
      );
      renderInbox();
      await userEvent.click(checkboxFor(1));

      await userEvent.click(screen.getByRole('button', { name: /approve/i }));

      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(/something went wrong/i)
      );
      expect(screen.getByRole('alert')).not.toHaveTextContent(/postgres:/i);
    });

    it('reports a refusal in words the supervisor can act on', async () => {
      // VALIDATION and RATE_LIMITED pass through, unlike UNEXPECTED — the
      // specific part is the actionable part.
      onReview = vi.fn(async () =>
        err(appError('VALIDATION', 'The same report was selected more than once'))
      );
      renderInbox();
      await userEvent.click(checkboxFor(1));

      await userEvent.click(screen.getByRole('button', { name: /approve/i }));

      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(/selected more than once/i)
      );
    });
  });

  describe('while submitting', () => {
    it('disables the decisions so a batch cannot be sent twice', async () => {
      let release: (v: Result<Report[], AppError>) => void = () => {};
      onReview = vi.fn(
        () => new Promise<Result<Report[], AppError>>((resolve) => { release = resolve; })
      );
      renderInbox();
      await userEvent.click(checkboxFor(1));

      await userEvent.click(screen.getByRole('button', { name: /approve/i }));

      await waitFor(() => expect(screen.getByRole('button', { name: /approve/i })).toBeDisabled());
      release(ok([]));
    });
  });

  describe('filtering', () => {
    it('narrows the queue by waste type', async () => {
      renderInbox([
        report({ id: 1, wasteType: 'plastic', location: 'Zone 3' }),
        report({ id: 2, wasteType: 'organic', location: 'Zone 7' }),
      ]);

      await userEvent.selectOptions(screen.getByLabelText(/waste type/i), 'organic');

      expect(screen.queryByText('Zone 3')).not.toBeInTheDocument();
      expect(screen.getByText('Zone 7')).toBeInTheDocument();
    });

    it('narrows the queue by location text', async () => {
      renderInbox([
        report({ id: 1, location: 'Kiteezi Zone 3' }),
        report({ id: 2, location: 'Bwaise Zone 7' }),
      ]);

      await userEvent.type(screen.getByLabelText(/location/i), 'bwaise');

      expect(screen.queryByText('Kiteezi Zone 3')).not.toBeInTheDocument();
      expect(screen.getByText('Bwaise Zone 7')).toBeInTheDocument();
    });

    it('drops a hidden report from the selection', async () => {
      // Otherwise a supervisor selects everything, filters, and approves
      // reports they can no longer see.
      renderInbox([
        report({ id: 1, wasteType: 'plastic' }),
        report({ id: 2, wasteType: 'organic' }),
      ]);
      await userEvent.click(screen.getByRole('checkbox', { name: /select all/i }));

      await userEvent.selectOptions(screen.getByLabelText(/waste type/i), 'organic');
      await userEvent.click(screen.getByRole('button', { name: /approve/i }));

      expect(onReview).toHaveBeenCalledWith([2], 'approved', undefined);
    });

    it('says when a filter hides everything', async () => {
      renderInbox([report({ id: 1, wasteType: 'plastic' })]);

      await userEvent.selectOptions(screen.getByLabelText(/waste type/i), 'organic');

      expect(screen.getByText(/no pending reports match/i)).toBeInTheDocument();
    });
  });
});
