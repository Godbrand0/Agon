"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { cn, gameTypeBadgeColor, gameTypeLabel, timeUntil, formatUSDC } from "@/lib/utils";
import { calculateImpliedOdds } from "@/lib/odds";
import { ArrowRight } from "lucide-react";
import type { Match } from "@/lib/database.types";

interface AgentInMatch {
  agent_id: string;
  agents: { name: string; wins: number; losses: number };
}

interface Props {
  match: Match & { match_agents: AgentInMatch[] };
  betsByAgent?: Record<string, number>;
}

const STATE_LABEL: Record<string, string> = {
  BETTING_OPEN:   "Betting Open",
  BETTING_CLOSED: "Starting Soon",
  PLAYING:        "Live",
  RESOLVED:       "Resolved",
  CANCELLED:      "Cancelled",
};

export default function MatchCard({ match, betsByAgent = {} }: Props) {
  const isLive = match.state === "PLAYING";
  const isBetting = match.state === "BETTING_OPEN";
  const totalPot = match.total_pot;

  return (
    <Link href={`/arena/${match.id}`}>
      <motion.div
        whileHover={{ y: -3, scale: 1.01 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className={cn(
          "glass-card rounded-2xl p-5 transition-all duration-200 flex flex-col gap-4",
          isLive   ? "border-agon-green/30 glow-green" : "hover:border-border-bright"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium", gameTypeBadgeColor(match.game_type))}>
            {gameTypeLabel(match.game_type)}
          </span>

          <div className="flex items-center gap-1.5">
            {isLive && <span className="live-dot h-2 w-2 rounded-full bg-agon-green" />}
            <span className={cn(
              "text-xs font-semibold",
              isLive ? "text-agon-green" : isBetting ? "text-blue-400" : "text-muted-foreground"
            )}>
              {STATE_LABEL[match.state] ?? match.state}
            </span>
          </div>
        </div>

        {/* Agents */}
        <div className="space-y-2.5">
          {match.match_agents.map(({ agent_id, agents: agent }) => {
            const totalBets = betsByAgent[agent_id] ?? 0;
            const odds = calculateImpliedOdds(totalPot, totalBets);
            const total = agent.wins + agent.losses;
            const wr = total > 0 ? ((agent.wins / total) * 100).toFixed(0) : "—";

            return (
              <div key={agent_id} className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium text-foreground">{agent.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{wr}% WR</span>
                </div>
                <div className="text-right">
                  <span className="font-data font-semibold text-agon-green">{odds > 0 ? `${odds.toFixed(2)}x` : "—"}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground">{formatUSDC(totalBets)}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground mt-auto">
          <span>Pot: <span className="font-data font-medium text-foreground">{formatUSDC(totalPot)}</span></span>
          <div className="flex items-center gap-1 text-agon-green font-medium">
            {match.state === "BETTING_OPEN" ? `Closes ${timeUntil(match.betting_deadline)}` :
             match.state === "RESOLVED" ? "Resolved" : "View Match"}
            <ArrowRight className="h-3 w-3" />
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
