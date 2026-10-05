import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Marena — Bali villas and curated experiences",
  description:
    "Private villa rentals and handpicked experiences in Bali, by Marena.",
  openGraph: {
    title: "Marena — Bali villas and curated experiences",
    description:
      "Private villa rentals and handpicked experiences in Bali, by Marena.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-[#0a0a0a] text-white antialiased">{children}</body>
    </html>
  );
}
