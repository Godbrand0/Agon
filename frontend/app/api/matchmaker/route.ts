/**
 * POST /api/matchmaker
 *
 * Automated matchmaker endpoint.
 * Picks 2 READY agents per game type and creates matches.
 *
 * Call this on a schedule — e.g., with Vercel Cron (vercel.json):
 *   { "crons": [{ "path": "/api/matchmaker", "schedule": "0 * * * *" }] }
 *
 * Or from a simple cron job:
 *   curl -X POST http://localhost:3000/api/matchmaker \
 *        -H "Authorization: Bearer $MATCHMAKER_SECRET"
 *
 * Protected by MATCHMAKER_SECRET env var.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { MatchOrchestrator } from "@/server/orchestrator";
import type { GameType } from "@/lib/database.types";
import {
  tryGetOrchestratorWallet,
  MATCH_ESCROW_ABI,
  MATCH_ESCROW_ADDRESS,
} from "@/lib/contracts";
import { ENABLED_GAMES } from "@/lib/games-config";

// Only launch-enabled games get automated matches (others are locked)
const GAME_TYPES: GameType[] = ENABLED_GAMES;
const FIRST_MATCH_DELAY_MIN  = 5;   // betting window before match starts
const STAGGER_MINUTES        = 20;  // gap between consecutive matches
const BETTING_CLOSE_BEFORE_S = 120; // close betting 2 min before starts_at

// ── Auth guard ────────────────────────────────────────────────────────────────
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.MATCHMAKER_SECRET;
  if (!secret) return true; // no secret set → open (dev only)
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

// ── Agent selection ───────────────────────────────────────────────────────────
async function pickReadyAgents(gameType: GameType): Promise<string[] | null> {
  const db = supabaseAdmin();

  const { data: agents } = await db
    .from("agents")
    .select("id, name, wins, losses, status")
    .eq("game_type", gameType)
    .eq("status", "READY")
    .eq("active", true);

  if (!agents || agents.length < 2) return null;

  // Prioritize least-played agents for fair rotation
  const sorted = agents.sort((a, b) => (a.wins + a.losses) - (b.wins + b.losses));

  // Filter out any already in an active match
  const available: typeof sorted = [];
  for (const agent of sorted) {
    const { data: active } = await db
      .from("match_agents")
      .select("match_id, matches(state)")
      .eq("agent_id", agent.id);

    const isBusy = (active ?? []).some((r: any) =>
      ["PLAYING", "BETTING_OPEN", "BETTING_CLOSED"].includes(r.matches?.state)
    );

    if (!isBusy) available.push(agent);
    if (available.length === 2) break;
  }

  if (available.length < 2) return null;
  return [available[0].id, available[1].id];
}

// ── Match creation ────────────────────────────────────────────────────────────
async function scheduleMatch(
  gameType: GameType,
  agentIds: string[]
): Promise<{ matchId: string; startsAt: string } | null> {
  const db = supabaseAdmin();

  const { data: agents } = await db
    .from("agents")
    .select("id, wallet_address, owner_address, registry_id")
    .in("id", agentIds);

  if (!agents || agents.length !== 2) return null;

  // Stagger scheduling
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
    const earliest = new Date(Date.now() + FIRST_MATCH_DELAY_MIN * 60 * 1000);
    if (startsAt < earliest) startsAt = earliest;
  } else {
    startsAt = new Date(Date.now() + FIRST_MATCH_DELAY_MIN * 60 * 1000);
  }

  const bettingDeadline = new Date(startsAt.getTime() - BETTING_CLOSE_BEFORE_S * 1000);
  const delayMs = startsAt.getTime() - Date.now();

  const { data: match, error } = await db
    .from("matches")
    .insert({
      game_type:        gameType,
      agent_ids:        agentIds,
      starts_at:        startsAt.toISOString(),
      betting_deadline: bettingDeadline.toISOString(),
      state:            "BETTING_OPEN",
      total_pot:        0,
    })
    .select()
    .single();

  if (error || !match) return null;

  await db.from("match_agents").insert(
    agentIds.map((agentId) => ({ match_id: match.id, agent_id: agentId }))
  );

  // Register on-chain (best-effort — game runs even if this fails)
  try {
    const wallet = tryGetOrchestratorWallet();
    if (!wallet) throw new Error("chain not configured — running simulated");
    const contractMatchId = BigInt(Date.now());

    await wallet.writeContract({
      address:      MATCH_ESCROW_ADDRESS,
      abi:          MATCH_ESCROW_ABI,
      functionName: "createMatch",
      args: [
        contractMatchId,
        agents.map((a) => BigInt(a.registry_id ?? 0)),
        agents.map((a) => a.owner_address as `0x${string}`),
        BigInt(Math.floor(delayMs / 1000)),
      ],
    });

    await db
      .from("matches")
      .update({ contract_match_id: Number(contractMatchId) })
      .eq("id", match.id);
  } catch (e) {
    console.warn("[Matchmaker] on-chain createMatch failed (continuing):", e);
  }

  // Schedule orchestrator
  setTimeout(async () => {
    try {
      const orch = new MatchOrchestrator();
      await orch.runMatch(match.id);
    } catch (e) {
      console.error("[Matchmaker] Orchestrator error for match", match.id, e);
    }
  }, delayMs);

  return { matchId: match.id, startsAt: startsAt.toISOString() };
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, unknown> = {};
  let scheduled = 0;

  for (const gameType of GAME_TYPES) {
    const agentIds = await pickReadyAgents(gameType);

    if (!agentIds) {
      results[gameType] = { status: "skipped", reason: "fewer than 2 READY agents" };
      continue;
    }

    const match = await scheduleMatch(gameType, agentIds);

    if (!match) {
      results[gameType] = { status: "error", reason: "match creation failed" };
      continue;
    }

    results[gameType] = {
      status:   "scheduled",
      matchId:  match.matchId,
      startsAt: match.startsAt,
      agentIds,
    };
    scheduled++;
  }

  return NextResponse.json({
    scheduled,
    timestamp: new Date().toISOString(),
    results,
  });
}

// GET for health check / manual trigger from browser
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    message: "Matchmaker is online. Send POST to trigger a cycle.",
    gameTypes: GAME_TYPES,
  });
}
