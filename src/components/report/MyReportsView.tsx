"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, Inbox, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { actionErrorMessage } from "@/lib/action-error";
import type { Result } from "@/shared/application/result";
import type { AppError } from "@/shared/application/app-error";
import { REPORT_STATUSES } from "@/modules/reports/domain/report";
import type { Report, ReportStatus } from "@/modules/reports/domain/report";

// KWM-027 — the citizen's own report history.
//
// Takes the action's Result as a prop rather than fetching it, so the page
// stays a thin server component and every state this can be in — loaded,
// empty, filtered-empty, or failed — is reachable in a test by passing a
// plain value.
//
// Not implemented: cursor pagination (an AC on KWM-027). `listMyReports` has
// no pagination to page over, and adding it would mean changing the use-case,
// the port and the repository — out of scope for this slice. The status filter
// below is client-side, which is correct only while the whole list is fetched;
// it must move server-side when pagination lands.

const STATUS_STYLES: Record<ReportStatus, string> = {
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-sky-100 text-sky-900",
  in_progress: "bg-indigo-100 text-indigo-900",
  collected: "bg-teal-100 text-teal-900",
  verified: "bg-brand-100 text-brand-900",
  rejected: "bg-rose-100 text-rose-900",
};

function formatStatus(status: ReportStatus): string {
  return status.replace(/_/g, " ");
}

function formatDate(date: Date): string {
  // Fixed locale so server and client render identically — a locale-dependent
  // string is a hydration mismatch waiting to happen.
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function MyReportsView({ result }: { result: Result<Report[], AppError> }) {
  const [statusFilter, setStatusFilter] = useState<ReportStatus | "all">("all");

  // Derived from `result` rather than from an intermediate `reports` array: a
  // `result.ok ? result.value : []` local is a fresh reference on every render,
  // which would make both memos recompute every time and defeat the point of
  // having them.
  const sorted = useMemo(
    () =>
      result.ok
        ? [...result.value].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        : [],
    [result]
  );

  const visible = useMemo(
    () => (statusFilter === "all" ? sorted : sorted.filter((r) => r.status === statusFilter)),
    [sorted, statusFilter]
  );

  if (!result.ok) {
    return (
      <div
        role="alert"
        className="flex items-start gap-3 rounded-card bg-rose-50 p-4 text-rose-900"
      >
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-medium">Could not load your reports</p>
          <p className="text-sm">{actionErrorMessage(result.error)}</p>
        </div>
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-cream-400 p-8 text-center">
        <Inbox className="mx-auto h-8 w-8 text-ink-700/40" />
        <p className="mt-3 text-ink-800">You haven&apos;t submitted any reports yet.</p>
        <Link
          href="/report"
          className="mt-4 inline-block rounded-lg bg-brand-700 px-4 py-2 text-white hover:bg-brand-800"
        >
          Report waste
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-700/70">
          {sorted.length} {sorted.length === 1 ? "report" : "reports"}
        </p>

        <div className="flex items-center gap-2">
          <label htmlFor="statusFilter" className="text-sm text-ink-700/70">
            Filter by status
          </label>
          <select
            id="statusFilter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as ReportStatus | "all")}
            className="rounded-lg border border-cream-400 px-2 py-1 text-sm text-ink-900"
          >
            <option value="all">All</option>
            {REPORT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {formatStatus(status)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg bg-cream-200 p-6 text-center text-ink-700/70">
          No reports with that status.
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((report) => (
            <li
              key={report.id}
              className="flex flex-col gap-2 rounded-card border border-cream-300 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 font-medium text-ink-900">
                  <MapPin className="h-4 w-4 shrink-0 text-ink-700/40" />
                  <span className="truncate">{report.location}</span>
                </p>
                <p className="mt-1 text-sm text-ink-700/70">
                  {report.wasteType} · {report.amount} kg · {formatDate(report.createdAt)}
                </p>
                {/*
                  KWM-032 — the reviewer's reason, shown to the person who
                  filed the report. Storing it and never displaying it would
                  make the rejection unexplained, which is the whole problem
                  the column exists to solve.
                */}
                {report.reviewReason !== null && (
                  <p className="mt-1.5 text-sm text-ink-800">
                    <span className="font-medium">
                      {report.status === "rejected" ? "Why it was rejected:" : "Reviewer note:"}
                    </span>{" "}
                    {report.reviewReason}
                  </p>
                )}
              </div>
              <Badge className={`shrink-0 capitalize ${STATUS_STYLES[report.status]}`}>
                {formatStatus(report.status)}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
