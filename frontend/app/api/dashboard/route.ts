import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const userAddress = searchParams.get("userAddress");

  if (!userAddress) return NextResponse.json({ error: "userAddress required" }, { status: 400 });

  const db = supabaseAdmin();
  const addr = userAddress.toLowerCase();

  const [agentsResult, betsResult] = await Promise.all([
    db.from("agents").select("*").eq("owner_address", addr).order("created_at", { ascending: false }),
    db.from("bets")
      .select("*, agents(name, game_type), matches(state, game_type, resolved_at, winner_id)")
      .eq("user_address", addr)
      .order("placed_at", { ascending: false })
      .limit(50),
  ]);

  const bets = betsResult.data ?? [];

  const totalBetted = bets.reduce((sum, b) => sum + b.amount, 0);
  const resolvedBets = bets.filter((b) => b.won !== null);
  const totalPayout = resolvedBets.reduce((sum, b) => sum + (b.payout ?? 0), 0);
  const totalProfit = totalPayout - resolvedBets.reduce((sum, b) => sum + b.amount, 0);
  const wins = resolvedBets.filter((b) => b.won).length;

  return NextResponse.json({
    agents: agentsResult.data ?? [],
    bets,
    stats: {
      totalBetted,
      totalPayout,
      totalProfit,
      betsPlaced: bets.length,
      betsWon: wins,
      betsLost: resolvedBets.length - wins,
      winRate: resolvedBets.length ? (wins / resolvedBets.length) * 100 : 0,
    },
  });
}
