"use client";

import { useState } from "react";
import { AlertCircle, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { actionErrorMessage } from "@/lib/action-error";
import { requestPasswordResetAction } from "@/modules/auth/presentation/password-reset.actions";

const FIELD_CLASS =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    const result = await requestPasswordResetAction(email.trim());
    setIsSubmitting(false);

    if (!result.ok) {
      setError(actionErrorMessage(result.error));
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <div
        role="status"
        className="flex items-start gap-2 rounded-lg bg-green-50 p-4 text-green-900"
      >
        <MailCheck className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          {/* Deliberately conditional. Saying "we sent you an email" would
              confirm the address is registered, undoing the anti-enumeration
              the use-case is built around. */}
          <p className="font-medium">Check your inbox</p>
          <p className="text-sm">
            If an account exists for that address, a reset link is on its way. The link expires in
            an hour and can only be used once.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          maxLength={255}
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={FIELD_CLASS}
        />
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-green-600 py-2 text-white hover:bg-green-700 disabled:opacity-50"
      >
        {isSubmitting ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
