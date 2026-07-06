"use client";

/**
 * What each agent is actually working with — starting parameters plus the
 * live current market state (mid price, inventory, cumulative P&L, and each
 * agent's most recent bid/ask). Distinct from the round-by-round breakdown:
 * this is the persistent "board state" a spectator would want at a glance.
 */

import { cn, formatUSDC } from "@/lib/utils";
import type { RoundResult } from "@/games/types";
import { LineChart, Wallet } from "lucide-react";

interface Agent {
  id: string;
  name: string;
}

interface Props {
  agents: Agent[];
  rounds: RoundResult[];
}

// Matches MarketMakerEngine.initialize() in games/market-maker/engine.ts
const STARTING_MID_PRICE = 100;
const STARTING_INVENTORY = 0;
const STARTING_PNL = 0;

const AGENT_COLORS = ["text-blue-400", "text-orange-400"];

export default function MarketStateCard({ agents, rounds }: Props) {
  const latest = rounds[rounds.length - 1];
  const midPrice = (latest?.state?.midPrice as number | undefined) ?? STARTING_MID_PRICE;
  const inventory = (latest?.state?.inventory as Record<string, number> | undefined) ?? {};
  const quotes = (latest?.state?.quotes as Record<string, { bid: number; ask: number }> | undefined) ?? {};
  const scores = latest?.scores ?? {};

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <LineChart className="h-3.5 w-3.5 text-agon-green" /> Market State
        </span>
        <span className="font-data text-sm font-bold text-foreground">${midPrice.toFixed(2)}</span>
      </div>

      <div className="px-4 py-2 border-b border-border bg-surface-2/50 text-[11px] text-muted-foreground flex items-center gap-1.5">
        <Wallet className="h-3 w-3 shrink-0" />
        Starting out: ${STARTING_MID_PRICE.toFixed(2)} mid · {STARTING_INVENTORY} inventory · {formatUSDC(STARTING_PNL)} P&amp;L each
      </div>

      <div className="divide-y divide-border">
        {agents.map((agent, i) => {
          const inv = inventory[agent.id] ?? STARTING_INVENTORY;
          const pnl = scores[agent.id] ?? STARTING_PNL;
          const quote = quotes[agent.id];
          const color = AGENT_COLORS[i] ?? "text-foreground";

          return (
            <div key={agent.id} className="px-4 py-3 space-y-1.5">
              <p className={cn("text-sm font-semibold", color)}>{agent.name}</p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground text-[10px] uppercase tracking-wide">Inventory</p>
                  <p className="font-data text-foreground">
                    {inv === 0 ? "flat" : `${inv > 0 ? "long" : "short"} ${Math.abs(inv)}`}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[10px] uppercase tracking-wide">P&amp;L</p>
                  <p className={cn("font-data font-semibold", pnl >= 0 ? "text-agon-green" : "text-destructive")}>
                    {pnl >= 0 ? "+" : ""}{formatUSDC(pnl)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[10px] uppercase tracking-wide">Quote</p>
                  <p className="font-data text-foreground">
                    {quote ? `${quote.bid.toFixed(2)}/${quote.ask.toFixed(2)}` : "—"}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
