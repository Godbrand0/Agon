import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { createPublicClient, http } from "viem";
import { arcTestnet, isChainConfigured, simTxHash } from "@/lib/contracts";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { matchId, agentId, amount, userAddress, txHash } = body as {
    matchId: string;
    agentId: string;
    amount: number;
    userAddress: string;
    txHash?: string;
  };

  if (!matchId || !agentId || !amount || !userAddress) {
    return NextResponse.json({ error: "matchId, agentId, amount, userAddress required" }, { status: 400 });
  }

  if (amount < 1) {
    return NextResponse.json({ error: "Minimum bet is 1 USDC" }, { status: 400 });
  }

  // With contracts live, an on-chain tx hash is mandatory. Without them,
  // bets settle in simulated mode and get a `sim_` hash.
  const chainLive = isChainConfigured();
  if (chainLive && !txHash) {
    return NextResponse.json({ error: "On-chain transaction hash required" }, { status: 400 });
  }

  const db = supabaseAdmin();

  const { data: match } = await db
    .from("matches")
    .select("state, betting_deadline, total_pot, agent_ids")
    .eq("id", matchId)
    .single();

  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  if (match.state !== "BETTING_OPEN") {
    return NextResponse.json({ error: "Betting is closed for this match" }, { status: 400 });
  }
  if (new Date(match.betting_deadline) < new Date()) {
    return NextResponse.json({ error: "Betting deadline has passed" }, { status: 400 });
  }
  if (!match.agent_ids.includes(agentId)) {
    return NextResponse.json({ error: "Agent is not in this match" }, { status: 400 });
  }

  if (chainLive && txHash) {
    const publicClient = createPublicClient({
      chain: arcTestnet,
      transport: http(process.env.NEXT_PUBLIC_ARC_RPC_URL || process.env.ARC_RPC_URL),
    });

    try {
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
      if (receipt.status !== "success") {
        return NextResponse.json({ error: "Transaction failed on-chain" }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: "Failed to verify on-chain transaction" }, { status: 400 });
    }
  }

  const { data: bet, error: betErr } = await db
    .from("bets")
    .insert({
      match_id: matchId,
      user_address: userAddress.toLowerCase(),
      agent_id: agentId,
      amount,
      tx_hash: txHash ?? simTxHash(),
    })
    .select()
    .single();

  if (betErr || !bet) {
    return NextResponse.json({ error: betErr?.message ?? "Failed to place bet" }, { status: 500 });
  }

  await db.from("matches").update({ total_pot: match.total_pot + amount }).eq("id", matchId);

  return NextResponse.json(bet, { status: 201 });
}
