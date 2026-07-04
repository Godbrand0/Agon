"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { cn, gameTypeLabel, gameTypeBadgeColor, formatUSDC } from "@/lib/utils";
import GameplayViewer from "@/components/match/GameplayViewer";
import PreMatchPanel from "@/components/match/PreMatchPanel";
import BetModal from "@/components/betting/BetModal";
import ClaimCard from "@/components/betting/ClaimCard";
import NanoTicker from "@/components/economy/NanoTicker";
import type { Match, Round } from "@/lib/database.types";
import type { RoundResult } from "@/games/types";
import { useWallet } from "@/lib/wallet";

interface AgentInMatch {
  agent_id: string;
  final_score: number | null;
  agents: { id: string; name: string; wins: number; losses: number; registry_id: number | null };
}

interface MatchDetail extends Match {
  match_agents: AgentInMatch[];
  rounds: Round[];
  betsByAgent?: Record<string, number>;
}

export default function MatchPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const { address, connect } = useWallet();
  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [betModal, setBetModal] = useState<{ agentId: string; agentName: string } | null>(null);
  const [userBet, setUserBet] = useState<{ agentId: string; amount: number; won: boolean | null; claimed: boolean | null; betId: string } | null>(null);
  const [now, setNow] = useState(Date.now());

  async function fetchMatch() {
    const res = await fetch(`/api/matches/${matchId}`);
    if (res.ok) setMatch(await res.json());
    setLoading(false);
  }

  async function fetchUserBet(userAddress: string) {
    if (!userAddress) return;
    const res = await fetch(`/api/bets?matchId=${matchId}&userAddress=${userAddress}`);
    if (res.ok) {
      const data = await res.json();
      if (data?.length > 0) {
        const b = data[0];
        setUserBet({ agentId: b.agent_id, amount: b.amount, won: b.won, claimed: b.claimed, betId: b.id });
      }
    }
  }

  useEffect(() => {
    fetchMatch();
    const channel = supabase
      .channel(`match-${matchId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "rounds", filter: `match_id=eq.${matchId}` },
        () => fetchMatch())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${matchId}` },
        () => fetchMatch())
      .subscribe();
    const ticker = setInterval(() => setNow(Date.now()), 10_000);
    return () => { supabase.removeChannel(channel); clearInterval(ticker); };
  }, [matchId]);

  useEffect(() => {
    if (address) fetchUserBet(address);
  }, [address, matchId]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <span className="live-dot inline-block h-3 w-3 rounded-full bg-agon-green" />
      </div>
    );
  }

  if (!match) return <div className="text-center py-16 text-muted-foreground">Match not found.</div>;

  const isResolved  = match.state === "RESOLVED";
  const isLive      = match.state === "PLAYING";
  const isBettingOpen = match.state === "BETTING_OPEN" && now < new Date(match.betting_deadline).getTime();
  const bettingClosed = match.state === "BETTING_OPEN" && now >= new Date(match.betting_deadline).getTime();

  // Show gameplay viewer whenever betting is closed or match is live/resolved
  const showGameplay = isLive || isResolved || bettingClosed;

  const agents = match.match_agents.map((ma) => ({
    id:         ma.agent_id,
    name:       ma.agents?.name ?? ma.agent_id.slice(0, 8),
    wins:       ma.agents?.wins ?? 0,
    losses:     ma.agents?.losses ?? 0,
    registryId: ma.agents?.registry_id ?? null,
  }));

  const rounds: RoundResult[] = (match.rounds ?? []).map((r) => ({
    round:  r.round_number,
    scores: r.scores as Record<string, number>,
    events: r.events,
    state:  r.state as Record<string, unknown>,
    roundWinner: (r.state as Record<string, unknown>)?.roundWinner as string | undefined,
    roundDelta: (r.state as Record<string, unknown>)?.roundDelta as Record<string, number> | undefined,
  }));

  // Payout estimate for claim: user's share of 70% of pot
  const userAgentTotalBets = 1; // would come from betsByAgent, simplified here
  const estimatedPayout = userBet && match.total_pot > 0
    ? (userBet.amount / Math.max(userBet.amount, 1)) * (0.7 * match.total_pot)
    : 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <a href="/arena" className="text-xs text-muted-foreground hover:text-foreground transition-colors">← Arena</a>
        <span className="text-border">/</span>
        <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", gameTypeBadgeColor(match.game_type))}>
          {gameTypeLabel(match.game_type)}
        </span>
        {isLive && (
          <span className="flex items-center gap-1.5 text-xs text-agon-green font-medium">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-agon-green" /> Live
          </span>
        )}
        {isResolved && <span className="text-xs text-muted-foreground">Resolved</span>}
      </div>

      <h1 className="text-xl font-bold text-foreground mb-6">
        {agents.map((a) => a.name).join(" vs ")}
      </h1>

      {/* Claim card — shown when user has won and not claimed */}
      {isResolved && userBet?.won && !userBet.claimed && (
        <div className="mb-6">
          <ClaimCard
            betId={userBet.betId}
            matchId={match.id}
            contractMatchId={match.contract_match_id}
            agentName={agents.find((a) => a.id === userBet.agentId)?.name ?? ""}
            betAmount={userBet.amount}
            estimatedPayout={estimatedPayout}
            userAddress={address ?? "0xDemoUser"}
            onClaimed={() => fetchUserBet(address ?? "")}
          />
        </div>
      )}

      {/* Claimed confirmation */}
      {isResolved && userBet?.won && userBet.claimed && (
        <div className="mb-6 rounded-xl border border-agon-green/20 bg-agon-green/5 px-4 py-3 flex items-center gap-2 text-sm text-agon-green">
          ✓ You claimed {formatUSDC(estimatedPayout)} from this match.
        </div>
      )}

      {/* Lost banner */}
      {isResolved && userBet?.won === false && (
        <div className="mb-6 rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-muted-foreground">
          Your bet on {agents.find((a) => a.id === userBet.agentId)?.name} didn&apos;t win this time.
        </div>
      )}

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: gameplay or waiting state */}
        <div className="lg:col-span-2">
          {showGameplay ? (
            <GameplayViewer
              agents={agents}
              rounds={rounds}
              isLive={isLive}
              winnerId={match.winner_id}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-border py-16 text-center space-y-2">
              <p className="text-sm font-medium text-foreground">Match hasn&apos;t started yet</p>
              <p className="text-xs text-muted-foreground">
                Place your bet now. The gameplay feed will appear here when betting closes.
              </p>
            </div>
          )}
        </div>

        {/* Right: betting panel or post-match info */}
        <div className="space-y-4">
          {/* Connect wallet prompt */}
          {!address && (
            <div className="rounded-xl border border-border bg-surface p-4 text-center space-y-2">
              <p className="text-sm text-muted-foreground">Connect your wallet to place bets and claim winnings</p>
              <button
                onClick={connect}
                className="text-sm font-semibold text-agon-green hover:underline"
              >
                Connect Wallet →
              </button>
            </div>
          )}

          {/* Pre-match betting panel */}
          {(isBettingOpen || bettingClosed || (!isLive && !isResolved)) && (
            <PreMatchPanel
              agents={agents}
              gameType={match.game_type}
              startsAt={match.starts_at}
              bettingDeadline={match.betting_deadline}
              bettingOpen={isBettingOpen}
              onBet={(agentId) => {
                if (!address) { connect(); return; }
                const agent = agents.find((a) => a.id === agentId)!;
                setBetModal({ agentId, agentName: agent.name });
              }}
              userBetAgentId={userBet?.agentId ?? null}
            />
          )}

          {/* During / after match: agent profiles */}
          {(isLive || isResolved) && (
            <div className="rounded-xl border border-border bg-surface overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Competitors
              </div>
              <div className="divide-y divide-border">
                {agents.map((agent) => {
                  const total = agent.wins + agent.losses;
                  const wr = total > 0 ? ((agent.wins / total) * 100).toFixed(1) : "—";
                  const isWinner = match.winner_id === agent.id;
                  return (
                    <a
                      key={agent.id}
                      href={`/agents/${agent.id}`}
                      className="flex items-center justify-between px-4 py-3 hover:bg-surface-2 transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {agent.name} {isWinner && "🏆"}
                        </p>
                        <p className="text-xs text-muted-foreground">{agent.wins}W {agent.losses}L</p>
                      </div>
                      <span className="font-data text-sm font-semibold text-muted-foreground">
                        {wr}{wr !== "—" ? "% WR" : ""}
                      </span>
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {/* Live M2M fee feed for this match */}
          <NanoTicker matchId={match.id} />
        </div>
      </div>

      {/* Bet modal */}
      {betModal && (
        <BetModal
          open={!!betModal}
          onClose={() => setBetModal(null)}
          matchId={match.id}
          matchLabel={`${gameTypeLabel(match.game_type)} · ${agents.map((a) => a.name).join(" vs ")}`}
          agentId={betModal.agentId}
          agentRegistryId={agents.find((a) => a.id === betModal.agentId)?.registryId ?? null}
          agentName={betModal.agentName}
          contractMatchId={match.contract_match_id}
          totalPot={match.total_pot}
          totalBetsOnAgent={match.betsByAgent?.[betModal.agentId] ?? 0}
          userAddress={address ?? "0xDemoUser"}
        />
      )}
    </div>
  );
}

