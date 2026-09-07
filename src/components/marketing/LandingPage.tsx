import { ClipboardCheck, Coins, FileText, ShieldCheck, Truck } from "lucide-react";
import { REPORT_STATUSES } from "@/modules/reports/domain/report";
import { Band, Container, SectionHeading } from "@/components/ui/section";
import { PillLink } from "@/components/ui/pill";
import { Reveal } from "@/components/ui/reveal";
import { HeroSignIn } from "@/components/marketing/HeroSignIn";

// The public landing page.
//
// Rebuilt to the reference walkthrough's visual system: a cream ground, dark
// green bands, a vivid orange accent, heavy geometric display type on tight
// leading, generously rounded cards, and a handwritten eyebrow above every
// heading. The palette was measured from the video frames rather than guessed
// — see globals.css.
//
// What was NOT taken from it. That theme is a brochure for a company that does
// not exist, and it is carried by stock photography: "500+ happy clients",
// "100+ tons of waste collected", "95% of collections completed on time", a
// 4.9/5 rating, a team of four with names and job titles, client logos, a
// street address and a phone number. All invented. This project has two
// reports and one user.
//
// So the structure is borrowed and the content is ours: the four workflow
// steps are the real report -> review -> collect -> earn path, the statuses
// are the report_status enum, the roles are ROLE_NAMES, and the guarantees are
// things the test suite pins. There is no photography at all, which is why the
// bands alternate as strongly as they do — colour and type carry the weight
// that photographs carry in the reference.

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

// The six values of report_status, keyed so a status added to the enum is a
// compile error here rather than a silently missing row. The badge colours
// match what /my-reports already renders, so the colours someone learns on
// this page are the ones they will see against their own reports.
const LIFECYCLE: Record<(typeof REPORT_STATUSES)[number], { meaning: string; badge: string }> = {
  pending: { meaning: "Filed, waiting on a supervisor.", badge: "bg-amber-100 text-amber-900" },
  approved: { meaning: "Accepted, queued for a crew.", badge: "bg-sky-100 text-sky-900" },
  in_progress: { meaning: "A crew is on it.", badge: "bg-indigo-100 text-indigo-900" },
  collected: { meaning: "Cleared from the site.", badge: "bg-teal-100 text-teal-900" },
  verified: { meaning: "Confirmed, and points awarded.", badge: "bg-brand-100 text-brand-900" },
  rejected: {
    meaning: "Turned down, with a reason you can read.",
    badge: "bg-rose-100 text-rose-900",
  },
};

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

// Every claim here was checked against the code. Earlier drafts of three were
// wrong in the flattering direction, which is the failure mode a page like
// this invites:
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

const formatStatus = (status: string) => status.replace(/_/g, " ");

export function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-ink-900">
        {/*
          The reference sets a giant outlined word behind its hero. This is the
          only piece of pure decoration on the page, so it is kept very low
          contrast and hidden from assistive technology — at full strength it
          competes with the heading, which is the opposite of the point.
        */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -left-6 bottom-0 hidden select-none font-display text-[11rem] font-extrabold leading-[0.8] tracking-tighter text-white/[0.025] xl:block"
        >
          RECYCLE
        </span>

        <Container className="relative grid gap-16 py-band lg:grid-cols-[1.1fr_1fr] lg:items-center lg:py-band-lg">
          <div>
            <p className="flex items-center gap-2 font-script text-2xl text-accent-500">
              <svg viewBox="0 0 12 12" aria-hidden="true" className="h-3 w-3 shrink-0 fill-accent-500">
                <path d="M6 0c.4 2.6 1.4 3.6 4 4-2.6.4-3.6 1.4-4 4-.4-2.6-1.4-3.6-4-4 2.6-.4 3.6-1.4 4-4Z" />
              </svg>
              Kiteezi waste management
            </p>

            <h1 className="mt-4 font-display text-display-md font-extrabold text-white sm:text-display-lg lg:text-display-xl">
              Report waste. Watch it get collected.
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-cream-300">
              Waste nobody reports is waste nobody collects. Kiteezi turns what residents can
              see into a queue that crews can work — and keeps a record of what happened to
              every report, so a site that was cleared can be told apart from one that was
              merely noticed.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <PillLink href="/report" variant="accent" size="lg">
                Report waste
              </PillLink>
              <PillLink href="#how-it-works" variant="outline" size="lg">
                How it works
              </PillLink>
            </div>
          </div>

          <HeroSignIn />
        </Container>
      </section>

      {/* How it works */}
      <Band id="how-it-works" tone="cream">
        <Container>
          <Reveal>
            <SectionHeading
              eyebrow="How it works"
              title="From a resident spotting waste to points on their balance"
              lede="Four steps. Each is a real transition in the system, and each leaves a record behind it."
            />
          </Reveal>

          <ol className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <Reveal delayMs={index * 70} className="h-full">
                  <div className="flex h-full flex-col rounded-card border border-cream-300 bg-white p-7 transition-colors hover:border-brand-300">
                    <div className="flex items-center justify-between">
                      {/*
                        Numbered because this content genuinely is a sequence.
                        Numbering an unordered set of features is the tell that
                        habit usually is, which is why numbers appear here and
                        nowhere else on the page.
                      */}
                      <span className="font-display text-3xl font-extrabold text-cream-400">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <step.icon className="h-6 w-6 text-brand-700" aria-hidden />
                    </div>
                    <h3 className="mt-6 font-display text-xl font-bold text-ink-900">
                      {step.title}
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed text-ink-700/70">{step.body}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </Container>
      </Band>

      {/* The report lifecycle */}
      <Band id="lifecycle" tone="white">
        <Container>
          <Reveal>
            <SectionHeading
              eyebrow="Every report has a state"
              title="You can always tell what happened to a report"
              lede="The six states a report moves through, with the same colours you will see against your own reports."
            />
          </Reveal>

          <dl className="mt-16 grid gap-x-12 gap-y-1 sm:grid-cols-2">
            {REPORT_STATUSES.map((status, index) => (
              <Reveal key={status} delayMs={index * 45}>
                <div className="flex items-baseline gap-4 border-b border-cream-300 py-5">
                  <dt
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold capitalize ${LIFECYCLE[status].badge}`}
                  >
                    {formatStatus(status)}
                  </dt>
                  <dd className="text-sm text-ink-700/75">{LIFECYCLE[status].meaning}</dd>
                </div>
              </Reveal>
            ))}
          </dl>
        </Container>
      </Band>

      {/* Who uses it */}
      <Band id="roles" tone="cream">
        <Container>
          <Reveal>
            <SectionHeading
              eyebrow="Who uses it"
              title="Four kinds of people, one record"
              lede="What you can reach depends on your role, and the rules are enforced on the server rather than by hiding buttons."
            />
          </Reveal>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {ROLES.map((role, index) => (
              <Reveal key={role.name} delayMs={index * 70} className="h-full">
                <div className="flex h-full flex-col rounded-card bg-ink-900 p-7 text-cream-300">
                  <h3 className="font-display text-xl font-bold text-white">{role.name}</h3>
                  <p className="mt-3 flex-1 text-sm leading-relaxed">{role.body}</p>
                  <span aria-hidden="true" className="mt-6 h-1 w-10 rounded-full bg-accent-500" />
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </Band>

      {/* How it holds up */}
      <Band id="trust" tone="ink">
        <Container>
          <Reveal>
            <div className="flex items-start gap-4">
              <ShieldCheck className="mt-2 h-8 w-8 shrink-0 text-accent-500" aria-hidden />
              <SectionHeading
                eyebrow="How it holds up"
                title="A system that hands out value is worth explaining"
                lede="These are the parts that could be abused, and what stops them."
                tone="dark"
              />
            </div>
          </Reveal>

          <dl className="mt-16 grid gap-10 sm:grid-cols-2">
            {GUARANTEES.map((item, index) => (
              <Reveal key={item.title} delayMs={index * 60}>
                <div className="border-l-2 border-accent-500/40 pl-6">
                  <dt className="font-display text-lg font-bold text-white">{item.title}</dt>
                  <dd className="mt-3 text-sm leading-relaxed text-cream-300/85">{item.body}</dd>
                </div>
              </Reveal>
            ))}
          </dl>
        </Container>
      </Band>

      {/* Closing */}
      <Band tone="brand">
        <Container>
          <Reveal>
            <div className="flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
              <div>
                <h2 className="max-w-xl font-display text-display-sm font-extrabold text-white sm:text-display-md">
                  Seen waste that needs collecting?
                </h2>
                <p className="mt-4 max-w-xl text-lg text-brand-100">
                  Sign in with Google or an email address. Reporting takes a location, a waste
                  type and a rough quantity.
                </p>
              </div>
              <PillLink href="#sign-in" variant="accent" size="lg" className="shrink-0">
                Get started
              </PillLink>
            </div>
          </Reveal>
        </Container>
      </Band>
    </>
  );
}
