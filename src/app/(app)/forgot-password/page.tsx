import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Forgot your password · Kiteezi Waste Management System",
  description: "Request a link to set a new password.",
};

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-8">
      <h1 className="text-2xl font-semibold text-gray-900">Forgot your password?</h1>
      <p className="mb-6 mt-1 text-center text-gray-600">
        Enter your email address and we&apos;ll send you a link to set a new one.
      </p>
      <ForgotPasswordForm />
      <p className="mt-6 text-sm text-gray-600">
        <Link href="/sign-in" className="font-medium text-green-700 underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
