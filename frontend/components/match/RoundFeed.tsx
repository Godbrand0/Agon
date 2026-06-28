"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { RoundResult } from "@/games/types";

interface Props {
  rounds: RoundResult[];
}

export default function RoundFeed({ rounds }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [rounds.length]);

  if (rounds.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        Waiting for match to start…
      </div>
    );
  }

  return (
    <div className="overflow-y-auto max-h-[480px] space-y-3 pr-1">
      <AnimatePresence initial={false}>
        {rounds.map((round) => (
          <motion.div
            key={round.round}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="rounded-lg border border-border bg-surface-2 p-3"
          >
            <p className="mb-2 text-xs font-semibold text-muted-bright uppercase tracking-wide">
              Round {round.round}
            </p>
            <div className="space-y-1 font-data text-xs text-muted-foreground">
              {round.events.map((event, i) => (
                <p key={i} className={event.startsWith("News:") || event.startsWith("Market:") || event.startsWith("Price") ? "text-amber-400" : ""}>
                  {event}
                </p>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-2 border-t border-border pt-2">
              {Object.entries(round.scores).map(([agentId, score]) => (
                <span key={agentId} className="text-xs">
                  <span className="text-muted-foreground">{agentId.slice(0, 8)}: </span>
                  <span className={cn("font-semibold", score >= 0 ? "text-agon-green" : "text-destructive")}>
                    {score >= 0 ? "+" : ""}{score.toFixed(4)}
                  </span>
                </span>
              ))}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
      <div ref={bottomRef} />
    </div>
  );
}

function cn(...c: (string | boolean | undefined)[]) {
  return c.filter(Boolean).join(" ");
}
