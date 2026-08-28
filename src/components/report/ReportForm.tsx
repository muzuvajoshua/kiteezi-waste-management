"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Leaf, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { actionErrorMessage } from "@/lib/action-error";
import { createReport } from "@/modules/reports/presentation/report.actions";
import type { WasteType } from "@/modules/reports/domain/report";

// KWM-025 — citizen waste-report submission.
//
// Deliberately has no client-side copy of the validation rules. `createReport`
// already validates against createReportSchema and returns a VALIDATION
// AppError whose message names the offending field, so duplicating those rules
// here would be two sources of truth that drift. The browser's own `required`
// and `type="number"` handle the trivial cases before a round trip.
//
// Not yet implemented, both blocked on unstarted work: the map pin picker
// (KWM-034 adds Mapbox) and photo upload to a signed URL (KWM-026). Location is
// free text and the photo is a URL field until those land.

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

const POINTS_PER_REPORT = 10;

const FIELD_CLASS =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500";

export function ReportForm() {
  const [location, setLocation] = useState("");
  const [wasteType, setWasteType] = useState<WasteType>("general");
  const [amount, setAmount] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Guard against a double submit: the button is disabled while in flight,
    // but Enter in a text field can still fire submit.
    if (isSubmitting) return;

    setIsSubmitting(true);
    setSubmitted(false);

    const result = await createReport(
      location.trim(),
      wasteType,
      amount.trim(),
      // The server schema requires a non-empty string when present, so an
      // untouched optional field must be absent rather than "".
      imageUrl.trim() || undefined
    );

    setIsSubmitting(false);

    if (!result.ok) {
      // Keep the entered values so the user can correct and retry.
      toast.error(actionErrorMessage(result.error));
      return;
    }

    setSubmitted(true);
    setLocation("");
    setWasteType("general");
    setAmount("");
    setImageUrl("");
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-5" noValidate={false}>
      <div>
        <label htmlFor="location" className="mb-1 block text-sm font-medium text-gray-700">
          Location
        </label>
        <input
          id="location"
          name="location"
          type="text"
          required
          maxLength={500}
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          placeholder="e.g. Kiteezi, Zone 3, near the market"
          className={FIELD_CLASS}
        />
      </div>

      <div>
        <label htmlFor="wasteType" className="mb-1 block text-sm font-medium text-gray-700">
          Waste type
        </label>
        <select
          id="wasteType"
          name="wasteType"
          value={wasteType}
          onChange={(event) => setWasteType(event.target.value as WasteType)}
          className={FIELD_CLASS}
        >
          {WASTE_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="amount" className="mb-1 block text-sm font-medium text-gray-700">
          Amount (kg)
        </label>
        <input
          id="amount"
          name="amount"
          type="number"
          required
          min="0"
          step="any"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="e.g. 4"
          className={FIELD_CLASS}
        />
      </div>

      <div>
        <label htmlFor="imageUrl" className="mb-1 block text-sm font-medium text-gray-700">
          Photo URL <span className="text-gray-400">(optional)</span>
        </label>
        <input
          id="imageUrl"
          name="imageUrl"
          type="url"
          maxLength={2048}
          value={imageUrl}
          onChange={(event) => setImageUrl(event.target.value)}
          placeholder="https://…"
          className={FIELD_CLASS}
        />
        <p className="mt-1 text-xs text-gray-500">
          Direct photo upload arrives with KWM-026; paste an https link for now.
        </p>
      </div>

      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-green-600 py-3 text-white hover:bg-green-700 disabled:opacity-50 sm:w-auto"
      >
        {isSubmitting ? "Submitting…" : "Submit report"}
        <Send className="ml-2 h-4 w-4" />
      </Button>

      {submitted && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg bg-green-50 p-4 text-green-800"
        >
          <Leaf className="h-5 w-5 shrink-0" />
          <span>
            Report submitted — you earned {POINTS_PER_REPORT} points. Thank you!
          </span>
        </div>
      )}
    </form>
  );
}
