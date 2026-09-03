import type { Metadata, Viewport } from "next";
import { Fraunces, Familjen_Grotesk, Martian_Mono } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["SOFT", "WONK", "opsz"],
  display: "swap",
});
const familjen = Familjen_Grotesk({
  subsets: ["latin"],
  variable: "--font-familjen",
  display: "swap",
});
const martian = Martian_Mono({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-martian",
  display: "swap",
});

const DESCRIPTION = "A hand-lacquered Ludo board for two people in two time zones. Open a table, send the code, play.";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "http://localhost:3000"),
  ),
  title: { default: "Ludo Royale", template: "%s · Ludo Royale" },
  description: DESCRIPTION,
  applicationName: "Ludo Royale",
  openGraph: {
    title: "Ludo Royale",
    description: DESCRIPTION,
    type: "website",
    siteName: "Ludo Royale",
  },
  twitter: { card: "summary_large_image", title: "Ludo Royale", description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: "#100C0A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${familjen.variable} ${martian.variable}`}>
      <body>
        <div className="table-surface" aria-hidden />
        {children}
      </body>
    </html>
  );
}
