/**
 * Fuel streams API.
 *
 * GET  /api/stream?agentId=…&ownerAddress=…
 *   → { spender, chainReady, streams: [...] }
 *   `spender` is the orchestrator address the owner must approve on USDC.
 *
 * POST /api/stream  { action: "start", agentId, ownerAddress, rate, intervalSeconds }
 * POST /api/stream  { action: "stop",  streamId, ownerAddress }
 */

import { NextRequest, NextResponse } from "next/server";
import { privateKeyToAccount } from "viem/accounts";
import { supabaseAdmin } from "@/lib/supabase";
import { isStreamChainReady } from "@/lib/contracts";
import { startStream, stopStreamTimer, resumeActiveStreams } from "@/server/stream-engine";

const MAX_RATE = 1;          // USDC per tick cap (testnet sanity)
const MIN_INTERVAL_S = 3;
const MAX_INTERVAL_S = 120;

function spenderAddress(): string | null {
  const key = process.env.ORCHESTRATOR_PRIVATE_KEY;
  if (!key) return null;
  try {
    return privateKeyToAccount(key as `0x${string}`).address;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  await resumeActiveStreams(); // re-arm timers after server restarts

  const { searchParams } = req.nextUrl;
  const agentId = searchParams.get("agentId");
  const ownerAddress = searchParams.get("ownerAddress");

  const db = supabaseAdmin();
  let query = db.from("streams").select("*").order("created_at", { ascending: false }).limit(10);
  if (agentId) query = query.eq("agent_id", agentId);
  if (ownerAddress) query = query.eq("owner_address", ownerAddress.toLowerCase());

  const { data: streams } = await query;

  return NextResponse.json({
    spender: spenderAddress(),
    chainReady: isStreamChainReady(),
    streams: streams ?? [],
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = supabaseAdmin();

  if (body.action === "stop") {
    const { streamId, ownerAddress } = body as { streamId?: string; ownerAddress?: string };
    if (!streamId || !ownerAddress) {
      return NextResponse.json({ error: "streamId and ownerAddress required" }, { status: 400 });
    }

    const { data: stream } = await db.from("streams").select("owner_address, status").eq("id", streamId).single();
    if (!stream) return NextResponse.json({ error: "Stream not found" }, { status: 404 });
    if (stream.owner_address !== ownerAddress.toLowerCase()) {
      return NextResponse.json({ error: "Not your stream" }, { status: 403 });
    }

    stopStreamTimer(streamId);
    await db.from("streams").update({ status: "STOPPED", stopped_at: new Date().toISOString() }).eq("id", streamId);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "start") {
    const { agentId, ownerAddress, rate, intervalSeconds } = body as {
      agentId?: string; ownerAddress?: string; rate?: number; intervalSeconds?: number;
    };

    if (!agentId || !ownerAddress || !rate) {
      return NextResponse.json({ error: "agentId, ownerAddress, rate required" }, { status: 400 });
    }
    if (rate <= 0 || rate > MAX_RATE) {
      return NextResponse.json({ error: `Rate must be between 0 and ${MAX_RATE} USDC per tick` }, { status: 400 });
    }
    const interval = Math.min(Math.max(intervalSeconds ?? 5, MIN_INTERVAL_S), MAX_INTERVAL_S);

    const { data: agent } = await db.from("agents").select("id, wallet_address").eq("id", agentId).single();
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

    // One active stream per owner+agent
    const { data: existing } = await db
      .from("streams")
      .select("id")
      .eq("agent_id", agentId)
      .eq("owner_address", ownerAddress.toLowerCase())
      .eq("status", "ACTIVE")
      .limit(1);
    if (existing && existing.length > 0) {
      return NextResponse.json({ error: "You already have an active stream to this agent" }, { status: 409 });
    }

    const { data: stream, error } = await db
      .from("streams")
      .insert({
        agent_id: agentId,
        owner_address: ownerAddress.toLowerCase(),
        rate,
        interval_seconds: interval,
        status: "ACTIVE",
      })
      .select()
      .single();

    if (error || !stream) {
      return NextResponse.json({ error: error?.message ?? "Failed to create stream" }, { status: 500 });
    }

    await startStream(stream.id);
    return NextResponse.json(stream, { status: 201 });
  }

  return NextResponse.json({ error: "action must be 'start' or 'stop'" }, { status: 400 });
}
