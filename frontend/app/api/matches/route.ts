import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  getOrchestratorWallet,
  MATCH_ESCROW_ABI,
  MATCH_ESCROW_ADDRESS,
} from "@/lib/contracts";
import { MatchOrchestrator } from "@/server/orchestrator";
import type { GameType, MatchState } from "@/lib/database.types";

const STAGGER_MINUTES = 20;      // minimum gap between match start times
const FIRST_MATCH_DELAY_MIN = 10; // first match starts 10 min from now
const BETTING_CLOSE_BEFORE_SEC = 120; // betting closes 2 min before starts_at

export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  const { searchParams } = req.nextUrl;
  const state = searchParams.get("state") as MatchState | null;
  const gameType = searchParams.get("gameType") as GameType | null;
  const limit = Math.min(Number(searchParams.get("limit") ?? 30), 50);

  let query = db
    .from("matches")
    .select("*, match_agents(agent_id, final_score, rank, earnings, agents(name, game_type, wins, losses))")
    .limit(limit)
    .order("starts_at", { ascending: true });

  if (state) query = query.eq("state", state);
  if (gameType) query = query.eq("game_type", gameType);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { gameType, agentIds } = body as {
    gameType: GameType;
    agentIds: string[];
  };

  if (!gameType || !agentIds || agentIds.length !== 2) {
    return NextResponse.json({ error: "gameType and exactly 2 agentIds required" }, { status: 400 });
  }

  const db = supabaseAdmin();

  // Validate agents exist and are same game type
  const { data: agents, error: agentErr } = await db
    .from("agents")
    .select("id, wallet_address, registry_id, game_type")
    .in("id", agentIds);

  if (agentErr || !agents || agents.length !== 2) {
    return NextResponse.json({ error: "One or more agents not found" }, { status: 404 });
  }

  if (agents.some((a) => a.game_type !== gameType)) {
    return NextResponse.json({ error: "All agents must match the selected game type" }, { status: 400 });
  }

  // Staggered scheduling: find the latest starts_at among pending matches
  const { data: upcoming } = await db
    .from("matches")
    .select("starts_at")
    .not("state", "in", '("RESOLVED","CANCELLED")')
    .order("starts_at", { ascending: false })
    .limit(1);

  let startsAt: Date;
  if (upcoming && upcoming.length > 0 && upcoming[0].starts_at) {
    const latest = new Date(upcoming[0].starts_at);
    startsAt = new Date(latest.getTime() + STAGGER_MINUTES * 60 * 1000);
    // Ensure not in the past
    const earliest = new Date(Date.now() + FIRST_MATCH_DELAY_MIN * 60 * 1000);
    if (startsAt < earliest) startsAt = earliest;
  } else {
    startsAt = new Date(Date.now() + FIRST_MATCH_DELAY_MIN * 60 * 1000);
  }

  const bettingDeadline = new Date(startsAt.getTime() - BETTING_CLOSE_BEFORE_SEC * 1000);
  const delayUntilStartMs = startsAt.getTime() - Date.now();

  const { data: match, error: matchErr } = await db
    .from("matches")
    .insert({
      game_type: gameType,
      agent_ids: agentIds,
      starts_at: startsAt.toISOString(),
      betting_deadline: bettingDeadline.toISOString(),
      state: "BETTING_OPEN",
      total_pot: 0,
    })
    .select()
    .single();

  if (matchErr || !match) {
    return NextResponse.json({ error: matchErr?.message ?? "Insert failed" }, { status: 500 });
  }

  await db.from("match_agents").insert(
    agentIds.map((agentId) => ({ match_id: match.id, agent_id: agentId }))
  );

  try {
    const wallet = getOrchestratorWallet();
    const contractMatchId = BigInt(Date.now());

    await wallet.writeContract({
      address: MATCH_ESCROW_ADDRESS,
      abi: MATCH_ESCROW_ABI,
      functionName: "createMatch",
      args: [
        contractMatchId,
        agents.map((a) => BigInt(a.registry_id ?? 0)),
        agents.map((a) => a.wallet_address as `0x${string}`),
        BigInt(Math.floor(delayUntilStartMs / 1000)),
      ],
    });

    await db.from("matches").update({ contract_match_id: Number(contractMatchId) }).eq("id", match.id);

    // Kick off orchestrator at scheduled start time
    setTimeout(async () => {
      try {
        const orch = new MatchOrchestrator();
        await orch.runMatch(match.id);
      } catch (e) {
        console.error("Orchestrator error for match", match.id, e);
      }
    }, delayUntilStartMs);

    return NextResponse.json({ ...match, contract_match_id: Number(contractMatchId) });
  } catch (err) {
    await db.from("matches").update({ state: "CANCELLED" }).eq("id", match.id);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
