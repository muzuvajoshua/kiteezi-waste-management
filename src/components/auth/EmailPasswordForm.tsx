"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { actionErrorMessage } from "@/lib/action-error";
import {
  registerWithEmailPassword,
  signInWithEmailPassword,
} from "@/modules/auth/presentation/password.actions";

// Email/password sign-in and registration, one form in two modes.
//
// No client-side copy of the password policy. The domain owns it
// (domain/password.ts) and returns a VALIDATION error whose message states
// the requirement, so duplicating "at least 8 characters" here would be a
// second source of truth that drifts. The browser's own `required` handles
// empty fields before a round trip.

export interface AuthenticatedUser {
  id: number;
  email: string;
  name: string;
}

const FIELD_CLASS =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500";

export function EmailPasswordForm({
  onAuthenticated,
}: {
  onAuthenticated?: (user: AuthenticatedUser) => void;
}) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const switchMode = () => {
    setIsRegistering((current) => !current);
    // A failure from the other mode makes no sense over this one.
    setError(null);
    setPassword("");
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // The button is disabled while in flight, but Enter in a text field can
    // still fire submit.
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    const result = isRegistering
      ? await registerWithEmailPassword(email.trim(), password, name.trim() || undefined)
      : await signInWithEmailPassword(email.trim(), password);

    setIsSubmitting(false);

    if (!result.ok) {
      // 'signIn' context: on this form UNAUTHENTICATED means 'those
      // credentials were wrong', not 'you are not signed in'.
      setError(actionErrorMessage(result.error, { context: 'signIn' }));
      // Never leave a rejected secret on screen: it invites a blind resubmit
      // and is visible to anyone sharing the device.
      setPassword("");
      return;
    }

    setPassword("");
    onAuthenticated?.(result.value);
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
      {isRegistering && (
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium text-gray-700">
            Your name <span className="text-gray-400">(optional)</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            maxLength={255}
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={FIELD_CLASS}
          />
        </div>
      )}

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

      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          // Tells a password manager which flow this is: offering a saved
          // password on a registration form, or saving the old one after a
          // sign-up, are both consequences of getting this wrong.
          autoComplete={isRegistering ? "new-password" : "current-password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
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
        {isSubmitting
          ? isRegistering
            ? "Creating account…"
            : "Signing in…"
          : isRegistering
            ? "Create account"
            : "Sign in"}
      </Button>

      <p className="text-center text-sm text-gray-600">
        {isRegistering ? "Already have an account?" : "No account yet?"}{" "}
        <button
          type="button"
          onClick={switchMode}
          className="font-medium text-green-700 underline hover:text-green-800"
        >
          {isRegistering ? "Sign in instead" : "Create one"}
        </button>
      </p>
    </form>
  );
}
