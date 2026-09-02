// @vitest-environment jsdom
import '@/test-support/component-testing';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ok, err } from '@/shared/application/result';
import { appError } from '@/shared/application/app-error';
import type { Report, ReportStatus, WasteType } from '@/modules/reports/domain/report';
import { MyReportsView } from './MyReportsView';

// KWM-027 — the citizen's own report history.
//
// Takes the action's Result as a prop rather than fetching, so every state the
// page can be in is a plain input here: the /my-reports page is then a
// two-line server component that awaits the action and passes it straight in.

function report(overrides: Partial<Report> = {}): Report {
  return {
    id: 1,
    userId: 7,
    location: 'Kiteezi, Zone 3',
    wasteType: 'plastic' as WasteType,
    amount: '4',
    imageUrl: null,
    verificationResult: null,
    status: 'pending' as ReportStatus,
    createdAt: new Date('2026-08-20T09:30:00Z'),
    collectorId: null,
    reviewReason: null,
    ...overrides,
  };
}

describe('MyReportsView', () => {
  describe('with reports', () => {
    it('lists each report with its location, type, amount and status', () => {
      render(
        <MyReportsView
          result={ok([report({ id: 1, location: 'Zone 3', wasteType: 'plastic', amount: '4' })])}
        />
      );

      // Scoped to the row: the status filter's <option> list also contains
      // every status name, so a document-wide text query is ambiguous.
      const row = screen.getByRole('listitem');
      expect(row).toHaveTextContent('Zone 3');
      expect(row).toHaveTextContent(/plastic/i);
      expect(row).toHaveTextContent(/4 kg/i);
      expect(row).toHaveTextContent(/pending/i);
    });

    it('renders one row per report', () => {
      render(
        <MyReportsView
          result={ok([
            report({ id: 1, location: 'Zone 1' }),
            report({ id: 2, location: 'Zone 2' }),
            report({ id: 3, location: 'Zone 3' }),
          ])}
        />
      );

      expect(screen.getAllByRole('listitem')).toHaveLength(3);
    });

    it('shows the newest report first regardless of the order supplied', () => {
      render(
        <MyReportsView
          result={ok([
            report({ id: 1, location: 'Older', createdAt: new Date('2026-08-01T00:00:00Z') }),
            report({ id: 2, location: 'Newer', createdAt: new Date('2026-08-25T00:00:00Z') }),
          ])}
        />
      );

      const rows = screen.getAllByRole('listitem');
      expect(rows[0]).toHaveTextContent('Newer');
      expect(rows[1]).toHaveTextContent('Older');
    });

    it('summarises how many reports there are', () => {
      render(<MyReportsView result={ok([report({ id: 1 }), report({ id: 2 })])} />);

      expect(screen.getByText(/2 reports/i)).toBeInTheDocument();
    });
  });

  describe('filtering by status (KWM-027)', () => {
    const mixed = ok([
      report({ id: 1, location: 'Pending one', status: 'pending' }),
      report({ id: 2, location: 'Verified one', status: 'verified' }),
      report({ id: 3, location: 'Rejected one', status: 'rejected' }),
    ]);

    it('shows every report by default', () => {
      render(<MyReportsView result={mixed} />);

      expect(screen.getAllByRole('listitem')).toHaveLength(3);
    });

    it('narrows the list to the chosen status', async () => {
      const user = userEvent.setup();
      render(<MyReportsView result={mixed} />);

      await user.selectOptions(screen.getByLabelText(/filter by status/i), 'verified');

      expect(screen.getAllByRole('listitem')).toHaveLength(1);
      expect(screen.getByText('Verified one')).toBeInTheDocument();
      expect(screen.queryByText('Pending one')).not.toBeInTheDocument();
    });

    it('explains an empty filter result rather than looking broken', async () => {
      const user = userEvent.setup();
      render(<MyReportsView result={ok([report({ status: 'pending' })])} />);

      await user.selectOptions(screen.getByLabelText(/filter by status/i), 'collected');

      expect(screen.queryAllByRole('listitem')).toHaveLength(0);
      expect(screen.getByText(/no reports with that status/i)).toBeInTheDocument();
    });

    it('can be cleared back to all reports', async () => {
      const user = userEvent.setup();
      render(<MyReportsView result={mixed} />);
      await user.selectOptions(screen.getByLabelText(/filter by status/i), 'verified');

      await user.selectOptions(screen.getByLabelText(/filter by status/i), 'all');

      expect(screen.getAllByRole('listitem')).toHaveLength(3);
    });
  });

  describe('with no reports yet', () => {
    it('invites the user to submit their first report', () => {
      render(<MyReportsView result={ok([])} />);

      expect(screen.getByText(/haven't submitted any reports/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /report waste/i })).toHaveAttribute(
        'href',
        '/report'
      );
    });

    it('offers no status filter when there is nothing to filter', () => {
      render(<MyReportsView result={ok([])} />);

      expect(screen.queryByLabelText(/filter by status/i)).not.toBeInTheDocument();
    });
  });

  describe('when the action failed', () => {
    it('asks an unauthenticated visitor to sign in', () => {
      render(<MyReportsView result={err(appError('UNAUTHENTICATED', 'Not authenticated'))} />);

      expect(screen.getByRole('alert')).toHaveTextContent(/sign in/i);
    });

    it('reports a permission failure', () => {
      render(<MyReportsView result={err(appError('FORBIDDEN', 'Insufficient permissions'))} />);

      expect(screen.getByRole('alert')).toHaveTextContent(/permission/i);
    });

    it('never shows raw fault text for an unexpected error', () => {
      render(
        <MyReportsView
          result={err({ code: 'UNEXPECTED', message: 'ECONNREFUSED password=hunter2' })}
        />
      );

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert.textContent ?? '').not.toContain('hunter2');
    });

    it('renders no list when the fetch failed', () => {
      // A failure must not be indistinguishable from "you have no reports" —
      // the bug the pre-KWM-019 `[]` fallback would have caused here.
      render(<MyReportsView result={err(appError('UNEXPECTED', 'boom'))} />);

      expect(screen.queryAllByRole('listitem')).toHaveLength(0);
      expect(screen.queryByText(/haven't submitted any reports/i)).not.toBeInTheDocument();
    });
  });
});
