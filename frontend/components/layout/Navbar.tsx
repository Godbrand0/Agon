"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { Swords, User, Wallet } from "lucide-react";
import { useWallet } from "@/lib/wallet";

const NAV = [
  { href: "/arena",       label: "Arena" },
  { href: "/agents",      label: "Agents" },
  { href: "/leaderboard", label: "Leaderboard" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { address, isConnected, isConnecting, connect, disconnect } = useWallet();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/75 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 gap-4">
        <Link href="/" className="flex items-center gap-2 text-agon-green font-bold text-lg tracking-tight shrink-0">
          <motion.div whileHover={{ rotate: 15, scale: 1.1 }} transition={{ type: "spring", stiffness: 400 }}>
            <Swords className="h-5 w-5" />
          </motion.div>
          Ag<span className="font-normal">ō</span>n
        </Link>

        <nav className="flex items-center gap-1">
          {NAV.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                pathname?.startsWith(href)
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {pathname?.startsWith(href) && (
                <motion.span
                  layoutId="nav-pill"
                  className="absolute inset-0 rounded-md bg-surface-2"
                  style={{ zIndex: -1 }}
                  transition={{ type: "spring", stiffness: 380, damping: 34 }}
                />
              )}
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 ml-auto">
          {isConnected && (
            <Link
              href="/profile"
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                pathname?.startsWith("/profile")
                  ? "bg-surface-2 text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-2"
              )}
            >
              <User className="h-3.5 w-3.5" />
              Profile
            </Link>
          )}

          {isConnected ? (
            <button
              onClick={disconnect}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
              title="Disconnect wallet"
            >
              <Wallet className="h-3.5 w-3.5" />
              {address!.slice(0, 6)}…{address!.slice(-4)}
            </button>
          ) : (
            <motion.button
              onClick={connect}
              disabled={isConnecting}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-1.5 rounded-md bg-agon-green/10 border border-agon-green/25 px-3 py-1.5 text-xs font-semibold text-agon-green hover:bg-agon-green/20 transition-colors"
            >
              <Wallet className="h-3.5 w-3.5" />
              {isConnecting ? "Connecting…" : "Connect Wallet"}
            </motion.button>
          )}
        </div>
      </div>
    </header>
  );
}
