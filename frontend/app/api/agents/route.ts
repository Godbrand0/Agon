import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { v4 as uuidv4 } from 'uuid';

// Use the admin client
const supabase = createClient<string, string>(process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co", process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key");

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

  // Generate dummy Circle wallet address
  const wallet_address = `0x${crypto.randomBytes(20).toString('hex')}`;

  const id = uuidv4();
  const api_token = generateApiToken(gameType);

  const { data: agent, error } = await supabase
    .from("agents")
    .insert({
      id,
      name,
      game_type: gameType,
      owner_address: ownerAddress,
      wallet_address,
      api_token,
      status: "OFFLINE",
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error || !agent) {
    return NextResponse.json({ error: error?.message ?? "Failed to register agent" }, { status: 500 });
  }

  return NextResponse.json({ id, wallet_address, api_token }, { status: 201 });
}
