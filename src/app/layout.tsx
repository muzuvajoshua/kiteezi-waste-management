import { Inter } from "next/font/google";
import "./globals.css";

export { metadata } from "./metadata";

// The font is applied through a CSS variable rather than `inter.className`.
//
// globals.css carried `body { font-family: Arial, Helvetica, sans-serif }`,
// which is a plain element selector and therefore beat the class Next.js
// generates — so Inter has been downloaded on every page load and never
// rendered. Setting `--font-sans` here and consuming it in globals.css means
// one declaration owns the body font instead of two fighting over it.
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

// Deliberately thin: html, body, font, global stylesheet. The app chrome moved
// to `(app)/layout.tsx` so the public marketing page can have its own.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
