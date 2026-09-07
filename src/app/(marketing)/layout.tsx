import Link from "next/link";
import { Leaf, MapPin, Recycle } from "lucide-react";
import { PillLink } from "@/components/ui/pill";
import { BackToTop } from "@/components/marketing/BackToTop";

// Public chrome, rebuilt to the reference's organisation: a thin utility strip
// above a dark sticky nav, and a dark footer.
//
// Deliberately not AppShell. The sidebar links to pages a signed-out visitor
// cannot use, and AppShell mounts GoogleAuthProvider, which fetches
// /api/auth/me and loads Google's script — a cost with no purpose on a page
// most visitors will read without ever signing in. HeroSignIn mounts that
// provider itself, once the sign-in card is open.
//
// The utility strip carries what is TRUE rather than what the reference puts
// there. That theme's strip holds an email address, a street address, a phone
// number and five social accounts, every one invented for a company that does
// not exist. Unreachable contact details are worse than none, so this names
// the area served and what the site is for.

const NAV = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#roles", label: "Who uses it" },
  { href: "/#trust", label: "How it holds up" },
] as const;

const FOOTER_SECTIONS = [
  {
    heading: "Residents",
    links: [
      { href: "/report", label: "Report waste" },
      { href: "/my-reports", label: "My reports" },
      { href: "/#sign-in", label: "Sign in" },
    ],
  },
  {
    heading: "About",
    links: [
      { href: "/#how-it-works", label: "How it works" },
      { href: "/#roles", label: "Who uses it" },
      { href: "/#trust", label: "How it holds up" },
    ],
  },
] as const;

function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <Leaf className="h-7 w-7 text-brand-300" aria-hidden />
      <span className="font-display text-xl font-bold tracking-tight text-white">Kiteezi</span>
    </span>
  );
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-cream-100">
      <div className="hidden bg-ink-950 text-cream-300 sm:block">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-2.5 text-xs">
          <p className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 text-accent-500" aria-hidden />
            Kampala, Uganda &middot; serving the Kiteezi collection area
          </p>
          <p className="flex items-center gap-2">
            <Recycle className="h-3.5 w-3.5 text-accent-500" aria-hidden />
            Report waste, and follow what happens to it
          </p>
        </div>
      </div>

      <header className="sticky top-0 z-40 bg-ink-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
          <Link
            href="/"
            className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          >
            <Wordmark />
          </Link>

          <nav className="hidden items-center gap-8 lg:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                // The reference marks its active item orange. Nothing here
                // tracks which band you are in, so orange is the hover state
                // rather than a claim about where you are.
                className="text-sm font-medium text-cream-300 transition-colors hover:text-accent-500"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <PillLink href="/#sign-in" variant="accent">
            Sign in
          </PillLink>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="bg-ink-950 text-cream-300">
        <div className="mx-auto max-w-6xl px-6 py-band">
          <div className="grid gap-12 lg:grid-cols-[1.6fr_1fr_1fr]">
            <div>
              <Wordmark />
              <p className="mt-5 max-w-sm text-sm leading-relaxed">
                A waste reporting and collection system for the Kiteezi area of Kampala.
                Residents report what they can see, supervisors triage it, and crews clear it
                — with a record of what happened to every report.
              </p>
            </div>

            {FOOTER_SECTIONS.map((section) => (
              <div key={section.heading}>
                <h2 className="font-display text-sm font-bold uppercase tracking-wider text-white">
                  {section.heading}
                </h2>
                <ul className="mt-5 space-y-3 text-sm">
                  {section.links.map((link) => (
                    <li key={link.href + link.label}>
                      <Link
                        href={link.href}
                        className="rounded transition-colors hover:text-accent-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/*
            No invented contact block. The reference's footer carries a phone
            number, a support inbox and a street address; equivalents here
            would put unreachable details in front of real people. There is
            room for the real thing when it exists.
          */}
          <p className="mt-12 border-t border-white/10 pt-6 text-xs text-cream-400/80">
            A waste reporting and collection system in active development.
          </p>
        </div>
      </footer>

      <BackToTop />
    </div>
  );
}
