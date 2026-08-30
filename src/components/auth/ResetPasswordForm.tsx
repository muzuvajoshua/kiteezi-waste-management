"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { actionErrorMessage } from "@/lib/action-error";
import { resetPasswordAction } from "@/modules/auth/presentation/password-reset.actions";

const FIELD_CLASS =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500";

/**
 * Sets a new password from an emailed link.
 *
 * The token arrives in the URL and is passed in as a prop. It is never
 * rendered — it is a credential, and putting it on screen puts it into any
 * screenshot or screen-share.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    const result = await resetPasswordAction(token, newPassword);
    setIsSubmitting(false);

    if (!result.ok) {
      // 'signIn' context: a bad token is reported as UNAUTHENTICATED, and
      // without this the shared mapper would rewrite it to "Please sign in to
      // continue." — useless on a page reached from an email.
      setError(actionErrorMessage(result.error, { context: "signIn" }));
      // Never leave a rejected secret on screen.
      setNewPassword("");
      return;
    }

    // To sign-in rather than straight in: the link proves control of the
    // mailbox, not that they remember the password they just chose. Using it
    // once confirms it is what they think it is.
    router.push("/sign-in");
  };

  if (!token) {
    return (
      <div role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-800">
        <p className="font-medium">This reset link is incomplete.</p>
        <p>
          Some email clients cut long links short.{" "}
          <Link href="/forgot-password" className="underline">
            Request a new link
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
      <div>
        <label htmlFor="newPassword" className="mb-1 block text-sm font-medium text-gray-700">
          New password
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          required
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          className={FIELD_CLASS}
        />
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {error}{" "}
            <Link href="/forgot-password" className="underline">
              Request a new link
            </Link>
            .
          </span>
        </div>
      )}

      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-green-600 py-2 text-white hover:bg-green-700 disabled:opacity-50"
      >
        {isSubmitting ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}
