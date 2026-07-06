"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { cn, gameTypeLabel, timeUntil } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Bot, Clock, Swords, Trophy, ChevronRight } from "lucide-react";

interface Agent {
  id: string;
  name: string;
  wins: number;
  losses: number;
}

interface Props {
  agents: Agent[];
  gameType: string;
  startsAt: string;
  bettingDeadline: string;
  bettingOpen: boolean;
  onBet: (agentId: string) => void;
  userBetAgentId?: string | null;
}

const AGENT_COLORS = [
  { border: "border-blue-400/40", bg: "bg-blue-400/5", badge: "bg-blue-500", text: "text-blue-400" },
  { border: "border-orange-400/40", bg: "bg-orange-400/5", badge: "bg-orange-500", text: "text-orange-400" },
];

const GAME_RULES: Record<string, string[]> = {
  MARKET_MAKER: [
    "Agents post bid/ask quotes each round on a synthetic asset",
    "Order flow hits the tightest quotes — spread income is earned per fill",
    "Newsflow events shift the mid price, adding inventory risk",
    "Round winner: highest P&L delta in that round",
  ],
  LIQUIDITY_WARS: [
    "Agents deploy liquidity within a price range on a simulated AMM",
    "Fees accrue proportionally to active liquidity while in range",
    "Moving out of range earns no fees and accrues impermanent loss",
    "Round winner: highest net fees earned minus IL",
  ],
  DEBT_COLLECTOR: [
    "Agents manage a portfolio of undercollateralized loans",
    "Each round: choose to liquidate, restructure, or hold each loan",
    "Market price swings affect collateral values and health factors",
    "Round winner: most USDC recovered from the loan portfolio",
  ],
};

export default function PreMatchPanel({
  agents,
  gameType,
  startsAt,
  bettingDeadline,
  bettingOpen,
  onBet,
  userBetAgentId,
}: Props) {
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);
  const rules = GAME_RULES[gameType] ?? [];

  return (
    <div className="space-y-4">
      {/* Status banner */}
      {bettingOpen ? (
        <div className="rounded-xl border border-agon-green/30 bg-agon-green/5 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-agon-green" />
            <span className="text-sm font-semibold text-agon-green">Betting Open</span>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Match starts</p>
            <p className="text-sm font-semibold text-foreground font-data">{timeUntil(startsAt)}</p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 px-4 py-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-amber-400" />
          <div>
            <p className="text-sm font-semibold text-amber-400">Betting Closed</p>
            <p className="text-xs text-muted-foreground">Match starts {timeUntil(startsAt)}</p>
          </div>
        </div>
      )}

      {/* VS banner — divider sits BETWEEN the two agent cards */}
      <div className="flex items-center gap-3">
        {agents.map((agent, i) => {
          const color = AGENT_COLORS[i];
          const total = agent.wins + agent.losses;
          const wr = total > 0 ? ((agent.wins / total) * 100).toFixed(0) : "—";
          const isMyBet = userBetAgentId === agent.id;

          const card = (
            <motion.div
              key={agent.id}
              whileHover={{ scale: bettingOpen ? 1.02 : 1 }}
              onMouseEnter={() => setHoveredAgent(agent.id)}
              onMouseLeave={() => setHoveredAgent(null)}
              className={cn(
                "flex-1 rounded-xl border p-4 cursor-default transition-all",
                color.border, color.bg,
                isMyBet && "ring-2 ring-agon-green/50",
                bettingOpen && !isMyBet && "cursor-pointer"
              )}
              onClick={() => bettingOpen && !userBetAgentId && onBet(agent.id)}
            >
              <div className="flex flex-col items-center gap-2 text-center">
                <div className={cn("h-12 w-12 rounded-full flex items-center justify-center", color.badge)}>
                  <Bot className="h-6 w-6 text-white" />
                </div>
                <p className={cn("font-bold text-sm", color.text)}>{agent.name}</p>
                <div className="text-xs text-muted-foreground">
                  <span className="font-data font-semibold text-foreground">{wr}</span>
                  {wr !== "—" && "%"} WR · {agent.wins}W {agent.losses}L
                </div>
                {isMyBet && (
                  <span className="rounded-full bg-agon-green/10 border border-agon-green/30 text-agon-green text-xs px-2 py-0.5 font-medium">
                    Your bet ✓
                  </span>
                )}
                {bettingOpen && !userBetAgentId && (
                  <span className={cn(
                    "text-xs font-medium transition-opacity",
                    hoveredAgent === agent.id ? "opacity-100" : "opacity-0",
                    color.text
                  )}>
                    Click to bet →
                  </span>
                )}
              </div>
            </motion.div>
          );

          // Interleave the VS divider between cards (not after the row)
          return i < agents.length - 1 ? (
            <div key={agent.id} className="contents">
              {card}
              <div className="flex flex-col items-center gap-1 shrink-0">
                <Swords className="h-5 w-5 text-muted-foreground" />
                <span className="text-xs font-bold text-muted-foreground">VS</span>
              </div>
            </div>
          ) : card;
        })}
      </div>

      {/* Bet buttons */}
      {bettingOpen && !userBetAgentId && (
        <div className="grid grid-cols-2 gap-2">
          {agents.map((agent, i) => {
            const color = AGENT_COLORS[i];
            return (
              <Button
                key={agent.id}
                onClick={() => onBet(agent.id)}
                className={cn(
                  "font-semibold h-10",
                  i === 0
                    ? "bg-blue-500 hover:bg-blue-600 text-white"
                    : "bg-orange-500 hover:bg-orange-600 text-white"
                )}
              >
                Bet on {agent.name}
              </Button>
            );
          })}
        </div>
      )}

      {bettingOpen && userBetAgentId && (
        <div className="rounded-lg border border-agon-green/20 bg-agon-green/5 px-4 py-3 text-sm text-center">
          <p className="text-agon-green font-medium">
            You&apos;re in! Betting on{" "}
            <span className="font-bold">{agents.find((a) => a.id === userBetAgentId)?.name}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Betting closes {timeUntil(bettingDeadline)}. Come back when the match starts to watch.
          </p>
        </div>
      )}

      {/* How it works */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
          <Trophy className="h-4 w-4 text-agon-green" />
          {gameTypeLabel(gameType)} · Best of 3 Rounds
        </h3>
        <ul className="space-y-1.5">
          {rules.map((rule, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <ChevronRight className="h-3 w-3 shrink-0 mt-0.5" />
              {rule}
            </li>
          ))}
        </ul>
      </div>

      {/* Payout info */}
      <div className="rounded-lg bg-surface-2 border border-border px-4 py-3 text-xs space-y-1">
        <p className="text-foreground font-medium mb-1.5">If your agent wins:</p>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Winning bettors receive</span>
          <span className="font-semibold text-agon-green">60% of pot (pro-rata)</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Winning agent owner</span>
          <span className="font-semibold text-foreground">30% of pot</span>
        </div>
        <p className="text-muted-foreground pt-1.5 border-t border-border">
          You must sign a transaction to claim your winnings after the match resolves.
        </p>
      </div>
    </div>
  );
}
