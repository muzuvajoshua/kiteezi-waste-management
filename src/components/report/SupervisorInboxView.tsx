"use client";

import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, MapPin } from "lucide-react";
import { actionErrorMessage } from "@/lib/action-error";
import type { Result } from "@/shared/application/result";
import type { AppError } from "@/shared/application/app-error";
import type { Report, WasteType } from "@/modules/reports/domain/report";

// KWM-032 — the supervisor's triage queue.
//
// Takes the loaded Result as a prop and the review call as a function, so the
// page stays a thin server component and every state here — loaded, empty,
// filtered-empty, failed, submitting, partly applied — is reachable in a test
// by passing plain values. Same split as MyReportsView.
//
// Two ACs on KWM-032 are not implemented, because the data they filter on does
// not exist yet rather than because they were skipped:
//
//   - Filter by ZONE. There is no zone column; `location` is free text typed
//     by the reporter. The location filter below is the honest substitute, and
//     should become a real zone filter when one is modelled.
//   - Filter by AI CONFIDENCE. `verificationResult` is always null until
//     KWM-043 ships a classifier, so a threshold control would filter on
//     nothing and imply a capability the system does not have.

const WASTE_TYPES: readonly WasteType[] = [
  "general",
  "plastic",
  "organic",
  "metal",
  "paper",
  "ewaste",
  "hazardous",
  "other",
];

function formatDate(date: Date): string {
  // Fixed locale so server and client agree — a locale-dependent string is a
  // hydration mismatch waiting to happen.
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export interface SupervisorInboxViewProps {
  readonly result: Result<Report[], AppError>;
  readonly onReview: (
    reportIds: number[],
    decision: "approved" | "rejected",
    reviewReason?: string
  ) => Promise<Result<Report[], AppError>>;
}

export function SupervisorInboxView({ result, onReview }: SupervisorInboxViewProps) {
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [reason, setReason] = useState("");
  const [wasteType, setWasteType] = useState<WasteType | "all">("all");
  const [location, setLocation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);

  // Derived from `result` directly rather than via an intermediate array,
  // which would be a fresh reference each render and defeat the memo.
  const reports = useMemo(
    () =>
      result.ok
        ? [...result.value].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        : [],
    [result]
  );

  const visible = useMemo(() => {
    const needle = location.trim().toLowerCase();
    return reports.filter(
      (report) =>
        (wasteType === "all" || report.wasteType === wasteType) &&
        (needle === "" || report.location.toLowerCase().includes(needle))
    );
  }, [reports, wasteType, location]);

  // Intersected with what is currently visible, not just read back. A
  // supervisor who selects everything and then filters must not approve
  // reports they can no longer see.
  const effectiveIds = useMemo(
    () => visible.filter((report) => selected.has(report.id)).map((report) => report.id),
    [visible, selected]
  );

  function toggle(id: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((current) =>
      visible.every((report) => current.has(report.id))
        ? new Set()
        : new Set(visible.map((report) => report.id))
    );
  }

  async function review(decision: "approved" | "rejected") {
    const trimmed = reason.trim();

    // Checked here as well as in the domain so the supervisor is told before
    // a round trip rather than after one.
    if (decision === "rejected" && trimmed === "") {
      setOutcome(null);
      setError("Give a reason before rejecting — the reporter is shown it.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setOutcome(null);

    const requested = effectiveIds.length;
    const response = await onReview(effectiveIds, decision, trimmed === "" ? undefined : trimmed);

    setSubmitting(false);

    if (!response.ok) {
      // The selection survives a failure: the work was not done, and making
      // the supervisor re-tick everything to retry is punishing them for an
      // outage.
      setError(actionErrorMessage(response.error));
      return;
    }

    const changed = response.value.length;
    setSelected(new Set());
    setReason("");
    setOutcome(
      changed === requested
        ? `${changed} ${changed === 1 ? "report" : "reports"} ${decision}.`
        : `${changed} of ${requested} ${decision} — the rest had already been reviewed.`
    );
  }

  if (!result.ok) {
    return (
      <div role="alert" className="flex items-start gap-3 rounded-card bg-rose-50 p-4 text-rose-900">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-medium">Could not load the review queue</p>
          <p className="text-sm">{actionErrorMessage(result.error)}</p>
        </div>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-cream-400 p-8 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-brand-600" />
        <p className="mt-3 text-ink-800">Nothing pending. The queue is clear.</p>
      </div>
    );
  }

  const allVisibleSelected =
    visible.length > 0 && visible.every((report) => selected.has(report.id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="wasteTypeFilter" className="block text-sm text-ink-700/70">
            Waste type
          </label>
          <select
            id="wasteTypeFilter"
            value={wasteType}
            onChange={(event) => setWasteType(event.target.value as WasteType | "all")}
            className="mt-1 rounded-lg border border-cream-400 px-2 py-1.5 text-sm text-ink-900"
          >
            <option value="all">All</option>
            {WASTE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-[12rem] flex-1">
          <label htmlFor="locationFilter" className="block text-sm text-ink-700/70">
            Location contains
          </label>
          <input
            id="locationFilter"
            type="text"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="e.g. Bwaise"
            className="mt-1 w-full rounded-lg border border-cream-400 px-2 py-1.5 text-sm text-ink-900"
          />
        </div>
      </div>

      <div className="rounded-card border border-cream-300 bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-cream-300 p-3">
          <label className="flex items-center gap-2 text-sm text-ink-800">
            <input
              type="checkbox"
              aria-label="Select all"
              checked={allVisibleSelected}
              onChange={toggleAll}
              disabled={visible.length === 0}
              className="h-4 w-4"
            />
            Select all
          </label>
          <p className="text-sm text-ink-700/70">{effectiveIds.length} selected</p>
        </div>

        {visible.length === 0 ? (
          <p className="p-6 text-center text-ink-700/70">No pending reports match those filters.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {visible.map((report) => (
              <li key={report.id} className="flex items-center gap-3 p-3">
                <input
                  type="checkbox"
                  aria-label={`Select report ${report.id}`}
                  checked={selected.has(report.id)}
                  onChange={() => toggle(report.id)}
                  className="h-4 w-4 shrink-0"
                />
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-medium text-ink-900">
                    <MapPin className="h-4 w-4 shrink-0 text-ink-700/40" />
                    <span className="truncate">{report.location}</span>
                  </p>
                  <p className="mt-0.5 text-sm text-ink-700/70">
                    {report.wasteType} · {report.amount} kg · {formatDate(report.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3 rounded-card border border-cream-300 bg-cream-200 p-3">
        <div>
          <label htmlFor="reviewReason" className="block text-sm text-ink-700/70">
            Reason <span className="text-ink-700/40">(required to reject — the reporter sees it)</span>
          </label>
          <textarea
            id="reviewReason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            maxLength={1000}
            className="mt-1 w-full rounded-lg border border-cream-400 px-2 py-1.5 text-sm text-ink-900"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => review("approved")}
            disabled={submitting || effectiveIds.length === 0}
            className="rounded-lg bg-brand-700 px-4 py-2 text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => review("rejected")}
            disabled={submitting || effectiveIds.length === 0}
            className="rounded-lg bg-rose-700 px-4 py-2 text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      </div>

      {error !== null && (
        <div role="alert" className="flex items-start gap-3 rounded-card bg-rose-50 p-4 text-rose-900">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {outcome !== null && (
        <p role="status" className="rounded-full bg-brand-50 p-4 text-sm text-green-800">
          {outcome}
        </p>
      )}
    </div>
  );
}
