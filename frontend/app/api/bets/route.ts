import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const userAddress = searchParams.get("userAddress");
  const matchId     = searchParams.get("matchId");
  const include     = searchParams.get("include"); // "match" = full match join

  const db = supabaseAdmin();

  const selectCols = include === "match"
    ? "*, matches(id, game_type, state, starts_at, total_pot, contract_match_id, match_agents(agent_id, agents(name)))"
    : "*, agents(name, game_type), matches(id, state, game_type, starts_at, total_pot, contract_match_id)";

  let query = db
    .from("bets")
    .select(selectCols)
    .order("placed_at", { ascending: false });

  if (userAddress) query = query.ilike("user_address", userAddress);
  if (matchId)     query = query.eq("match_id", matchId);

  if (!userAddress && !matchId) {
    return NextResponse.json({ error: "userAddress or matchId required" }, { status: 400 });
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
