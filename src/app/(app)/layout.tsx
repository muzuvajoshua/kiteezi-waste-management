import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getCurrentUser } from "@/modules/auth/presentation/auth-guards";

// The signed-in application: header, sidebar, notification toasts, Google auth
// provider.
//
// This used to live in the ROOT layout, which meant every route got it —
// including `/`, so the landing page rendered inside the app sidebar. Route
// groups do not affect URLs, so `(app)/my-reports/page.tsx` is still
// `/my-reports`; the only thing the group changes is which layout wraps it.
//
// Everything in this group now requires a session. Nothing signed-out belongs
// here: /sign-in used to sit in this group, which meant a signed-out visitor
// was shown a sidebar full of links they could not use in order to reach the
// one thing they could. Sign-in moved to the landing page, and
// /forgot-password and /reset-password moved to `(marketing)` — those have to
// work when signed out, so leaving them here would have locked people out of
// password recovery the moment this guard landed.
//
// The guard is defence in depth rather than the only check. Every server
// action still enforces its own authorization, so this does not decide who may
// do what — it decides who is shown the shell, which is a question about
// navigation rather than security.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  // To the landing page's sign-in card, not to a sign-in route — there is no
  // longer a sign-in route to send anyone to.
  if (user === null) redirect("/#sign-in");

  return <AppShell>{children}</AppShell>;
}
