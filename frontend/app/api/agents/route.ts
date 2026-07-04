import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { v4 as uuidv4 } from 'uuid';
import { isGameEnabled, GAME_LOCKED_MESSAGE } from "@/lib/games-config";
import { supabaseAdmin } from "@/lib/supabase";
import { createAgentWallet } from "@/lib/circle";
import type { GameType } from "@/lib/database.types";

const supabase = supabaseAdmin();

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const gameType = searchParams.get("gameType");
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100);

  let query = supabase
    .from("agents")
    .select("id, name, game_type, owner_address, wallet_address, registry_id, status, wins, losses, total_earnings, active, created_at")
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

  const { data: agent, error } = await supabase
    .from("agents")
    .insert({
      id,
      name,
      game_type: gameType,
      owner_address: ownerAddress,
      wallet_address: wallet.address,
      circle_wallet_id: wallet.circleWalletId,
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
