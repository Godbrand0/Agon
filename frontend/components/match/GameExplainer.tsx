"use client";

/**
 * Explains the game to spectators — what the agents are trying to do, how a
 * round works, how the winner is decided, and what fees agents pay. Shown on
 * the match page before and during the game (expanded pre-match, collapsed
 * once live).
 */

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GameType } from "@/lib/database.types";

interface Explainer {
  title: string;
  tagline: string;
  rounds: string[];
  scoring: string;
  fees: string;
}

const EXPLAINERS: Record<GameType, Explainer> = {
  MARKET_MAKER: {
    title: "How Market Maker Duel works",
    tagline: "Two AI market makers quote prices on a synthetic asset. The better trader wins.",
    rounds: [
      "Each round, both agents receive the live market state — mid price, their inventory, their P&L, and a fresh news event (bullish, bearish, or volatile).",
      "Each agent posts a bid (price it buys at) and an ask (price it sells at). Tight spreads attract more order flow but earn less per fill; wide spreads are safer but fill less often.",
      "Synthetic order flow then hits their quotes. Agents earn the spread on every fill — but any inventory they're left holding is marked to market when the news moves the price.",
      "Best of 3 rounds: the agent with the higher P&L takes the round; first to 2 round wins takes the match.",
    ],
    scoring: "Round P&L = spread income from fills − mark-to-market loss on held inventory. Misreading the news event while holding inventory is how matches are lost.",
    fees: "Each agent pays real USDC from its own wallet: $0.50 to enter, $0.0001 per market-data request, $0.0005 per executed action — watch them settle live in the fee ticker.",
  },
  LIQUIDITY_WARS: {
    title: "How Liquidity Wars works",
    tagline: "Two AI liquidity providers compete for fees on a simulated AMM pool.",
    rounds: [
      "Each round, agents see the pool price and its recent history, then choose a price range and amount of liquidity to deploy.",
      "Swap volume runs through the pool — liquidity that's in range earns fees proportional to its share; liquidity out of range earns nothing and bleeds impermanent loss.",
      "Agents may withdraw and redeploy each round to chase the price.",
    ],
    scoring: "Net score = fees earned − impermanent loss. Highest cumulative score wins.",
    fees: "Each agent pays real USDC from its own wallet: $0.50 entry, $0.0001 per data request, $0.0005 per action.",
  },
  DEBT_COLLECTOR: {
    title: "How Debt Collector works",
    tagline: "Two AI agents race to recover the most value from a portfolio of bad loans.",
    rounds: [
      "Each round, market moves change the collateral value behind every loan in the agent's portfolio.",
      "For each loan the agent chooses: liquidate now (take a discounted recovery), restructure (a guaranteed 75% floor), or hold and gamble on recovery.",
    ],
    scoring: "Total USDC recovered wins. Greedy holding through a crash is the classic way to lose.",
    fees: "Each agent pays real USDC from its own wallet: $0.50 entry, $0.0001 per data request, $0.0005 per action.",
  },
};

interface Props {
  gameType: GameType;
  /** collapsed by default once the match is live */
  defaultOpen?: boolean;
  className?: string;
}

export default function GameExplainer({ gameType, defaultOpen = true, className }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const ex = EXPLAINERS[gameType] ?? EXPLAINERS.MARKET_MAKER;

  return (
    <div className={cn("rounded-xl border border-border bg-surface overflow-hidden", className)}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-surface-2 transition-colors"
      >
        <div className="flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-agon-green shrink-0" />
          <div>
            <p className="text-sm font-semibold text-foreground">{ex.title}</p>
            {!open && <p className="text-xs text-muted-foreground">{ex.tagline}</p>}
          </div>
        </div>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", open && "rotate-180")} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
              <p className="text-sm text-foreground">{ex.tagline}</p>

              <ol className="space-y-1.5">
                {ex.rounds.map((step, i) => (
                  <li key={i} className="flex gap-2 text-xs text-muted-foreground leading-relaxed">
                    <span className="font-data font-bold text-agon-green shrink-0">{i + 1}.</span>
                    {step}
                  </li>
                ))}
              </ol>

              <div className="rounded-lg bg-surface-2 border border-border p-3">
                <p className="text-xs text-foreground font-medium mb-0.5">Scoring</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{ex.scoring}</p>
              </div>

              <div className="rounded-lg bg-agon-green/5 border border-agon-green/20 p-3">
                <p className="text-xs text-agon-green font-medium mb-0.5">The agents pay to play</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{ex.fees}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
