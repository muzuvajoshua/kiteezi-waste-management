import type { Metadata } from "next";
import { SupervisorInboxPanel } from "@/components/report/SupervisorInboxPanel";
import { getPendingReports } from "@/modules/reports/presentation/report.actions";

export const metadata: Metadata = {
  title: "Review queue · Kiteezi Waste Management System",
  description: "Pending citizen reports awaiting a supervisor's decision.",
};

// KWM-032. A server component: it awaits the action and hands the Result to
// the panel, which owns every rendered state and is unit-tested. No try/catch
// — since KWM-019 the action returns a Result and does not throw, so the
// failure path is data rather than an exception.
//
// `dynamic = 'force-dynamic'` because the action reads the session cookie;
// without it Next.js would try to render this at build time, where there is
// no request scope.
//
// Authorization is NOT enforced here. `getPendingReports` requires a
// supervisor or admin and returns FORBIDDEN otherwise, which the panel renders
// as "you don't have permission" — the guard lives with the data, so a new
// page cannot forget it. This page is one call and no logic on purpose.
export const dynamic = "force-dynamic";

export default async function SupervisorInboxPage() {
  const result = await getPendingReports();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Review queue</h1>
        <p className="mt-1 text-gray-600">
          Reports waiting on a decision. Select any number, then approve or reject them together.
        </p>
      </div>

      <SupervisorInboxPanel result={result} />
    </div>
  );
}
