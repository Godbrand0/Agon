import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { betId, txHash, userAddress } = body as {
    betId: string;
    txHash: string;
    userAddress: string;
  };

  if (!betId || !txHash || !userAddress) {
    return NextResponse.json({ error: "betId, txHash, and userAddress required" }, { status: 400 });
  }

  const db = supabaseAdmin();

  const { data: bet, error: betErr } = await db
    .from("bets")
    .select("*, matches(state, winner_id, total_pot)")
    .eq("id", betId)
    .single();

  if (betErr || !bet) {
    return NextResponse.json({ error: "Bet not found" }, { status: 404 });
  }

  if (bet.user_address.toLowerCase() !== userAddress.toLowerCase()) {
    return NextResponse.json({ error: "Address mismatch" }, { status: 403 });
  }

  if (!bet.won) {
    return NextResponse.json({ error: "Bet did not win" }, { status: 400 });
  }

  if (bet.claimed) {
    return NextResponse.json({ error: "Already claimed" }, { status: 400 });
  }

  await db.from("bets")
    .update({ claimed: true, claim_tx_hash: txHash })
    .eq("id", betId);

  return NextResponse.json({ success: true });
}
