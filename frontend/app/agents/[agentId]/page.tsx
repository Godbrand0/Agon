import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { cn, gameTypeBadgeColor, gameTypeLabel, shortenAddress, formatUSDC } from "@/lib/utils";
import FuelAgentCard from "@/components/economy/FuelAgentCard";
import CopyableAddress from "@/components/agent/CopyableAddress";
import { modelDisplayName } from "@/agents/runtime";
import { Cpu } from "lucide-react";

async function getAgent(agentId: string) {
  const db = supabaseAdmin();
  const { data: agent } = await db.from("agents").select("*").eq("id", agentId).single();
  if (!agent) return null;

  const { data: matchAgents } = await db
    .from("match_agents")
    .select("*, matches(id, state, game_type, resolved_at, winner_id)")
    .eq("agent_id", agentId)
    .order("matches(resolved_at)", { ascending: false })
    .limit(10);

  return { agent, recentMatches: matchAgents ?? [] };
}

export default async function AgentProfilePage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  const data = await getAgent(agentId);
  if (!data) notFound();

  const { agent, recentMatches } = data;
  const total = agent.wins + agent.losses;
  const winRate = total > 0 ? (agent.wins / total) * 100 : 0;
  const avgEarnings = total > 0 ? agent.total_earnings / total : 0;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Profile header */}
      <div className="rounded-xl border border-border bg-surface p-6 mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{agent.name}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Owner: <span className="font-data">{shortenAddress(agent.owner_address)}</span>
            </p>
            <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs text-muted-foreground">
              <Cpu className="h-3 w-3 text-agon-green" />
              Runs on <span className="font-medium text-foreground">{modelDisplayName(agent.model)}</span>
            </p>
          </div>
          <span className={cn("rounded-full border px-3 py-1 text-sm font-medium", gameTypeBadgeColor(agent.game_type))}>
            {gameTypeLabel(agent.game_type)}
          </span>
        </div>

        {/* Agent's own operating wallet — pays nanopayments (entry/oracle/action fees) */}
        <div className="border-t border-border pt-3 mb-1">
          <p className="text-xs text-muted-foreground mb-1">Agent Wallet (Arc Testnet)</p>
          <CopyableAddress address={agent.wallet_address} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-border pt-4">
          <Stat label="Wins"       value={agent.wins} />
          <Stat label="Losses"     value={agent.losses} />
          <Stat label="Win Rate"   value={`${winRate.toFixed(1)}%`} highlight={winRate >= 60} />
          <Stat label="Total Earned" value={formatUSDC(agent.total_earnings)} />
        </div>

        <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-border">
          <Stat label="Matches Played" value={total} />
          <Stat label="Avg per Match"  value={formatUSDC(avgEarnings)} />
        </div>
      </div>

      {/* Fuel stream — stream micropayments into the agent's operating wallet */}
      <div className="mb-6">
        <FuelAgentCard agentId={agent.id} agentName={agent.name} agentWallet={agent.wallet_address} />
      </div>

      {/* Recent matches */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-semibold text-foreground text-sm">Recent Matches</h2>
        </div>

        {recentMatches.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">No matches yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {recentMatches.map((ma) => {
              const match = ma.matches as { id: string; state: string; game_type: string; winner_id: string | null };
              if (!match) return null;
              const won = match.winner_id === agentId;
              const isResolved = match.state === "RESOLVED";
              return (
                <Link
                  key={ma.match_id}
                  href={`/arena/${match.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-surface-2 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{gameTypeLabel(match.game_type)}</p>
                    <p className="text-xs text-muted-foreground">{match.state}</p>
                  </div>
                  {isResolved && (
                    <div className="text-right">
                      <span className={cn("text-sm font-semibold", won ? "text-agon-green" : "text-muted-foreground")}>
                        {won ? "WON" : "LOST"}
                      </span>
                      {ma.earnings > 0 && (
                        <p className="text-xs text-agon-green">+{formatUSDC(ma.earnings)}</p>
                      )}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div>
      <p className={cn("font-data text-xl font-bold", highlight ? "text-agon-green" : "text-foreground")}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
