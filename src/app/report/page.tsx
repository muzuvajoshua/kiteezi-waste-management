import type { Metadata } from "next";
import { ReportForm } from "@/components/report/ReportForm";

export const metadata: Metadata = {
  title: "Report waste · Kiteezi Waste Management System",
  description: "Report uncollected or illegally dumped waste in Kiteezi.",
};

// KWM-025. Deliberately thin: all behaviour lives in ReportForm, which is a
// client component and unit-tested. This file is layout and metadata only,
// which is why src/app/** is excluded from coverage.
export default function ReportPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold text-gray-900">Report waste</h1>
      <p className="mt-1 mb-6 text-gray-600">
        Tell us where the waste is and we&apos;ll get a collector to it. You earn 10 points for
        every report.
      </p>
      <ReportForm />
    </div>
  );
}
