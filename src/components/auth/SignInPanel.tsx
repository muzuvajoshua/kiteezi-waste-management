"use client";

import { useRouter } from "next/navigation";
import { EmailPasswordForm } from "@/components/auth/EmailPasswordForm";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

// The two sign-in methods together: Google, and email/password.
//
// Both establish the SAME session cookie by the same route — Google via
// /api/auth/session, email/password via a server action — so nothing
// downstream needs to know which was used. That is the point of the
// user_identities table.
export function SignInPanel() {
  const router = useRouter();

  const onAuthenticated = () => {
    // refresh() re-runs the server components, so anything reading the
    // session (the header, /my-reports) picks up the new cookie without a
    // full page load.
    router.refresh();
    router.push("/my-reports");
  };

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="flex justify-center">
        <GoogleSignInButton />
      </div>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-gray-200" />
        <span className="text-xs uppercase tracking-wide text-gray-400">or</span>
        <span className="h-px flex-1 bg-gray-200" />
      </div>

      <EmailPasswordForm onAuthenticated={onAuthenticated} />
    </div>
  );
}
