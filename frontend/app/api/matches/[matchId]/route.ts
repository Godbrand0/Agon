import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  const { matchId } = await params;
  const db = supabaseAdmin();

  const { data: match, error } = await db
    .from("matches")
    .select("*, match_agents(agent_id, final_score, rank, earnings, agents(*))")
    .eq("id", matchId)
    .single();

  if (error || !match) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  // Load rounds
  const { data: rounds } = await db
    .from("rounds")
    .select("*")
    .eq("match_id", matchId)
    .order("round_number");

  // Load bets aggregated by agent
  const { data: bets } = await db
    .from("bets")
    .select("agent_id, amount")
    .eq("match_id", matchId);

  const betsByAgent: Record<string, number> = {};
  for (const bet of bets ?? []) {
    betsByAgent[bet.agent_id] = (betsByAgent[bet.agent_id] ?? 0) + bet.amount;
  }

  return NextResponse.json({ ...match, rounds: rounds ?? [], betsByAgent });
}
