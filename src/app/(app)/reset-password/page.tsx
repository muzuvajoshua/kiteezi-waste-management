import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata: Metadata = {
  title: "Set a new password · Kiteezi Waste Management System",
  // Reset links must never be indexed or previewed by a crawler that follows
  // them — following one would consume the single-use token.
  robots: { index: false, follow: false },
};

// The token arrives as a query parameter, so this page is request-dependent.
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  // A repeated ?token= yields an array; take nothing rather than guessing
  // which one was meant — the form renders its "incomplete link" state.
  const value = typeof token === "string" ? token : "";

  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-8">
      <h1 className="text-2xl font-semibold text-gray-900">Set a new password</h1>
      <p className="mb-6 mt-1 text-center text-gray-600">
        Choose a password you don&apos;t use anywhere else.
      </p>
      <ResetPasswordForm token={value} />
    </div>
  );
}
