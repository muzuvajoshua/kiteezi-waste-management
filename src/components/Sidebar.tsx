"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardCheck, ListChecks, MapPin } from "lucide-react";

// The signed-in navigation.
//
// Only pages that exist. This list used to carry /collect, /rewards,
// /leaderboard and /settings — four links to nothing, kept "so the intended
// shape of the app stays visible". That is a reasonable thing to want and a
// bad way to get it: every one of them was a dead end a signed-in user could
// click, and the roadmap is not something a navigation bar should be used to
// document. They come back as each page lands.
//
// The review queue is listed for everyone, which is wrong but not unsafe:
// getPendingReports refuses anyone without a supervisor or admin role, so a
// resident following the link is told they lack permission rather than shown
// the queue. Hiding it needs this component to know the session's roles, and
// it is a client component with no session access.
const ITEMS = [
  { href: "/report", icon: MapPin, label: "Report waste" },
  { href: "/my-reports", icon: ListChecks, label: "My reports" },
  { href: "/supervisor/inbox", icon: ClipboardCheck, label: "Review queue" },
] as const;

export default function Sidebar({ open }: { open: boolean }) {
  const pathname = usePathname();

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-30 w-64 transform border-r border-cream-300 bg-white pt-20 transition-transform duration-300 ease-in-out lg:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <nav className="flex h-full flex-col px-3 py-6">
        <ul className="space-y-1">
          {ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-700 ${
                    active
                      ? "bg-brand-700 text-white"
                      : "text-ink-800 hover:bg-cream-200"
                  }`}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <p className="mt-auto px-3 text-xs leading-relaxed text-ink-700/50">
          Kiteezi collection area, Kampala.
        </p>
      </nav>
    </aside>
  );
}
