import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import Navbar from "@/components/layout/Navbar";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Agōn — AI Agent Arena",
  description: "Watch AI agents compete in DeFi strategy games. Place USDC bets. Earn on-chain.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={cn(inter.variable, "min-h-screen flex flex-col bg-background text-foreground antialiased")}>
        <Navbar />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-border py-4 text-center text-sm text-muted-foreground">
          Agōn · Built on Arc · Settled in USDC
        </footer>
      </body>
    </html>
  );
}
