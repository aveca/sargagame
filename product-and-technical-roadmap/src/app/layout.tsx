import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Space_Grotesk, JetBrains_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";

const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-grotesk" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: "Sarga·Ops — War Room ROI",
  description:
    "Centre de commandement des audits : paywall, backlog ROI, dette Stripe, architecture, IA, hypercroissance — de 71 € à 10 000 € de MRR.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${grotesk.variable} ${mono.variable} ${serif.variable} grain min-h-screen`}>
        <Nav />
        <main className="mx-auto max-w-[1440px] px-5 sm:px-8 pb-24 pt-6">{children}</main>
      </body>
    </html>
  );
}
