import type { Metadata } from "next";
import { SignInPanel } from "@/components/auth/SignInPanel";

export const metadata: Metadata = {
  title: "Sign in · Kiteezi Waste Management System",
  description: "Sign in to report waste and track your reports.",
};

// Layout and metadata only; SignInPanel owns the behaviour and is tested.
export default function SignInPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-8">
      <h1 className="text-2xl font-semibold text-gray-900">Sign in</h1>
      <p className="mb-6 mt-1 text-center text-gray-600">
        Report waste in your area and earn points for every report.
      </p>
      <SignInPanel />
    </div>
  );
}
