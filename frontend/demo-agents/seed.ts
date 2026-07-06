/**
 * Seed Script — registers all 4 demo agents into Supabase
 *
 * Run with:  npm run seed
 *
 * Output: prints each agent's ID and API token.
 * Copy those into your .env file before running the agent runners.
 */

import { createClient } from "@supabase/supabase-js";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { privateKeyToAccount } from "viem/accounts";
import crypto from "crypto";
import { randomUUID } from "crypto";

// Run with: node --env-file=.env.local --import tsx demo-agents/seed.ts
const SUPABASE_URL      = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
// Owner payout address: explicit OWNER_ADDRESS, else derived from the orchestrator key
const OWNER_ADDRESS =
  process.env.OWNER_ADDRESS ||
  (process.env.ORCHESTRATOR_PRIVATE_KEY
    ? privateKeyToAccount(process.env.ORCHESTRATOR_PRIVATE_KEY as `0x${string}`).address
    : "");

if (!SUPABASE_URL || !SUPABASE_ROLE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}
if (!OWNER_ADDRESS) {
  console.error("❌ Missing OWNER_ADDRESS (or ORCHESTRATOR_PRIVATE_KEY to derive it) in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ROLE_KEY);

function generateApiToken(gameType: string): string {
  const prefix = gameType.split("_").map((w: string) => w[0]).join("").toLowerCase();
  return `sk_${prefix}_${crypto.randomBytes(16).toString("hex")}`;
}

function generateWalletAddress(): string {
  return `0x${crypto.randomBytes(20).toString("hex")}`;
}

// ── Optional: real Circle dev-controlled wallets on Arc Testnet ─────────────
const circleConfigured = Boolean(process.env.CIRCLE_API_KEY && process.env.CIRCLE_ENTITY_SECRET);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let circleClient: any = null;
let walletSetId: string | null = process.env.CIRCLE_WALLET_SET_ID ?? null;

async function createCircleWallet(agentId: string): Promise<{ address: string; circleWalletId: string } | null> {
  if (!circleConfigured) return null;
  try {
    if (!circleClient) {
      circleClient = initiateDeveloperControlledWalletsClient({
        apiKey: process.env.CIRCLE_API_KEY!,
        entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
      });
    }
    if (!walletSetId) {
      const res = await circleClient.createWalletSet({ name: "Agon Agent Wallets" });
      walletSetId = res?.data?.walletSet?.id ?? null;
      if (walletSetId) console.log(`   ℹ️  Created wallet set ${walletSetId} — add CIRCLE_WALLET_SET_ID=${walletSetId} to .env`);
    }
    if (!walletSetId) return null;

    const res = await circleClient.createWallets({
      walletSetId,
      blockchains: ["ARC-TESTNET"],
      count: 1,
      accountType: "EOA",
      metadata: [{ name: `agent-${agentId}`, refId: agentId }],
    });
    const w = res?.data?.wallets?.[0];
    return w?.address && w?.id ? { address: w.address, circleWalletId: w.id } : null;
  } catch (e) {
    console.warn("   ⚠️ Circle wallet creation failed, using placeholder:", e);
    return null;
  }
}

const AGENTS = [
  {
    envKey:    "ALPHA",
    name:      "Alpha",
    game_type: "MARKET_MAKER",
    model:     "qwen/qwen3.5-122b-a10b",
    bio:       "Aggressive market maker — tight spreads, maximum fills",
  },
  {
    envKey:    "BETA",
    name:      "Beta",
    game_type: "MARKET_MAKER",
    model:     "meta/llama-3.3-70b-instruct",
    bio:       "Conservative market maker — wide spreads, low inventory risk",
  },
  {
    envKey:    "GAMMA",
    name:      "Gamma",
    game_type: "LIQUIDITY_WARS",
    model:     "mistralai/mixtral-8x7b-instruct-v0.1",
    bio:       "Sniper LP — narrow concentrated range, high fee capture",
  },
  {
    envKey:    "DELTA",
    name:      "Delta",
    game_type: "LIQUIDITY_WARS",
    model:     "nvidia/llama-3.1-nemotron-70b-instruct",
    bio:       "Fortress LP — wide defensive range, stable fee accumulation",
  },
];

async function seed() {
  console.log("🌱 Seeding demo agents...\n");
  const envLines: string[] = [];

  // Launch lock: only Market Maker is live — skip agents for locked games
  const enabledAgents = AGENTS.filter((a) => a.game_type === "MARKET_MAKER");

  for (const agent of enabledAgents) {
    const id        = randomUUID();
    const api_token = generateApiToken(agent.game_type);

    const circleWallet   = await createCircleWallet(id);
    const wallet_address = circleWallet?.address ?? generateWalletAddress();

    const { error } = await supabase.from("agents").insert({
      id,
      name:          agent.name,
      game_type:     agent.game_type,
      owner_address: OWNER_ADDRESS.toLowerCase(),
      wallet_address,
      circle_wallet_id: circleWallet?.circleWalletId ?? null,
      model:         agent.model,
      api_token,
      status:        "OFFLINE",
      active:        true,
      wins:          0,
      losses:        0,
      total_earnings: 0,
      created_at:    new Date().toISOString(),
    });

    if (error) {
      console.error(`❌ Failed to seed ${agent.name}:`, error.message);
      continue;
    }

    console.log(`✅ ${agent.name} (${agent.game_type})`);
    console.log(`   ID:        ${id}`);
    console.log(`   Token:     ${api_token}`);
    console.log(`   Wallet:    ${wallet_address}`);
    console.log(`   Bio:       ${agent.bio}`);
    console.log();

    envLines.push(`${agent.envKey}_AGENT_ID=${id}`);
    envLines.push(`${agent.envKey}_API_TOKEN=${api_token}`);
  }

  console.log("─────────────────────────────────────────────");
  console.log("📋 Copy these into your .env file:\n");
  envLines.forEach((line) => console.log(line));
  console.log("\n✨ Done. Now run: npm run run:all");
}

seed().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
