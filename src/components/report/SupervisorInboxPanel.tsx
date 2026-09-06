"use client";

import { useRouter } from "next/navigation";
import { SupervisorInboxView } from "@/components/report/SupervisorInboxView";
import { reviewReports } from "@/modules/reports/presentation/report.actions";
import type { Result } from "@/shared/application/result";
import type { AppError } from "@/shared/application/app-error";
import type { Report } from "@/modules/reports/domain/report";

// KWM-032 — the seam between the server action and the view.
//
// SupervisorInboxView takes `onReview` as a prop rather than importing the
// action, which is what lets it be unit-tested without a request scope or a
// database. This file is the only place the two meet, and it holds no logic
// beyond that binding plus the refresh, so there is nothing here worth
// testing that the view's own suite does not already cover.
export function SupervisorInboxPanel({ result }: { result: Result<Report[], AppError> }) {
  const router = useRouter();

  async function onReview(
    reportIds: number[],
    decision: "approved" | "rejected",
    reviewReason?: string
  ) {
    const response = await reviewReports(reportIds, decision, reviewReason);

    // Only on success: refreshing after a failure would re-render the same
    // queue and make it look as though something happened.
    //
    // The refresh re-runs getPendingReports, so reviewed reports leave the
    // queue. It comes after the response is in hand, so the view's own
    // "3 of 5 — the rest had already been reviewed" message is rendered from
    // what the server actually changed rather than from the new queue.
    if (response.ok) {
      router.refresh();
    }

    return response;
  }

  return <SupervisorInboxView result={result} onReview={onReview} />;
}
