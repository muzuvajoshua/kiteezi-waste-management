import { Caveat, Inter, Outfit } from "next/font/google";
import "./globals.css";

export { metadata } from "./metadata";

// Three faces, each with one job.
//
// Inter for body copy — already here, and good at small sizes. Outfit for
// display: the reference's headings are a heavy geometric sans with tight
// leading, single-storey `g` and near-circular bowls, and Outfit is that
// without being Poppins, which is on every second site. Caveat for the
// section eyebrows only, which is the reference's most identifiable habit —
// an orange handwritten line above every heading.
//
// Three families is one more than usual. It is justified here because the
// third never appears in more than a single line at a time, and the weights
// are kept deliberately narrow: a fourth weight of any of these would cost
// another download for a distinction nobody would notice.
//
// Applied as CSS variables rather than classNames because globals.css sets
// `body { font-family }` with an element selector, which outranks a class —
// that is how Inter came to be downloaded on every page load and never
// rendered.
const inter = Inter({ subsets: ["latin"], variable: "--font-sans", weight: ["400", "500", "600"] });
const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["600", "700", "800"],
});
const caveat = Caveat({ subsets: ["latin"], variable: "--font-script", weight: ["600"] });

// Deliberately thin: html, body, fonts, global stylesheet. The app chrome
// lives in `(app)/layout.tsx` so the public pages can have their own.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${outfit.variable} ${caveat.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
