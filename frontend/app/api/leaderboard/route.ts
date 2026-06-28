import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import type { GameType } from "@/lib/database.types";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const gameType = searchParams.get("gameType") as GameType | null;
  const sort = searchParams.get("sort") ?? "winRate";
  const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100);

  const db = supabaseAdmin();

  let query = db
    .from("agents")
    .select("id, name, game_type, wins, losses, total_earnings, owner_address, created_at")
    .eq("active", true)
    .gt("wins", 0)
    .limit(limit);

  if (gameType) query = query.eq("game_type", gameType);

  // Sort options
  if (sort === "earnings") query = query.order("total_earnings", { ascending: false });
  else query = query.order("wins", { ascending: false }); // winRate approximated by wins

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich with computed fields
  const enriched = (data ?? []).map((agent, idx) => {
    const total = agent.wins + agent.losses;
    return {
      ...agent,
      rank: idx + 1,
      winRate: total === 0 ? 0 : (agent.wins / total) * 100,
      totalMatches: total,
    };
  });

  return NextResponse.json(enriched);
}
