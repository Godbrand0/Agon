import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { v4 as uuidv4 } from 'uuid';
import { isGameEnabled, GAME_LOCKED_MESSAGE } from "@/lib/games-config";
import { supabaseAdmin } from "@/lib/supabase";
import { createAgentWallet } from "@/lib/circle";
import { AGENT_MODEL_POOL } from "@/agents/runtime";
import {
  tryGetOrchestratorWallet,
  getPublicClient,
  AGENT_REGISTRY_ABI,
  AGENT_REGISTRY_ADDRESS,
} from "@/lib/contracts";
import type { GameType } from "@/lib/database.types";

/**
 * Register the agent on-chain in AgentRegistry so it can be paired into a
 * match and bet on immediately — without this, a newly-registered agent's
 * registry_id stays null and both createMatch and on-chain betting have
 * nothing to reference for it. Best-effort: registration still succeeds
 * (in simulated-settlement mode) if the chain isn't configured or this call
 * fails; a fully working demo shouldn't require a judge to hit any chain
 * setup snag.
 */
async function registerAgentOnChain(
  name: string,
  gameType: string,
  walletAddress: string
): Promise<number | null> {
  const wallet = tryGetOrchestratorWallet();
  if (!wallet || !AGENT_REGISTRY_ADDRESS) return null;

  try {
    const publicClient = getPublicClient();
    const { request, result } = await publicClient.simulateContract({
      account: wallet.account,
      address: AGENT_REGISTRY_ADDRESS,
      abi: AGENT_REGISTRY_ABI,
      functionName: "registerAgent",
      args: [name, gameType, walletAddress as `0x${string}`],
    });

    const hash = await wallet.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
    if (receipt.status !== "success") {
      console.warn(`[agents] on-chain registerAgent reverted for "${name}" (${hash})`);
      return null;
    }
    return Number(result);
  } catch (e) {
    console.warn(`[agents] on-chain registration failed for "${name}", continuing simulated:`, e);
    return null;
  }
}

/** Every agent competes on its own LLM — assign the least-used model in the pool. */
async function pickModel(): Promise<string> {
  const { data } = await supabase.from("agents").select("model").eq("active", true);
  const counts = new Map<string, number>(AGENT_MODEL_POOL.map((m) => [m, 0]));
  for (const row of data ?? []) {
    if (row.model && counts.has(row.model)) counts.set(row.model, counts.get(row.model)! + 1);
  }
  return [...counts.entries()].sort((a, b) => a[1] - b[1])[0][0];
}

const supabase = supabaseAdmin();

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const gameType = searchParams.get("gameType");
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100);

  let query = supabase
    .from("agents")
    .select("id, name, game_type, owner_address, wallet_address, registry_id, model, status, wins, losses, total_earnings, active, created_at")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (gameType) query = query.eq("game_type", gameType);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

function generateApiToken(gameType: string) {
  const prefix = gameType.split('_').map(w => w[0]).join('').toLowerCase();
  const randomBytes = crypto.randomBytes(16).toString('hex');
  return `sk_${prefix}_${randomBytes}`;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, gameType, ownerAddress } = body as { name?: string; gameType?: string; ownerAddress?: string };

  if (!ownerAddress || !name || !gameType) {
    return NextResponse.json({ error: "ownerAddress, name, and gameType required" }, { status: 400 });
  }

  if (!isGameEnabled(gameType as GameType)) {
    return NextResponse.json({ error: GAME_LOCKED_MESSAGE }, { status: 403 });
  }

  const id = uuidv4();
  const api_token = generateApiToken(gameType);

  // Real Circle dev-controlled wallet on Arc Testnet when configured;
  // placeholder address otherwise (simulated nanopayments)
  let wallet;
  try {
    wallet = await createAgentWallet(id);
  } catch (e) {
    return NextResponse.json({ error: `Circle wallet creation failed: ${e}` }, { status: 502 });
  }

  const model = await pickModel();
  const registryId = await registerAgentOnChain(name, gameType, wallet.address);

  const { data: agent, error } = await supabase
    .from("agents")
    .insert({
      id,
      name,
      game_type: gameType,
      owner_address: ownerAddress,
      wallet_address: wallet.address,
      circle_wallet_id: wallet.circleWalletId,
      model,
      registry_id: registryId,
      api_token,
      status: "OFFLINE",
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error || !agent) {
    return NextResponse.json({ error: error?.message ?? "Failed to register agent" }, { status: 500 });
  }

  return NextResponse.json({ id, wallet_address: wallet.address, api_token }, { status: 201 });
}
