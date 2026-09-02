import Link from "next/link";
import {
  ArrowRight,
  ClipboardCheck,
  Coins,
  FileText,
  ShieldCheck,
  Truck,
} from "lucide-react";

// KWM — the public landing page.
//
// Designed against a commercial waste-management theme for its visual
// structure (hero, numbered workflow, role cards, closing call to action) but
// none of its content. That theme is a brochure for a fictional private
// company: it carries "500+ happy clients", "100+ tons of waste collected",
// "95% of collections completed on time", a street address and a support
// inbox. Every one of those is invented, and repeating the pattern here would
// put false claims and unreachable contact details in front of real people.
//
// So the copy below describes only what the system does, verified against the
// code: the four workflow steps are the actual report -> review -> collect ->
// earn path, the roles are ROLE_NAMES from the schema, and the guarantees in
// "How it holds up" are things the test suite pins.
//
// A separate component rather than markup inside the page so it renders in
// jsdom without a request scope, and so it is measured by coverage — src/app
// is excluded.

const STEPS = [
  {
    icon: FileText,
    title: "Someone reports it",
    body: "A resident records where the waste is, what kind it is and roughly how much, with a photo if they have one.",
  },
  {
    icon: ClipboardCheck,
    title: "A supervisor reviews it",
    body: "Reports are triaged in a queue and either approved for collection or rejected. A rejection has to say why, and the reporter is shown the reason.",
  },
  {
    icon: Truck,
    title: "A crew collects it",
    body: "A collection crew claims an approved report, clears the site and marks it collected, then verified.",
  },
  {
    icon: Coins,
    title: "The reporter earns points",
    body: "Reports that check out earn points, which accumulate on a balance and can be redeemed against the rewards catalogue.",
  },
] as const;

// The six values of the report_status enum, in the order a report moves
// through them, with the badge styling MyReportsView already uses — so the
// colours a visitor learns here are the colours they will see on their own
// reports. Kept in step with domain/report.ts's ReportStatus by the test that
// asserts all six appear.
const LIFECYCLE = [
  {
    status: "pending",
    meaning: "Filed, waiting on a supervisor.",
    className: "bg-amber-100 text-amber-800",
  },
  {
    status: "approved",
    meaning: "Accepted, queued for a crew.",
    className: "bg-blue-100 text-blue-800",
  },
  {
    status: "in_progress",
    meaning: "A crew is on it.",
    className: "bg-indigo-100 text-indigo-800",
  },
  {
    status: "collected",
    meaning: "Cleared from the site.",
    className: "bg-teal-100 text-teal-800",
  },
  {
    status: "verified",
    meaning: "Confirmed, and points awarded.",
    className: "bg-green-100 text-green-800",
  },
  {
    status: "rejected",
    meaning: "Turned down, with a reason you can read.",
    className: "bg-red-100 text-red-800",
  },
] as const;

const ROLES = [
  {
    name: "Residents",
    body: "Report waste, follow what happened to each report, and redeem the points they earn.",
  },
  {
    name: "Collection crews",
    body: "Pick up approved reports, record collections against them, and get credited for the work.",
  },
  {
    name: "Supervisors",
    body: "Work the review queue, approve or reject in bulk with a reason, and see every balance.",
  },
  {
    name: "Administrators",
    body: "Everything a supervisor can do, plus granting and revoking roles.",
  },
] as const;

// Every claim here was checked against the code before being written. Earlier
// drafts of three of them were wrong in the flattering direction, which is the
// failure mode a page like this invites:
//
//   - "the database enforces the ledger/balance equality" — it does not. It
//     enforces a non-negative balance. The equality is held by both writes
//     sharing one transaction.
//   - "role grants are audited" — they are not. Seven actions are audited and
//     none of them is a role change.
//   - "grants are idempotent" — only when the caller supplies a key, which is
//     optional today (KWM-031).
//
// If a claim below stops being true, delete it rather than soften it.
const GUARANTEES = [
  {
    title: "The ledger and the balance cannot drift apart",
    body: "A points entry and the balance change it causes commit in the same transaction, so neither can exist without the other. The database independently refuses a balance below zero.",
  },
  {
    title: "A grant with a key pays out once",
    body: "When a request carries an idempotency key, replaying it applies a single time — a retried or double-submitted grant cannot pay out twice.",
  },
  {
    title: "Decisions leave a trail",
    body: "Report approvals and rejections, collections, point grants and redemptions are each written to an append-only audit log recording who acted and what changed.",
  },
  {
    title: "Sign-in is bound to an identity, not an address",
    body: "Accounts resolve by the identity provider's immutable subject rather than by email address, so an address changing hands does not hand over the account.",
  },
] as const;

export function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-b from-brand-50 to-white">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 sm:py-28 lg:grid-cols-[1.15fr_1fr] lg:items-center">
          <div>
            <p className="text-sm font-medium uppercase tracking-wider text-brand-700">
              Kampala · Kiteezi collection area
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
              Report waste. Watch it get collected.
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-gray-600">
              Waste nobody reports is waste nobody collects. Kiteezi turns what
              residents can see into a queue that crews can work — and keeps a record
              of what happened to every report, so a site that was cleared can be told
              apart from one that was merely noticed.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                href="/report"
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-3 font-medium text-white transition-colors hover:bg-brand-700"
              >
                Report waste
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="#how-it-works"
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-6 py-3 font-medium text-ink-900 transition-colors hover:bg-gray-50"
              >
                How it works
              </Link>
            </div>
          </div>

          {/*
            The right column is the report lifecycle — the six real values of
            the report_status enum, in order, with the badge colours the app
            itself uses on /my-reports.

            Deliberately NOT a mocked-up report card with a location and a
            photo, which is what the reference theme does with stock imagery. A
            fabricated example rendered in the app's own styling is
            indistinguishable from real data, and someone would eventually cite
            it. This shows the actual states a report moves through, which is
            information rather than decoration.
          */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
              Where a report can be
            </h2>
            <ol className="mt-5 space-y-3">
              {LIFECYCLE.map((stage) => (
                <li key={stage.status} className="flex items-baseline gap-3">
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium capitalize ${stage.className}`}
                  >
                    {stage.status.replace(/_/g, " ")}
                  </span>
                  <span className="text-sm text-gray-600">{stage.meaning}</span>
                </li>
              ))}
            </ol>
            <p className="mt-5 border-t border-gray-100 pt-4 text-xs text-gray-500">
              Every report keeps its current state, visible to the person who filed it.
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-20 border-t border-gray-100">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-3xl font-semibold tracking-tight text-ink-900">
            How it works
          </h2>
          {/*
            No claim that the order is enforced. validateStatusTransition is
            still a permissive pass-through (KWM-081 owns the real transition
            table), so a collection role can in fact move a report that has
            not been approved. Describing the intended path is honest;
            describing it as a guarantee would not be.
          */}
          <p className="mt-3 max-w-2xl text-gray-600">
            From a resident spotting waste to the points landing on their balance.
          </p>

          <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <li key={step.title} className="relative">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
                    {index + 1}
                  </span>
                  <step.icon className="h-5 w-5 text-brand-600" aria-hidden />
                </div>
                <h3 className="mt-4 font-semibold text-ink-900">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Roles */}
      <section id="roles" className="scroll-mt-20 bg-gray-50">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-3xl font-semibold tracking-tight text-ink-900">
            Who uses it
          </h2>
          <p className="mt-3 max-w-2xl text-gray-600">
            What you can reach depends on your role, and the rules are enforced on the
            server rather than by hiding buttons.
          </p>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {ROLES.map((role) => (
              <div
                key={role.name}
                className="rounded-xl border border-gray-200 bg-white p-6"
              >
                <h3 className="font-semibold text-ink-900">{role.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{role.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Guarantees */}
      <section className="border-t border-gray-100">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-6 w-6 text-brand-600" aria-hidden />
            <h2 className="text-3xl font-semibold tracking-tight text-ink-900">
              How it holds up
            </h2>
          </div>
          <p className="mt-3 max-w-2xl text-gray-600">
            A rewards system is a system that hands out value, so the parts that could
            be abused are the parts worth describing.
          </p>

          <dl className="mt-12 grid gap-8 sm:grid-cols-2">
            {GUARANTEES.map((item) => (
              <div key={item.title}>
                <dt className="font-semibold text-ink-900">{item.title}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-gray-600">{item.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Closing call to action */}
      <section className="bg-ink-900">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-white">
                Seen waste that needs collecting?
              </h2>
              <p className="mt-3 max-w-xl text-gray-300">
                Sign in with Google or an email address. Reporting takes a location, a
                waste type and a rough quantity.
              </p>
            </div>
            <Link
              href="/sign-in"
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-brand-500 px-6 py-3 font-medium text-white transition-colors hover:bg-brand-600"
            >
              Get started
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
