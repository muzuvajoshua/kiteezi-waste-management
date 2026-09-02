import AppShell from "@/components/AppShell";

// The signed-in application: header, sidebar, notification toasts, Google auth
// provider.
//
// This used to live in the ROOT layout, which meant every route got it —
// including `/`, so a landing page would render inside the app sidebar. Route
// groups do not affect URLs, so `(app)/my-reports/page.tsx` is still
// `/my-reports`; the only thing the group changes is which layout wraps it.
//
// The public page sits in `(marketing)` with its own chrome and does not load
// the auth provider at all, which is why it ships less JavaScript than an app
// route.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
