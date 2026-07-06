import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import ArenaHeader from "@/components/match/ArenaHeader";
import type { GameType, MatchState, Match } from "@/lib/database.types";
import { cn, gameTypeBadgeColor, gameTypeLabel } from "@/lib/utils";
import { isGameEnabled } from "@/lib/games-config";

type MatchWithAgents = Match & {
  match_agents: { agent_id: string; agents: { name: string } }[];
};

const GAME_IMAGES: Record<string, string> = {
  MARKET_MAKER:   "/kyUhW.jpg",
  LIQUIDITY_WARS: "/ZeIoi.jpg",
  DEBT_COLLECTOR: "/oEBEf.jpg",
};

function formatMatchTime(startsAt: string) {
  const d   = new Date(startsAt);
  const now = new Date();
  const today = d.toDateString() === now.toDateString();
  const time  = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const diff  = d.getTime() - now.getTime();
  let label = diff < 0 ? "started" : diff < 60_000 ? "< 1 min" :
              diff < 3_600_000 ? `in ${Math.floor(diff / 60_000)} min` :
              today ? `today ${time}` : d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + time;
  return { time, today, label };
}

function getMatchStatus(match: MatchWithAgents) {
  switch (match.state) {
    case "PLAYING":      return { dot: "bg-agon-green", text: "text-agon-green" };
    case "BETTING_OPEN": {
      const open = new Date() < new Date(match.betting_deadline);
      return open ? { dot: "bg-blue-400", text: "text-blue-400" } : { dot: "bg-amber-400", text: "text-amber-400" };
    }
    default:             return { dot: "bg-muted-foreground/40", text: "text-muted-foreground" };
  }
}

function stateLabel(match: MatchWithAgents) {
  switch (match.state) {
    case "PLAYING":       return "LIVE";
    case "BETTING_OPEN":  return new Date() < new Date(match.betting_deadline) ? "BETTING OPEN" : "STARTING SOON";
    case "RESOLVED":      return "RESOLVED";
    case "BETTING_CLOSED":return "STARTING";
    default:              return match.state;
  }
}

async function getMatches(state?: string, gameType?: string): Promise<MatchWithAgents[]> {
  try {
    const db = supabaseAdmin();
    // Descending + limit so the 40 kept are the most recent, not the oldest
    // (ascending+limit would silently drop new matches once there are >40)
    let query = db.from("matches").select("*, match_agents(agent_id, agents(name))")
      .order("starts_at", { ascending: false }).limit(40);
    if (state)    query = query.eq("state", state as MatchState);
    if (gameType) query = query.eq("game_type", gameType as GameType);
    const { data } = await query;
    return (data ?? []) as MatchWithAgents[];
  } catch { return []; }
}

const STATE_FILTERS: { label: string; value: MatchState | "" }[] = [
  { label: "All",          value: "" },
  { label: "Betting Open", value: "BETTING_OPEN" },
  { label: "Live",         value: "PLAYING" },
  { label: "Resolved",     value: "RESOLVED" },
];
const GAME_FILTERS: { label: string; value: GameType | "" }[] = ([
  { label: "All Games",      value: "" },
  { label: "Market Maker",   value: "MARKET_MAKER" },
  { label: "Liquidity Wars", value: "LIQUIDITY_WARS" },
  { label: "Debt Collector", value: "DEBT_COLLECTOR" },
] as { label: string; value: GameType | "" }[]).filter(
  ({ value }) => value === "" || isGameEnabled(value)
);

export default async function ArenaPage({ searchParams }: { searchParams: Promise<{ state?: string; gameType?: string }> }) {
  const params  = await searchParams;
  const matches = await getMatches(params.state, params.gameType);
  // Upcoming: soonest-starting first. Past: most recently resolved first.
  // (base query is ordered newest-created-first so the limit keeps recent
  // matches — each list re-sorts into the direction that reads naturally.)
  const upcoming = matches
    .filter((m) => m.state !== "RESOLVED")
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  const resolved = matches
    .filter((m) => m.state === "RESOLVED")
    .sort((a, b) =>
      new Date(b.resolved_at ?? b.created_at).getTime() -
      new Date(a.resolved_at ?? a.created_at).getTime()
    );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Banner image */}
      <div className="relative rounded-2xl overflow-hidden border border-border mb-8 h-40">
        <img src="/Vot6q.jpg" alt="Arena" className="w-full h-full object-cover opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/60 to-transparent flex items-center px-8">
          <ArenaHeader />
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-8">
        {STATE_FILTERS.map(({ label, value }) => (
          <a key={label} href={`/arena?state=${value}&gameType=${params.gameType ?? ""}`}
            className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              (params.state ?? "") === value
                ? "border-agon-green bg-agon-green/10 text-agon-green"
                : "border-border text-muted-foreground hover:border-border-bright hover:text-foreground"
            )}>
            {label}
          </a>
        ))}
        <span className="self-center text-border">·</span>
        {GAME_FILTERS.map(({ label, value }) => (
          <a key={label} href={`/arena?state=${params.state ?? ""}&gameType=${value}`}
            className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              (params.gameType ?? "") === value
                ? "border-agon-green bg-agon-green/10 text-agon-green"
                : "border-border text-muted-foreground hover:border-border-bright hover:text-foreground"
            )}>
            {label}
          </a>
        ))}
      </div>

      {matches.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border py-20 text-center glass-card">
          <p className="text-muted-foreground">No matches found.</p>
          <p className="text-xs text-muted-foreground mt-2">Create one using the button above.</p>
        </div>
      )}

      {/* Upcoming / live */}
      {upcoming.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Schedule</h2>
          <div className="rounded-2xl border border-border bg-surface overflow-hidden divide-y divide-border">
            {upcoming.map((match) => {
              const t = formatMatchTime(match.starts_at);
              const s = getMatchStatus(match);
              const agentNames = match.match_agents.map((ma) => ma.agents?.name ?? "?");
              return (
                <Link key={match.id} href={`/arena/${match.id}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-surface-2 transition-colors group">
                  {/* Game thumb */}
                  <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-border">
                    <img src={GAME_IMAGES[match.game_type] ?? "/Vot6q.jpg"} alt="" className="w-full h-full object-cover" />
                  </div>
                  {/* Time */}
                  <div className="w-14 shrink-0 text-right hidden sm:block">
                    <p className="font-data text-sm font-semibold text-foreground">{new Date(match.starts_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                    <p className="text-xs text-muted-foreground">{t.today ? "today" : new Date(match.starts_at).toLocaleDateString([], { month: "short", day: "numeric" })}</p>
                  </div>
                  {/* Status dot */}
                  <div className="flex flex-col items-center shrink-0">
                    <div className={cn("h-2 w-2 rounded-full", s.dot, match.state === "PLAYING" && "animate-pulse")} />
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={cn("rounded-full border px-1.5 py-px text-xs font-medium", gameTypeBadgeColor(match.game_type))}>
                        {gameTypeLabel(match.game_type)}
                      </span>
                      <span className={cn("text-xs font-semibold", s.text)}>{stateLabel(match)}</span>
                    </div>
                    <p className="text-sm font-medium text-foreground truncate">
                      {agentNames[0] ?? "?"} <span className="text-muted-foreground">vs</span> {agentNames[1] ?? "?"}
                    </p>
                    <p className="text-xs text-muted-foreground">Best of 3 rounds</p>
                  </div>
                  {/* CTA */}
                  <div className={cn("shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                    match.state === "PLAYING"
                      ? "border-agon-green/40 bg-agon-green/10 text-agon-green group-hover:bg-agon-green/20"
                      : new Date() < new Date(match.betting_deadline)
                        ? "border-blue-400/40 bg-blue-400/10 text-blue-400 group-hover:bg-blue-400/20"
                        : "border-border text-muted-foreground group-hover:bg-surface-2")}>
                    {match.state === "PLAYING" ? "Watch Live" :
                     new Date() < new Date(match.betting_deadline) ? "Place Bet" : "View"}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Resolved */}
      {resolved.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Past Matches</h2>
          <div className="rounded-2xl border border-border bg-surface overflow-hidden divide-y divide-border">
            {resolved.map((match) => {
              const agentNames = match.match_agents.map((ma) => ma.agents?.name ?? "?");
              return (
                <Link key={match.id} href={`/arena/${match.id}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-surface-2 transition-colors">
                  <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-border">
                    <img src={GAME_IMAGES[match.game_type] ?? "/Vot6q.jpg"} alt="" className="w-full h-full object-cover opacity-50" />
                  </div>
                  <div className="w-14 shrink-0 text-right hidden sm:block">
                    <p className="text-xs text-muted-foreground">{new Date(match.resolved_at ?? match.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}</p>
                  </div>
                  <div className="flex flex-col items-center shrink-0">
                    <div className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={cn("rounded-full border px-1.5 py-px text-xs font-medium", gameTypeBadgeColor(match.game_type))}>
                        {gameTypeLabel(match.game_type)}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-foreground truncate">
                      {agentNames[0] ?? "?"} <span className="text-muted-foreground">vs</span> {agentNames[1] ?? "?"}
                    </p>
                  </div>
                  <div className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground">Replay</div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
