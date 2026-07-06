"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/wallet";
import ClaimCard from "@/components/betting/ClaimCard";
import { cn, gameTypeLabel, gameTypeBadgeColor, formatUSDC } from "@/lib/utils";
import { Wallet, Trophy, Clock, CheckCircle, XCircle } from "lucide-react";

interface BetWithMatch {
  id: string;
  match_id: string;
  agent_id: string;
  amount: number;
  payout: number | null;
  won: boolean | null;
  claimed: boolean | null;
  placed_at: string;
  matches: {
    id: string;
    game_type: string;
    state: string;
    starts_at: string;
    total_pot: number;
    contract_match_id: number | null;
    match_agents: { agent_id: string; agents: { name: string } }[];
  };
}

async function fetchBets(userAddress: string): Promise<BetWithMatch[]> {
  const res = await fetch(
    `/api/bets?userAddress=${userAddress}&include=match`,
    { cache: "no-store" }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

function agentName(bet: BetWithMatch): string {
  return bet.matches?.match_agents?.find((ma) => ma.agent_id === bet.agent_id)?.agents?.name ?? bet.agent_id.slice(0, 8);
}

export default function ProfilePage() {
  const { address, isConnected, connect, isConnecting, WalletModal } = useWallet();
  const [bets, setBets] = useState<BetWithMatch[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!address) return;
    setLoading(true);
    setBets(await fetchBets(address));
    setLoading(false);
  }

  useEffect(() => { load(); }, [address]);

  if (!isConnected) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center space-y-4">
        <Wallet className="h-10 w-10 text-muted-foreground mx-auto" />
        <h1 className="text-xl font-bold text-foreground">Connect Your Wallet</h1>
        <p className="text-sm text-muted-foreground">Connect your wallet to see your bets, unclaimed winnings, and history.</p>
        <button
          onClick={connect}
          disabled={isConnecting}
          className="inline-flex items-center gap-2 rounded-lg bg-agon-green/10 border border-agon-green/30 px-5 py-2.5 text-sm font-semibold text-agon-green hover:bg-agon-green/20 transition-colors"
        >
          <Wallet className="h-4 w-4" /> {isConnecting ? "Connecting…" : "Connect Wallet"}
        </button>
      </div>
    );
  }

  const unclaimed = bets.filter((b) => b.won === true && b.claimed === false && b.matches.state === "RESOLVED");
  const active    = bets.filter((b) => b.won === null && b.matches.state !== "RESOLVED");
  const claimed   = bets.filter((b) => b.claimed === true);
  const lost      = bets.filter((b) => b.won === false);

  const totalBet    = bets.reduce((s, b) => s + b.amount, 0);
  const totalClaimed = claimed.reduce((s, b) => s + (b.payout ?? 0), 0);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground mb-1">My Profile</h1>
        <p className="text-xs text-muted-foreground font-data">
          {address?.slice(0, 10)}…{address?.slice(-6)}
        </p>

        {/* Stats */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            { label: "Total Bet", value: formatUSDC(totalBet) },
            { label: "Matches",   value: String(bets.length) },
            { label: "Claimed",   value: formatUSDC(totalClaimed) },
          ].map(({ label, value }) => (
            <div key={label} className="glass-card rounded-xl p-4 text-center hover:border-border-bright transition-colors">
              <p className="font-data text-xl font-bold text-foreground">{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {loading && (
        <p className="text-sm text-muted-foreground text-center py-8">Loading your bets…</p>
      )}

      {/* Unclaimed winnings */}
      {unclaimed.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
            <Trophy className="h-4 w-4 text-agon-green" />
            Unclaimed Winnings
            <span className="ml-1 rounded-full bg-agon-green/10 border border-agon-green/20 text-agon-green text-xs px-1.5 py-px font-data">
              {unclaimed.length}
            </span>
          </h2>
          <div className="space-y-3">
            {unclaimed.map((bet) => {
              const totalPot = bet.matches.total_pot;
              const estimatedPayout = totalPot > 0 ? bet.amount * 0.6 : 0; // simplified
              return (
                <div key={bet.id} className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                    <span className={cn("rounded-full border px-1.5 py-px font-medium", gameTypeBadgeColor(bet.matches.game_type))}>
                      {gameTypeLabel(bet.matches.game_type)}
                    </span>
                    <Link href={`/arena/${bet.match_id}`} className="hover:text-foreground hover:underline truncate">
                      View match →
                    </Link>
                  </div>
                  <ClaimCard
                    betId={bet.id}
                    matchId={bet.match_id}
                    contractMatchId={bet.matches.contract_match_id}
                    agentName={agentName(bet)}
                    betAmount={bet.amount}
                    estimatedPayout={estimatedPayout}
                    userAddress={address!}
                    onClaimed={load}
                  />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Active bets */}
      {active.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-amber-400" />
            Active Bets
          </h2>
          <div className="glass-card rounded-2xl divide-y divide-border overflow-hidden">
            {active.map((bet) => (
              <Link
                key={bet.id}
                href={`/arena/${bet.match_id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-surface-2 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={cn("rounded-full border px-1.5 py-px text-xs font-medium", gameTypeBadgeColor(bet.matches.game_type))}>
                      {gameTypeLabel(bet.matches.game_type)}
                    </span>
                    <span className="text-xs text-amber-400 font-medium">
                      {bet.matches.state === "PLAYING" ? "Live" : "Betting open"}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-foreground">On: {agentName(bet)}</p>
                </div>
                <div className="text-right">
                  <p className="font-data font-semibold text-foreground">{formatUSDC(bet.amount)}</p>
                  <p className="text-xs text-muted-foreground">bet</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Claimed history */}
      {claimed.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
            <CheckCircle className="h-4 w-4 text-agon-green" />
            Claimed History
          </h2>
          <div className="glass-card rounded-2xl divide-y divide-border overflow-hidden">
            {claimed.map((bet) => (
              <Link
                key={bet.id}
                href={`/arena/${bet.match_id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-surface-2 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={cn("rounded-full border px-1.5 py-px text-xs font-medium", gameTypeBadgeColor(bet.matches.game_type))}>
                      {gameTypeLabel(bet.matches.game_type)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(bet.placed_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-foreground">Won on: {agentName(bet)}</p>
                </div>
                <div className="text-right">
                  <p className="font-data font-semibold text-agon-green">{formatUSDC(bet.payout ?? 0)}</p>
                  <p className="text-xs text-muted-foreground">claimed</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Lost bets */}
      {lost.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
            <XCircle className="h-4 w-4 text-muted-foreground" />
            Lost Bets
          </h2>
          <div className="glass-card rounded-2xl divide-y divide-border overflow-hidden opacity-70">
            {lost.map((bet) => (
              <Link
                key={bet.id}
                href={`/arena/${bet.match_id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-surface-2 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={cn("rounded-full border px-1.5 py-px text-xs font-medium", gameTypeBadgeColor(bet.matches.game_type))}>
                      {gameTypeLabel(bet.matches.game_type)}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-foreground">On: {agentName(bet)}</p>
                </div>
                <div className="text-right">
                  <p className="font-data font-semibold text-muted-foreground">-{formatUSDC(bet.amount)}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {!loading && bets.length === 0 && (
        <div className="glass-card rounded-2xl py-16 text-center">
          <p className="text-muted-foreground text-sm mb-4">No bets yet.</p>
          <Link href="/arena">
            <button className="rounded-md border border-agon-green/20 bg-agon-green/10 text-agon-green px-4 py-2 text-sm font-medium hover:bg-agon-green/20 transition-colors">
              Browse open matches
            </button>
          </Link>
        </div>
      )}
      {WalletModal}
    </div>
  );
}
