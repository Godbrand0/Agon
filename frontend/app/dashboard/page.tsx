"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "@/lib/supabase";
import { useWallet } from "@/lib/wallet";
import { cn, gameTypeBadgeColor, gameTypeLabel, formatUSDC } from "@/lib/utils";
import AgentCard from "@/components/agent/AgentCard";
import { Button } from "@/components/ui/button";
import { Wallet, Loader2, ArrowRight } from "lucide-react";

type DashboardData = {
  agents: any[];
  bets: any[];
  stats: {
    totalBetted: number;
    totalPayout: number;
    profit: number;
    betsPlaced: number;
    wins: number;
    losses: number;
    winRate: number;
  };
};

export default function DashboardPage() {
  const { address, isConnected, connect, isConnecting, WalletModal } = useWallet();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async (addr: string) => {
    setLoading(true);
    try {
      const lowerAddr = addr.toLowerCase();
      const [agentsResult, betsResult] = await Promise.all([
        // explicit columns — api_token is column-revoked for the browser, so `*` would fail
        supabase.from("agents").select("id, name, game_type, owner_address, wallet_address, registry_id, status, wins, losses, total_earnings, active, created_at").eq("owner_address", lowerAddr).order("created_at", { ascending: false }),
        supabase.from("bets")
          .select("*, agents(name, game_type), matches(id, state, game_type, winner_id)")
          .eq("user_address", lowerAddr)
          .order("placed_at", { ascending: false })
          .limit(20),
      ]);

      const bets = betsResult.data ?? [];
      const totalBetted = bets.reduce((s, b) => s + b.amount, 0);
      const resolved = bets.filter((b) => b.won !== null);
      const totalPayout = resolved.reduce((s, b) => s + (b.payout ?? 0), 0);
      const wins = resolved.filter((b) => b.won).length;

      setData({
        agents: agentsResult.data ?? [],
        bets,
        stats: {
          totalBetted,
          totalPayout,
          profit: totalPayout - resolved.reduce((s, b) => s + b.amount, 0),
          betsPlaced: bets.length,
          wins,
          losses: resolved.length - wins,
          winRate: resolved.length > 0 ? (wins / resolved.length) * 100 : 0,
        },
      });
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isConnected && address) {
      loadData(address);
    } else {
      setData(null);
    }
  }, [isConnected, address, loadData]);

  if (!isConnected) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-20 flex flex-col items-center justify-center text-center">
        <div className="mb-6 h-20 w-20 rounded-full bg-surface-2 border border-border flex items-center justify-center">
          <Wallet className="h-8 w-8 text-muted-foreground" />
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-3">Connect your wallet</h1>
        <p className="text-muted-foreground mb-8 max-w-sm">
          Connect your Circle wallet to view your registered agents, match history, and betting payouts.
        </p>
        <Button onClick={connect} disabled={isConnecting} className="bg-agon-green text-background hover:bg-agon-green-dim font-semibold px-8 h-12 text-base glow-green transition-all hover:scale-[1.03]">
          {isConnecting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Connecting...</> : "Connect Wallet"}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
          <Wallet className="h-4 w-4" />
          <span className="font-data bg-surface-2 px-2 py-0.5 rounded-md border border-border">{address}</span>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {loading && !data ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="py-20 flex justify-center"
          >
            <Loader2 className="h-8 w-8 animate-spin text-agon-green" />
          </motion.div>
        ) : data ? (
          <motion.div
            key="content"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
              {[
                { label: "Total Betted",  value: formatUSDC(data.stats.totalBetted) },
                { label: "Total Payout",  value: formatUSDC(data.stats.totalPayout) },
                { label: "Net Profit",    value: formatUSDC(data.stats.profit), highlight: data.stats.profit > 0 },
                { label: "Bet Win Rate",  value: `${data.stats.winRate.toFixed(1)}%`, highlight: data.stats.winRate >= 50 },
              ].map(({ label, value, highlight }) => (
                <div key={label} className="glass-card rounded-2xl p-5 hover:border-border-bright transition-colors">
                  <p className={cn("font-data text-2xl font-black mb-1", highlight ? "text-agon-green" : "text-foreground")}>{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>

            {/* My Agents */}
            <div className="mb-12">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-foreground">My Agents</h2>
                <Link href="/agents/register">
                  <Button size="sm" className="bg-surface-2 text-foreground hover:bg-surface border border-border">Register New</Button>
                </Link>
              </div>
              {data.agents.length === 0 ? (
                <div className="glass-card rounded-2xl py-12 text-center text-muted-foreground text-sm flex flex-col items-center">
                  <p className="mb-4">You haven't registered any agents yet.</p>
                  <Link href="/agents/register">
                    <Button variant="outline" className="border-agon-green text-agon-green hover:bg-agon-green/10">Register Agent <ArrowRight className="ml-2 h-4 w-4" /></Button>
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {data.agents.map((agent) => <AgentCard key={agent.id} agent={agent} />)}
                </div>
              )}
            </div>

            {/* My Bets */}
            <div>
              <h2 className="text-xl font-bold text-foreground mb-4">Recent Bets</h2>
              {data.bets.length === 0 ? (
                <div className="glass-card rounded-2xl py-12 text-center text-muted-foreground text-sm flex flex-col items-center">
                  <p className="mb-4">No betting history found.</p>
                  <Link href="/arena">
                    <Button variant="outline" className="border-blue-400 text-blue-400 hover:bg-blue-400/10">Browse Arena <ArrowRight className="ml-2 h-4 w-4" /></Button>
                  </Link>
                </div>
              ) : (
                <div className="rounded-2xl border border-border bg-surface overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted-foreground bg-surface-2">
                        <th className="py-3 px-5 text-left font-medium">Agent</th>
                        <th className="py-3 px-5 text-left font-medium hidden sm:table-cell">Match</th>
                        <th className="py-3 px-5 text-right font-medium">Bet</th>
                        <th className="py-3 px-5 text-right font-medium">Result</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.bets.map((bet) => {
                        const agent = bet.agents as { name: string; game_type: string } | null;
                        const match = bet.matches as { id: string; state: string } | null;
                        return (
                          <tr key={bet.id} className="hover:bg-surface-2 transition-colors">
                            <td className="py-4 px-5">
                              <p className="font-medium text-foreground">{agent?.name ?? "—"}</p>
                              {agent && (
                                <span className={cn("text-[10px] uppercase font-bold tracking-wider rounded-full border px-2 py-0.5 mt-1 inline-block", gameTypeBadgeColor(agent.game_type))}>
                                  {gameTypeLabel(agent.game_type)}
                                </span>
                              )}
                            </td>
                            <td className="py-4 px-5 hidden sm:table-cell">
                              {match ? (
                                <Link href={`/arena/${match.id}`} className="text-muted-foreground hover:text-foreground transition-colors text-xs flex items-center gap-1">
                                  View Match <ArrowRight className="h-3 w-3" />
                                </Link>
                              ) : "—"}
                            </td>
                            <td className="py-4 px-5 text-right font-data font-medium text-foreground">
                              {formatUSDC(bet.amount)}
                            </td>
                            <td className="py-4 px-5 text-right">
                              {bet.won === null ? (
                                <span className="inline-flex items-center px-2 py-1 rounded-md bg-surface-2 border border-border text-muted-foreground text-xs font-semibold">Pending</span>
                              ) : bet.won ? (
                                <div className="inline-flex flex-col items-end">
                                  <span className="text-agon-green font-black text-xs">WON</span>
                                  {bet.payout && <p className="font-data text-xs text-agon-green">+{formatUSDC(bet.payout)}</p>}
                                </div>
                              ) : (
                                <span className="inline-flex items-center px-2 py-1 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs font-bold">LOST</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {WalletModal}
    </div>
  );
}
