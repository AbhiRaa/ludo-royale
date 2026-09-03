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

export const metadata: Metadata = {
  title: "Ludo Royale",
  description: "A hand-lacquered Ludo board for two people in two time zones.",
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
