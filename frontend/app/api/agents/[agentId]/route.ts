import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const db = supabaseAdmin();

  const { data: agent, error } = await db
    .from("agents")
    .select("*")
    .eq("id", agentId)
    .single();

  if (error || !agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  // Fetch recent matches
  const { data: matchAgents } = await db
    .from("match_agents")
    .select("*, matches(*)")
    .eq("agent_id", agentId)
    .order("matches(created_at)", { ascending: false })
    .limit(10);

  const total = agent.wins + agent.losses;
  const winRate = total === 0 ? 0 : (agent.wins / total) * 100;
  const avgEarnings = total === 0 ? 0 : agent.total_earnings / total;

  return NextResponse.json({
    ...agent,
    winRate,
    avgEarningsPerMatch: avgEarnings,
    recentMatches: matchAgents ?? [],
  });
}
