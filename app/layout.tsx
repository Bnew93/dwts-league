import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { StageBackdrop } from "@/components/stage-backdrop";
import { BRAND, TAGLINE } from "@/lib/brand";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair", display: "swap", style: ["normal", "italic"] });

const SITE = "https://dwts-league.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: BRAND,
  description: TAGLINE,
  applicationName: BRAND,
  openGraph: {
    type: "website",
    url: SITE,
    siteName: BRAND,
    title: BRAND,
    description: `Season 35 fantasy league. ${TAGLINE}`,
  },
  twitter: {
    card: "summary_large_image",
    title: BRAND,
    description: `Season 35 fantasy league. ${TAGLINE}`,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0e0716",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable}`}>
      <body className="min-h-dvh">
        <StageBackdrop />
        {children}
      </body>
    </html>
  );
}
