import Link from "next/link";
import { Leaf } from "lucide-react";

// Public chrome: a header with a route into the app, and a footer.
//
// Deliberately not AppShell. The sidebar links to pages a signed-out visitor
// cannot use, and AppShell mounts GoogleAuthProvider, which polls
// /api/auth/me — a cost with no purpose on a page that has no session and
// asks for none. The only auth affordance here is a link to /sign-in.
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <Leaf className="h-7 w-7 text-brand-600" />
            <span className="text-lg font-semibold tracking-tight text-ink-900">
              Kiteezi
            </span>
          </Link>

          <nav className="flex items-center gap-6">
            <Link
              href="#how-it-works"
              className="hidden text-sm font-medium text-gray-600 hover:text-ink-900 sm:block"
            >
              How it works
            </Link>
            <Link
              href="#roles"
              className="hidden text-sm font-medium text-gray-600 hover:text-ink-900 sm:block"
            >
              Who uses it
            </Link>
            <Link
              href="/sign-in"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-gray-100 bg-gray-50">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <Leaf className="h-5 w-5 text-brand-600" />
              <span className="font-semibold text-ink-900">
                Kiteezi Waste Management System
              </span>
            </div>
            <p className="text-sm text-gray-500">
              Kampala, Uganda · Built for the Kiteezi collection area
            </p>
          </div>

          {/*
            No fabricated contact details. The reference theme this page was
            designed against carries a street address, a phone number and a
            support inbox for a fictional company; inventing equivalents here
            would put unreachable contact information in front of real people.
            Add them when they exist.
          */}
          <p className="mt-8 border-t border-gray-200 pt-6 text-xs text-gray-400">
            A waste reporting and collection system in active development.
          </p>
        </div>
      </footer>
    </div>
  );
}
