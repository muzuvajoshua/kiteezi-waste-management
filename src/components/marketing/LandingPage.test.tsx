// @vitest-environment jsdom
import '@/test-support/component-testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { REPORT_STATUSES } from '@/modules/reports/domain/report';
import { LandingPage } from './LandingPage';

// The landing page is static markup, so most of it is not worth asserting.
// Three things are.
//
// First, the routes out. A landing page whose call to action goes nowhere is
// the same failure as the empty `/` this replaced — it just looks finished.
//
// Second, the anchors. The marketing header links to #how-it-works and
// #roles; those ids live in this component, so nothing else can catch it when
// one is renamed and the nav quietly stops scrolling.
//
// Third, and the reason this file exists at all: no invented metrics. This
// page was designed against a commercial theme whose hero carries "500+ happy
// clients", "100+ tons of waste collected" and "95% of collections completed
// on time" — all fictional. This project has two reports and one user. A
// plausible-sounding number is the easiest thing in the world to add to a
// hero, and the hardest to notice later.

beforeEach(() => {
  render(<LandingPage />);
});

describe('LandingPage', () => {
  describe('routes out of the page', () => {
    it('offers a way to report waste', () => {
      expect(screen.getByRole('link', { name: /report waste/i })).toHaveAttribute(
        'href',
        '/report'
      );
    });

    it('offers a way to sign in', () => {
      expect(screen.getByRole('link', { name: /get started/i })).toHaveAttribute(
        'href',
        '/sign-in'
      );
    });
  });

  describe('the anchors the header navigates to', () => {
    it.each(['how-it-works', 'roles'])('has a #%s target', (id) => {
      expect(document.getElementById(id)).not.toBeNull();
    });
  });

  describe('the workflow', () => {
    // Scoped to the section rather than the whole document: the hero carries
    // its own ordered list of report states, so a bare getAllByRole
    // ('listitem') would mix the two.
    const steps = () => {
      const section = document.getElementById('how-it-works');
      return [...(section?.querySelectorAll('li') ?? [])];
    };

    it('describes the four steps in order', () => {
      expect(steps().map((step) => step.querySelector('h3')?.textContent)).toEqual([
        'Someone reports it',
        'A supervisor reviews it',
        'A crew collects it',
        'The reporter earns points',
      ]);
    });

    it('numbers them so the order is visible, not just implied', () => {
      expect(steps().map((step) => step.querySelector('span')?.textContent)).toEqual([
        '1',
        '2',
        '3',
        '4',
      ]);
    });
  });

  describe('the report lifecycle in the hero', () => {
    // Every value of ReportStatus, imported from the domain rather than
    // retyped, so adding a status to the enum and forgetting this panel is a
    // failure here instead of a silently incomplete diagram.
    it.each(REPORT_STATUSES)('shows the %s state', (status) => {
      expect(screen.getByText(status.replace(/_/g, ' '))).toBeInTheDocument();
    });

    it('lists them in lifecycle order', () => {
      const hero = document.querySelector('ol');
      const labels = [...(hero?.querySelectorAll('span') ?? [])]
        .map((el) => el.textContent)
        .filter((text): text is string =>
          (REPORT_STATUSES as readonly string[]).includes((text ?? '').replace(/ /g, '_'))
        );

      expect(labels).toEqual([
        'pending',
        'approved',
        'in progress',
        'collected',
        'verified',
        'rejected',
      ]);
    });
  });

  describe('claims about the system', () => {
    it('states no adoption or throughput figures', () => {
      // Catches the shape rather than specific wording: any "<number> tons",
      // "<number>+ clients", "<number>% of collections" style claim. None of
      // those numbers exist, and none could be produced honestly today.
      const text = document.body.textContent ?? '';

      expect(text).not.toMatch(/\d+\s*\+?\s*(tons?|clients?|customers?|users?)/i);
      expect(text).not.toMatch(/\d+\s*%/);
      expect(text).not.toMatch(/\d+(\.\d+)?\s*\/\s*5/); // e.g. "4.9 / 5 rating"
    });

    it('does not claim the workflow order is enforced', () => {
      // validateStatusTransition is still a permissive pass-through
      // (KWM-081), so a collection role can move a report that was never
      // approved. Advertising the sequence as a guarantee would be false.
      const text = document.body.textContent ?? '';

      expect(text).not.toMatch(/cannot skip/i);
      expect(text).not.toMatch(/cannot collect/i);
    });

    it('does not claim role changes are audited', () => {
      // Seven actions are audited and none of them is a role grant.
      expect(document.body.textContent ?? '').not.toMatch(/role grants?/i);
    });

    it('describes idempotency as conditional on a key', () => {
      // The key is optional today (KWM-031), so an unqualified "grants are
      // idempotent" would overstate it.
      expect(screen.getByText(/replaying it applies a single time/i)).toBeInTheDocument();
      expect(screen.getByText(/when a request carries an idempotency key/i)).toBeInTheDocument();
    });
  });

  describe('contact details', () => {
    it('invents none', () => {
      // The reference theme carries a street address, a phone number and a
      // support inbox for a company that does not exist. Unreachable contact
      // details are worse than none.
      const text = document.body.textContent ?? '';

      expect(text).not.toMatch(/@[a-z0-9-]+\.(com|org|net)/i);
      expect(text).not.toMatch(/\+?\d[\d\s()-]{7,}/);
    });
  });
});
