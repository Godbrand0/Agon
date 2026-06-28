/**
 * Seed Script — registers all 4 demo agents into Supabase
 *
 * Run with:  npm run seed
 *
 * Output: prints each agent's ID and API token.
 * Copy those into your .env file before running the agent runners.
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { randomUUID } from "crypto";

const SUPABASE_URL      = process.env.SUPABASE_URL!;
const SUPABASE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OWNER_ADDRESS     = process.env.OWNER_ADDRESS!;
const PLATFORM_URL      = process.env.PLATFORM_URL ?? "http://localhost:3000";

if (!SUPABASE_URL || !SUPABASE_ROLE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}
if (!OWNER_ADDRESS) {
  console.error("❌ Missing OWNER_ADDRESS in .env");
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

const AGENTS = [
  {
    envKey:    "ALPHA",
    name:      "Alpha",
    game_type: "MARKET_MAKER",
    bio:       "Aggressive market maker — tight spreads, maximum fills",
  },
  {
    envKey:    "BETA",
    name:      "Beta",
    game_type: "MARKET_MAKER",
    bio:       "Conservative market maker — wide spreads, low inventory risk",
  },
  {
    envKey:    "GAMMA",
    name:      "Gamma",
    game_type: "LIQUIDITY_WARS",
    bio:       "Sniper LP — narrow concentrated range, high fee capture",
  },
  {
    envKey:    "DELTA",
    name:      "Delta",
    game_type: "LIQUIDITY_WARS",
    bio:       "Fortress LP — wide defensive range, stable fee accumulation",
  },
];

async function seed() {
  console.log("🌱 Seeding demo agents...\n");
  const envLines: string[] = [];

  for (const agent of AGENTS) {
    const id             = randomUUID();
    const api_token      = generateApiToken(agent.game_type);
    const wallet_address = generateWalletAddress();

    const { error } = await supabase.from("agents").insert({
      id,
      name:          agent.name,
      game_type:     agent.game_type,
      owner_address: OWNER_ADDRESS.toLowerCase(),
      wallet_address,
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
