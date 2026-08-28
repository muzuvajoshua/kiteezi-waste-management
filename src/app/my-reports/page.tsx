import type { Metadata } from "next";
import Link from "next/link";
import { MyReportsView } from "@/components/report/MyReportsView";
import { getReportsByUserId } from "@/modules/reports/presentation/report.actions";

export const metadata: Metadata = {
  title: "My reports · Kiteezi Waste Management System",
  description: "The waste reports you have submitted, and their status.",
};

// KWM-027. A server component: it awaits the action and hands the Result
// straight to MyReportsView, which owns every rendered state and is
// unit-tested. No try/catch — since KWM-019 the action returns a Result and
// does not throw, so the failure path is data, not an exception.
//
// `dynamic = 'force-dynamic'` because the action reads the session cookie;
// without it Next.js would try to render this at build time, where there is no
// request scope.
export const dynamic = "force-dynamic";

export default async function MyReportsPage() {
  const result = await getReportsByUserId();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">My reports</h1>
          <p className="mt-1 text-gray-600">Everything you&apos;ve reported, and where it got to.</p>
        </div>
        <Link
          href="/report"
          className="rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700"
        >
          New report
        </Link>
      </div>

      <MyReportsView result={result} />
    </div>
  );
}
