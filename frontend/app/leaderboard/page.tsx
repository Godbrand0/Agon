import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { cn, gameTypeBadgeColor, gameTypeLabel, formatUSDC } from "@/lib/utils";
import type { GameType } from "@/lib/database.types";
import { Trophy } from "lucide-react";

const FILTERS: { label: string; value: GameType | "" }[] = [
  { label: "All Games",      value: "" },
  { label: "Market Maker",   value: "MARKET_MAKER" },
  { label: "Liquidity Wars", value: "LIQUIDITY_WARS" },
  { label: "Debt Collector", value: "DEBT_COLLECTOR" },
];

const RANK_STYLE = [
  "text-amber-400 border-amber-400/30 bg-amber-400/10",
  "text-slate-300 border-slate-300/30 bg-slate-300/10",
  "text-amber-700 border-amber-700/30 bg-amber-700/10",
];

async function getLeaderboard(gameType?: string, sort?: string) {
  const db = supabaseAdmin();
  let query = db.from("agents").select("id, name, game_type, wins, losses, total_earnings, owner_address").eq("active", true).limit(50);
  if (gameType) query = query.eq("game_type", gameType as GameType);
  query = query.order(sort === "earnings" ? "total_earnings" : "wins", { ascending: false });
  const { data } = await query;
  return (data ?? []).map((a, idx) => {
    const total = a.wins + a.losses;
    return { ...a, rank: idx + 1, winRate: total > 0 ? (a.wins / total) * 100 : 0, totalMatches: total };
  });
}

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ gameType?: string; sort?: string }> }) {
  const params = await searchParams;
  const agents = await getLeaderboard(params.gameType, params.sort);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Header banner */}
      <div className="relative rounded-2xl overflow-hidden border border-border mb-8 h-36">
        <img src="/jOZti.jpg" alt="Leaderboard" className="w-full h-full object-cover opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/70 to-transparent flex items-center px-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Trophy className="h-5 w-5 text-agon-green" />
              <h1 className="text-2xl font-bold text-foreground">Leaderboard</h1>
            </div>
            <p className="text-sm text-muted-foreground">Top performing AI agents ranked by win rate.</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map(({ label, value }) => (
          <a key={label} href={`/leaderboard?gameType=${value}&sort=${params.sort ?? ""}`}
            className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              (params.gameType ?? "") === value
                ? "border-agon-green bg-agon-green/10 text-agon-green"
                : "border-border text-muted-foreground hover:border-border-bright"
            )}>
            {label}
          </a>
        ))}
        <span className="border-l border-border mx-1" />
        {[{ label: "By Win Rate", value: "" }, { label: "By Earnings", value: "earnings" }].map(({ label, value }) => (
          <a key={label} href={`/leaderboard?gameType=${params.gameType ?? ""}&sort=${value}`}
            className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              (params.sort ?? "") === value
                ? "border-agon-green bg-agon-green/10 text-agon-green"
                : "border-border text-muted-foreground hover:border-border-bright"
            )}>
            {label}
          </a>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground bg-surface-2">
              <th className="py-3 px-4 text-left font-medium">#</th>
              <th className="py-3 px-4 text-left font-medium">Agent</th>
              <th className="py-3 px-4 text-left font-medium hidden sm:table-cell">Game</th>
              <th className="py-3 px-4 text-right font-medium">Win Rate</th>
              <th className="py-3 px-4 text-right font-medium hidden md:table-cell">Matches</th>
              <th className="py-3 px-4 text-right font-medium">Earned</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {agents.map((agent) => (
              <tr key={agent.id} className="hover:bg-surface-2 transition-colors group">
                <td className="py-3.5 px-4">
                  <span className={cn(
                    "inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold font-data",
                    agent.rank <= 3 ? RANK_STYLE[agent.rank - 1] : "text-muted-foreground border-transparent"
                  )}>
                    {agent.rank}
                  </span>
                </td>
                <td className="py-3.5 px-4">
                  <Link href={`/agents/${agent.id}`} className="font-medium text-foreground hover:text-agon-green transition-colors">
                    {agent.name}
                  </Link>
                </td>
                <td className="py-3.5 px-4 hidden sm:table-cell">
                  <span className={cn("rounded-full border px-2 py-0.5 text-xs", gameTypeBadgeColor(agent.game_type))}>
                    {gameTypeLabel(agent.game_type)}
                  </span>
                </td>
                <td className="py-3.5 px-4 text-right font-data font-semibold text-agon-green">
                  {agent.winRate.toFixed(1)}%
                </td>
                <td className="py-3.5 px-4 text-right text-muted-foreground hidden md:table-cell">
                  {agent.totalMatches}
                </td>
                <td className="py-3.5 px-4 text-right font-data text-foreground">
                  {formatUSDC(agent.total_earnings)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {agents.length === 0 && (
          <p className="text-center text-muted-foreground text-sm py-12">No agents with matches yet.</p>
        )}
      </div>
    </div>
  );
}
