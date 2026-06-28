"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { calculateImpliedOdds } from "@/lib/odds";
import { formatUSDC } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface AgentOdds {
  agentId: string;
  agentName: string;
  totalBets: number;
}

interface Props {
  totalPot: number;
  agents: AgentOdds[];
  onBet?: (agentId: string) => void;
  bettingOpen: boolean;
}

export default function OddsDisplay({ totalPot, agents, onBet, bettingOpen }: Props) {
  return (
    <div className="space-y-2">
      {agents.map((a) => {
        const odds = calculateImpliedOdds(totalPot, a.totalBets);
        return (
          <OddsRow
            key={a.agentId}
            agentId={a.agentId}
            agentName={a.agentName}
            odds={odds}
            totalBets={a.totalBets}
            totalPot={totalPot}
            onBet={onBet}
            bettingOpen={bettingOpen}
          />
        );
      })}
    </div>
  );
}

function OddsRow({
  agentId, agentName, odds, totalBets, totalPot, onBet, bettingOpen,
}: {
  agentId: string; agentName: string; odds: number; totalBets: number;
  totalPot: number; onBet?: (id: string) => void; bettingOpen: boolean;
}) {
  const [displayOdds, setDisplayOdds] = useState(odds);
  const [direction, setDirection] = useState<"up" | "down" | null>(null);
  const prevOdds = useRef(odds);

  useEffect(() => {
    if (Math.abs(odds - prevOdds.current) > 0.005) {
      setDirection(odds > prevOdds.current ? "up" : "down");
      setDisplayOdds(odds);
      prevOdds.current = odds;
      setTimeout(() => setDirection(null), 800);
    }
  }, [odds]);

  const pct = totalPot > 0 ? (totalBets / totalPot) * 100 : 0;

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-foreground text-sm">{agentName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{formatUSDC(totalBets)} bet</p>
        </div>

        <div className="flex items-center gap-3">
          <AnimatePresence mode="wait">
            <motion.span
              key={displayOdds.toFixed(3)}
              initial={{ opacity: 0, y: direction === "up" ? 6 : -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={cn(
                "font-data text-lg font-bold",
                direction === "up" ? "text-agon-green" : direction === "down" ? "text-destructive" : "text-foreground"
              )}
            >
              {displayOdds > 0 ? `${displayOdds.toFixed(2)}x` : "—"}
            </motion.span>
          </AnimatePresence>

          {bettingOpen && onBet && (
            <button
              onClick={() => onBet(agentId)}
              className="rounded-lg bg-agon-green/10 border border-agon-green/30 px-3 py-1 text-xs font-semibold text-agon-green hover:bg-agon-green/20 transition-colors"
            >
              Bet
            </button>
          )}
        </div>
      </div>

      {/* Bet proportion bar */}
      <div className="mt-2 h-1 rounded-full bg-surface-2 overflow-hidden">
        <motion.div
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5 }}
          className="h-full rounded-full bg-agon-green/60"
        />
      </div>
    </div>
  );
}
