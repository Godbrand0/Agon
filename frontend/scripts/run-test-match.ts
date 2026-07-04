/**
 * End-to-end test match — bypasses scheduling and runs a full match now.
 *
 * Usage:
 *   node --env-file=.env.local --import tsx scripts/run-test-match.ts       # one match
 *   node --env-file=.env.local --import tsx scripts/run-test-match.ts 5     # history: 5 matches
 *
 * Exercises: game engine, NVIDIA agent runtime, nanopayments (real Circle
 * transfers when wallets are funded, simulated otherwise), rounds persistence,
 * and pot settlement.
 */

import { supabaseAdmin } from "../lib/supabase";
import { MatchOrchestrator } from "../server/orchestrator";

const MATCH_COUNT = Math.max(1, Number(process.argv[2] ?? 1));

async function main() {
  const db = supabaseAdmin();

  const { data: agents, error: agentErr } = await db
    .from("agents")
    .select("id, name")
    .eq("game_type", "MARKET_MAKER")
    .eq("active", true)
    .limit(2);

  if (agentErr || !agents || agents.length < 2) {
    throw new Error(`Need 2 MARKET_MAKER agents, found ${agents?.length ?? 0} (${agentErr?.message ?? "run seed first"})`);
  }

  const agentIds = agents.map((a) => a.id);

  for (let i = 1; i <= MATCH_COUNT; i++) {
    if (MATCH_COUNT > 1) console.log(`\n═══ Match ${i}/${MATCH_COUNT} ═══`);
    await runOne(db, agents, agentIds);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runOne(db: any, agents: Array<{ id: string; name: string }>, agentIds: string[]) {
  console.log(`⚔️  ${agents[0].name} vs ${agents[1].name}`);

  const now = new Date();
  const { data: match, error: matchErr } = await db
    .from("matches")
    .insert({
      game_type: "MARKET_MAKER",
      agent_ids: agentIds,
      starts_at: now.toISOString(),
      betting_deadline: now.toISOString(),
      state: "BETTING_OPEN",
      total_pot: 0,
    })
    .select()
    .single();

  if (matchErr || !match) throw new Error(`Match insert failed: ${matchErr?.message}`);
  await db.from("match_agents").insert(agentIds.map((agentId) => ({ match_id: match.id, agent_id: agentId })));

  // Place simulated bets so settlement has a pot to split (varied for history)
  const betA = 5 + Math.floor(Math.random() * 20);
  const betB = 5 + Math.floor(Math.random() * 20);
  await db.from("bets").insert([
    { match_id: match.id, user_address: "0xtestbettor1", agent_id: agentIds[0], amount: betA, tx_hash: "sim_test_1" },
    { match_id: match.id, user_address: "0xtestbettor2", agent_id: agentIds[1], amount: betB, tx_hash: "sim_test_2" },
  ]);
  await db.from("matches").update({ total_pot: betA + betB }).eq("id", match.id);

  console.log(`🏟️  Match ${match.id} created — running orchestrator…\n`);
  const started = Date.now();
  await new MatchOrchestrator().runMatch(match.id);
  console.log(`\n✅ Match completed in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  // Report results
  const { data: final } = await db.from("matches").select("state, winner_id").eq("id", match.id).single();
  const { data: rounds } = await db.from("rounds").select("round_number, scores, events").eq("match_id", match.id).order("round_number");
  const { data: nanos } = await db.from("nanopayments").select("kind, amount, tx_hash").eq("match_id", match.id);
  const { data: payouts } = await db.from("payouts").select("recipient_type, amount").eq("match_id", match.id);
  const { data: bets } = await db.from("bets").select("user_address, amount, won, payout, profit").eq("match_id", match.id);

  const winner = agents.find((a) => a.id === final?.winner_id);
  console.log(`\n🏆 Winner: ${winner?.name ?? final?.winner_id} (state: ${final?.state})`);
  console.log(`\n📊 Rounds: ${rounds?.length}`);
  for (const r of rounds ?? []) {
    console.log(`  Round ${r.round_number}:`, JSON.stringify(r.scores));
    for (const e of (r.events ?? []).slice(0, 3)) console.log(`    · ${e}`);
  }
  console.log(`\n💸 Nanopayments: ${nanos?.length} totalling ${nanos?.reduce((s: number, n: { amount: number }) => s + Number(n.amount), 0).toFixed(4)} USDC`);
  for (const n of nanos ?? []) console.log(`  ${n.kind.padEnd(11)} ${Number(n.amount).toFixed(4)} · ${n.tx_hash?.slice(0, 24)}…`);
  console.log(`\n💰 Payouts:`);
  for (const p of payouts ?? []) console.log(`  ${p.recipient_type.padEnd(9)} ${Number(p.amount).toFixed(2)} USDC`);
  console.log(`\n🎰 Bets:`);
  for (const b of bets ?? []) console.log(`  ${b.user_address} bet ${b.amount} → ${b.won ? "WON" : "lost"} · payout ${b.payout} · profit ${b.profit}`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("❌ Test match failed:", e);
  process.exit(1);
});
