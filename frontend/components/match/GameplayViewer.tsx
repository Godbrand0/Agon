"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import type { RoundResult } from "@/games/types";
import { Bot, Trophy, Zap, ChevronRight } from "lucide-react";

interface Agent {
  id: string;
  name: string;
}

interface Props {
  agents: Agent[];
  rounds: RoundResult[];
  isLive: boolean;
  winnerId?: string | null;
}

const AGENT_COLORS = [
  { border: "border-blue-400/60", bg: "bg-blue-400/5", badge: "bg-blue-500", text: "text-blue-400", glow: "shadow-blue-500/20" },
  { border: "border-orange-400/60", bg: "bg-orange-400/5", badge: "bg-orange-500", text: "text-orange-400", glow: "shadow-orange-500/20" },
];

function ScorePip({ filled }: { filled: boolean }) {
  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      className={cn(
        "h-3 w-3 rounded-full border transition-colors",
        filled ? "bg-agon-green border-agon-green" : "bg-transparent border-border"
      )}
    />
  );
}

function ThinkingDots() {
  return (
    <span className="inline-flex gap-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-current inline-block"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </span>
  );
}

function RoundCard({
  round,
  agents,
  isActive,
  isPending,
}: {
  round: RoundResult;
  agents: Agent[];
  isActive: boolean;
  isPending: boolean;
}) {
  const reasoning = (round.state?.reasoning ?? {}) as Record<string, string>;
  const roundDelta = (round.roundDelta ?? {}) as Record<string, number>;
  const roundWinner = round.roundWinner ?? (round.state?.roundWinner as string | undefined);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={cn(
        "rounded-xl border overflow-hidden",
        isActive ? "border-agon-green/40 bg-agon-green/2" : "border-border bg-surface"
      )}
    >
      {/* Round header */}
      <div className={cn(
        "flex items-center justify-between px-4 py-2.5 border-b",
        isActive ? "border-agon-green/20 bg-agon-green/5" : "border-border bg-surface-2"
      )}>
        <div className="flex items-center gap-2">
          <span className="font-data font-bold text-sm text-foreground">Round {round.round}</span>
          {isActive && (
            <span className="flex items-center gap-1.5 text-xs text-agon-green">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-agon-green" />
              Live
            </span>
          )}
        </div>
        {roundWinner && !isActive && (
          <span className={cn(
            "flex items-center gap-1 text-xs font-semibold",
            agents[0]?.id === roundWinner ? AGENT_COLORS[0].text : AGENT_COLORS[1].text
          )}>
            <Trophy className="h-3 w-3" />
            {agents.find((a) => a.id === roundWinner)?.name} wins this round
          </span>
        )}
      </div>

      {isPending ? (
        <div className="px-4 py-6 flex items-center gap-3 text-sm text-muted-foreground">
          <div className="h-8 w-8 rounded-full bg-surface-2 border border-border flex items-center justify-center">
            <Bot className="h-4 w-4 text-muted-foreground" />
          </div>
          Waiting for previous round to finish…
        </div>
      ) : (
        <div className="p-4 space-y-4">
          {/* Agent reasoning blocks */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {agents.map((agent, i) => {
              const color = AGENT_COLORS[i];
              const agentReasoning = reasoning[agent.id];
              const delta = roundDelta[agent.id];
              const wonRound = roundWinner === agent.id;

              return (
                <div key={agent.id} className={cn(
                  "rounded-lg border p-3 space-y-2",
                  color.border, color.bg,
                  wonRound && "ring-1 ring-agon-green/30"
                )}>
                  <div className="flex items-center gap-2">
                    <div className={cn("h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold text-white", color.badge)}>
                      <Bot className="h-3.5 w-3.5" />
                    </div>
                    <span className={cn("text-sm font-semibold", color.text)}>{agent.name}</span>
                    {wonRound && <Trophy className="h-3.5 w-3.5 text-agon-green ml-auto" />}
                  </div>

                  {/* Reasoning */}
                  {agentReasoning ? (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-xs text-muted-foreground leading-relaxed italic"
                    >
                      &ldquo;{agentReasoning}&rdquo;
                    </motion.p>
                  ) : isActive ? (
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      Analyzing <ThinkingDots />
                    </p>
                  ) : null}

                  {/* Score delta */}
                  {delta !== undefined && (
                    <div className={cn(
                      "text-xs font-data font-bold",
                      delta >= 0 ? "text-agon-green" : "text-destructive"
                    )}>
                      {delta >= 0 ? "+" : ""}{delta.toFixed(2)} this round
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Events feed */}
          {round.events.length > 0 && (
            <div className="rounded-lg bg-background/60 border border-border p-3 space-y-1 font-data text-xs">
              {round.events.map((ev, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-start gap-1.5 text-muted-foreground"
                >
                  <ChevronRight className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground/50" />
                  {ev}
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

export default function GameplayViewer({ agents, rounds, isLive, winnerId }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isLive) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [rounds.length, isLive]);

  // Compute round wins from rounds data
  const roundWins: Record<string, number> = Object.fromEntries(agents.map((a) => [a.id, 0]));
  for (const r of rounds) {
    const winner = r.roundWinner ?? (r.state?.roundWinner as string | undefined);
    if (winner) roundWins[winner] = (roundWins[winner] ?? 0) + 1;
  }

  if (rounds.length === 0 && !isLive) {
    return (
      <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
        Match has not started yet. Check back soon.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Score header */}
      <div className="rounded-xl border border-border bg-surface px-4 py-3">
        <div className="flex items-center justify-between">
          {agents.map((agent, i) => {
            const color = AGENT_COLORS[i];
            const wins = roundWins[agent.id] ?? 0;
            const isWinner = winnerId === agent.id;
            return (
              <div key={agent.id} className={cn("flex items-center gap-2", i === 1 && "flex-row-reverse")}>
                <div className={cn("h-8 w-8 rounded-full flex items-center justify-center", color.badge)}>
                  <Bot className="h-4 w-4 text-white" />
                </div>
                <div className={cn(i === 1 && "text-right")}>
                  <p className={cn("text-sm font-semibold", isWinner ? "text-agon-green" : "text-foreground")}>
                    {agent.name} {isWinner && "🏆"}
                  </p>
                  <div className={cn("flex gap-1 mt-0.5", i === 1 && "justify-end")}>
                    {[0, 1, 2].map((j) => <ScorePip key={j} filled={j < wins} />)}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Center */}
          <div className="text-center">
            <p className="font-data font-black text-2xl text-foreground">
              {roundWins[agents[0]?.id] ?? 0} : {roundWins[agents[1]?.id] ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">Best of 3</p>
          </div>
        </div>
      </div>

      {/* Round cards */}
      <AnimatePresence>
        {rounds.map((round, idx) => (
          <RoundCard
            key={round.round}
            round={round}
            agents={agents}
            isActive={isLive && idx === rounds.length - 1}
            isPending={false}
          />
        ))}
      </AnimatePresence>

      {/* Waiting for next round */}
      {isLive && rounds.length < 3 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-xl border border-dashed border-border p-6 flex items-center gap-3"
        >
          <div className="h-9 w-9 rounded-full bg-surface-2 border border-border flex items-center justify-center">
            <Zap className="h-4 w-4 text-agon-green" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              Round {rounds.length + 1} of 3
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
              Agents are making their moves <ThinkingDots />
            </p>
          </div>
        </motion.div>
      )}

      {/* Match verdict */}
      {winnerId && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-xl border border-agon-green/40 bg-agon-green/5 p-5 text-center"
        >
          <Trophy className="h-8 w-8 text-agon-green mx-auto mb-2" />
          <p className="font-bold text-lg text-agon-green">
            {agents.find((a) => a.id === winnerId)?.name} wins!
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {roundWins[winnerId]} – {Object.values(roundWins).find((v) => v !== roundWins[winnerId]) ?? 0} rounds
          </p>
        </motion.div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
