"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { X, CheckCircle, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, gameTypeBadgeColor, gameTypeLabel } from "@/lib/utils";
import type { GameType } from "@/lib/database.types";
import { ALL_GAMES, isGameEnabled } from "@/lib/games-config";

const GAME_TYPES: GameType[] = ALL_GAMES;

// All engines run best-of-3 (see totalRounds in games/*/engine.ts)
const GAME_META: Record<GameType, { rounds: number; desc: string }> = {
  MARKET_MAKER:   { rounds: 3, desc: "Bid/ask spread competition on a synthetic asset with newsflow." },
  LIQUIDITY_WARS: { rounds: 3, desc: "AMM liquidity provision — earn fees, minimize impermanent loss." },
  DEBT_COLLECTOR: { rounds: 3, desc: "Undercollateralized loan management under volatile market conditions." },
};

interface AgentOption {
  id: string;
  name: string;
  game_type: GameType;
  wins: number;
  losses: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CreateMatchModal({ open, onClose }: Props) {
  const router = useRouter();
  const [gameType, setGameType] = useState<GameType>("MARKET_MAKER");
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoadingAgents(true);
    fetch(`/api/agents?gameType=${gameType}`)
      .then((r) => r.json())
      .then((data) => { setAgents(Array.isArray(data) ? data : []); setSelectedIds([]); })
      .finally(() => setLoadingAgents(false));
  }, [open, gameType]);

  function toggleAgent(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 4 ? [...prev, id] : prev
    );
  }

  async function handleCreate() {
    if (selectedIds.length < 2) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameType, agentIds: selectedIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create match");
      onClose();
      router.push(`/arena/${data.id}`);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  const meta = GAME_META[gameType];

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-bold text-foreground">Create Match</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Select a game type and 2–4 agents</p>
              </div>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Game Type */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-foreground mb-2">Game Type</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {GAME_TYPES.map((type) => {
                  const locked = !isGameEnabled(type);
                  return (
                    <button
                      key={type}
                      disabled={locked}
                      onClick={() => !locked && setGameType(type)}
                      title={locked ? "Coming soon" : undefined}
                      className={cn(
                        "rounded-lg border p-2.5 text-left transition-all",
                        locked
                          ? "border-border opacity-40 cursor-not-allowed"
                          : gameType === type ? "border-agon-green bg-agon-green/5" : "border-border hover:border-border-bright"
                      )}
                    >
                      <span className={cn("rounded-full border px-1.5 py-0.5 text-xs font-medium block mb-1", gameTypeBadgeColor(type))}>
                        {gameTypeLabel(type)}
                      </span>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        {locked ? (<><Lock className="h-3 w-3" /> Coming soon</>) : `${GAME_META[type].rounds} rounds`}
                      </p>
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{meta.desc}</p>
            </div>

            {/* Agent selection */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-foreground">
                  Select Agents
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">(exactly 2 agents, same game type)</span>
                </label>
                <span className={cn("text-xs font-semibold", selectedIds.length === 2 ? "text-agon-green" : "text-muted-foreground")}>
                  {selectedIds.length}/2
                </span>
              </div>

              {loadingAgents ? (
                <div className="h-24 flex items-center justify-center text-sm text-muted-foreground">Loading agents…</div>
              ) : agents.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  No {gameTypeLabel(gameType)} agents found.{" "}
                  <a href="/agents/register" className="text-agon-green hover:underline">Register one →</a>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {agents.map((agent) => {
                    const selected = selectedIds.includes(agent.id);
                    const total = agent.wins + agent.losses;
                    const wr = total > 0 ? ((agent.wins / total) * 100).toFixed(0) : "—";
                    return (
                      <button
                        key={agent.id}
                        onClick={() => toggleAgent(agent.id)}
                        disabled={!selected && selectedIds.length >= 2}
                        className={cn(
                          "w-full flex items-center justify-between rounded-lg border p-2.5 text-left transition-all",
                          selected ? "border-agon-green bg-agon-green/5" : "border-border hover:border-border-bright",
                          !selected && selectedIds.length >= 2 && "opacity-40 cursor-not-allowed"
                        )}
                      >
                        <div>
                          <p className="text-sm font-medium text-foreground">{agent.name}</p>
                          <p className="text-xs text-muted-foreground">{agent.wins}W {agent.losses}L · {wr}% WR</p>
                        </div>
                        <div className={cn(
                          "h-5 w-5 rounded-full border flex items-center justify-center transition-colors",
                          selected ? "border-agon-green bg-agon-green" : "border-border"
                        )}>
                          {selected && <CheckCircle className="h-3 w-3 text-background" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Scheduling info */}
            <div className="mb-5 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-xs text-muted-foreground space-y-0.5">
              <p className="text-foreground font-medium">Automatic scheduling</p>
              <p>Matches are staggered 20 minutes apart so no two games overlap. Betting closes 2 minutes before each match starts.</p>
            </div>

            {error && <p className="mb-3 text-xs text-destructive">{error}</p>}

            <Button
              onClick={handleCreate}
              disabled={loading || selectedIds.length < 2}
              className="w-full bg-agon-green text-background hover:bg-agon-green-dim font-semibold"
            >
              {loading ? "Scheduling Match…" : selectedIds.length < 2 ? "Select 2 agents to continue" : "Create Match"}
            </Button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
