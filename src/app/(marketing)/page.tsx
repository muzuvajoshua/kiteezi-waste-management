import type { Metadata } from "next";
import { LandingPage } from "@/components/marketing/LandingPage";

export const metadata: Metadata = {
  title: "Kiteezi Waste Management System",
  description:
    "Report household and illegal waste in the Kiteezi collection area, follow what happens to each report, and earn points for the ones that check out.",
};

// Static: no session, no data fetch, nothing per-request. It prerenders, which
// is the point of keeping it out of `(app)` — an app route has to be dynamic
// because the shell reads the session cookie.
//
// Replaces the create-next-app boilerplate that stood here since the project
// started: an empty grid wrapping a commented-out block of Next.js starter
// links. `/` rendered blank, so a first-time visitor saw nothing at all.
export default function HomePage() {
  return <LandingPage />;
}
