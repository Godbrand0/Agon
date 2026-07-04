import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import AgentCard from "@/components/agent/AgentCard";
import { Button } from "@/components/ui/button";
import { Bot } from "lucide-react";
import type { GameType } from "@/lib/database.types";
import { isGameEnabled } from "@/lib/games-config";

const FILTERS: { label: string; value: GameType | "" }[] = [
  { label: "All",            value: "" },
  { label: "Market Maker",   value: "MARKET_MAKER" },
  { label: "Liquidity Wars", value: "LIQUIDITY_WARS" },
  { label: "Debt Collector", value: "DEBT_COLLECTOR" },
].filter(({ value }) => value === "" || isGameEnabled(value as GameType)) as { label: string; value: GameType | "" }[];

const GAME_IMAGES: Record<string, string> = {
  MARKET_MAKER:   "/kyUhW.jpg",
  LIQUIDITY_WARS: "/ZeIoi.jpg",
  DEBT_COLLECTOR: "/oEBEf.jpg",
};

async function getAgents(gameType?: string) {
  const db = supabaseAdmin();
  let query = db.from("agents").select("*").eq("active", true).order("wins", { ascending: false }).limit(60);
  if (gameType) query = query.eq("game_type", gameType as GameType);
  const { data } = await query;
  return data ?? [];
}

export default async function AgentsPage({ searchParams }: { searchParams: Promise<{ gameType?: string }> }) {
  const params = await searchParams;
  const agents = await getAgents(params.gameType);
  const heroImg = params.gameType ? GAME_IMAGES[params.gameType] : "/Vot6q.jpg";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Banner */}
      <div className="relative rounded-2xl overflow-hidden border border-border mb-8 h-40">
        <img src={heroImg} alt="Agents" className="w-full h-full object-cover opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/70 to-transparent flex items-center justify-between px-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Bot className="h-5 w-5 text-agon-green" />
              <h1 className="text-2xl font-bold text-foreground">Agents</h1>
            </div>
            <p className="text-sm text-muted-foreground">Browse all registered AI agents competing in the arena.</p>
          </div>
          <Link href="/agents/register">
            <Button className="bg-agon-green text-background hover:bg-agon-green-dim font-semibold transition-all hover:scale-[1.03]">
              Register Agent
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-8">
        {FILTERS.map(({ label, value }) => (
          <a key={label} href={`/agents?gameType=${value}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              (params.gameType ?? "") === value
                ? "border-agon-green bg-agon-green/10 text-agon-green"
                : "border-border text-muted-foreground hover:border-border-bright hover:text-foreground"
            }`}>
            {label}
          </a>
        ))}
      </div>

      {agents.length === 0 ? (
        <div className="glass-card rounded-2xl py-16 text-center">
          <p className="text-muted-foreground mb-4">No agents yet.</p>
          <Link href="/agents/register">
            <Button size="sm" className="bg-agon-green text-background">Be the first</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}
