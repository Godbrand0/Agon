/**
 * Matchmaker — Automated Match Scheduler
 *
 * Runs on a loop (default: every 30 minutes).
 * For each game type with 2+ READY agents:
 *  1. Picks the two agents with the lowest recent match count (fairness)
 *  2. Calls POST /api/matches to create + schedule the match
 *  3. Logs the result
 *
 * Usage:
 *   npm run matchmaker              (runs forever, 30-min loop)
 *   npm run matchmaker -- --once    (single run, then exits)
 *
 * The /api/matches endpoint handles:
 *  - Stagger scheduling (no two matches start at same time)
 *  - Creating the on-chain MatchEscrow entry
 *  - Auto-triggering the orchestrator at start time via setTimeout
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL      = process.env.SUPABASE_URL!;
const SUPABASE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PLATFORM_URL      = process.env.PLATFORM_URL ?? "http://localhost:3000";
const INTERVAL_MS       = 30 * 60 * 1000; // 30 minutes

const GAME_TYPES = ["MARKET_MAKER", "LIQUIDITY_WARS", "DEBT_COLLECTOR"] as const;
type GameType = (typeof GAME_TYPES)[number];

if (!SUPABASE_URL || !SUPABASE_ROLE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_ROLE_KEY);

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] [Matchmaker] ${msg}`);
}

// ── Agent selection ───────────────────────────────────────────────────────────

/**
 * For a given game type, find all READY agents sorted by fewest recent matches
 * (so agents that haven't played recently get priority — fair rotation).
 */
async function pickAgents(gameType: GameType): Promise<string[] | null> {
  // Get all READY agents for this game type
  const { data: agents, error } = await db
    .from("agents")
    .select("id, name, wins, losses")
    .eq("game_type", gameType)
    .eq("status", "READY")
    .eq("active", true);

  if (error) {
    log(`DB error fetching agents for ${gameType}: ${error.message}`);
    return null;
  }

  if (!agents || agents.length < 2) {
    log(`${gameType}: only ${agents?.length ?? 0} READY agent(s) — need 2, skipping.`);
    return null;
  }

  // Sort by total matches played (wins + losses) ascending — least-played first
  const sorted = agents.sort((a, b) => (a.wins + a.losses) - (b.wins + b.losses));

  // Check neither agent is already IN_MATCH
  const [a, b] = sorted;

  // Verify not already in an active match together
  const { data: existing } = await db
    .from("match_agents")
    .select("match_id, matches(state)")
    .in("agent_id", [a.id, b.id]);

  const bothActiveMatchIds = new Set<string>();
  for (const row of (existing ?? []) as any[]) {
    const state = row.matches?.state;
    if (state === "PLAYING" || state === "BETTING_OPEN" || state === "BETTING_CLOSED") {
      bothActiveMatchIds.add(row.match_id);
    }
  }

  // Count how many active matches each agent is in
  const { data: activeA } = await db
    .from("match_agents")
    .select("match_id, matches(state)")
    .eq("agent_id", a.id);

  const { data: activeB } = await db
    .from("match_agents")
    .select("match_id, matches(state)")
    .eq("agent_id", b.id);

  const isAgentBusy = (rows: any[]) =>
    rows.some((r) => ["PLAYING", "BETTING_OPEN", "BETTING_CLOSED"].includes(r.matches?.state));

  if (isAgentBusy(activeA ?? [])) {
    log(`${gameType}: ${a.name} is already in an active match — trying next pair.`);
    if (sorted.length < 3) return null;
    // Try a.id with sorted[2]
    const c = sorted[2];
    if (isAgentBusy(activeB ?? [])) return null;
    log(`${gameType}: Selected ${a.name} + ${c.name}`);
    return [a.id, c.id];
  }

  if (isAgentBusy(activeB ?? [])) {
    log(`${gameType}: ${b.name} is already in an active match — skipping.`);
    return null;
  }

  log(`${gameType}: Selected ${a.name} (${a.wins}W/${a.losses}L) vs ${b.name} (${b.wins}W/${b.losses}L)`);
  return [a.id, b.id];
}

// ── Match creation ────────────────────────────────────────────────────────────

async function createMatch(gameType: GameType, agentIds: string[]): Promise<boolean> {
  try {
    const res = await fetch(`${PLATFORM_URL}/api/matches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameType, agentIds }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      log(`❌ Failed to create ${gameType} match: ${body.error ?? res.statusText}`);
      return false;
    }

    const match = await res.json();
    log(`✅ Match created: ${match.id} · ${gameType} · starts at ${match.starts_at}`);
    return true;
  } catch (e) {
    log(`❌ Network error creating match: ${e}`);
    return false;
  }
}

// ── Main loop ─────────────────────────────────────────────────────────────────

async function runMatchmakerCycle() {
  log("─── Running matchmaker cycle ───");
  let scheduled = 0;

  for (const gameType of GAME_TYPES) {
    const agentIds = await pickAgents(gameType);
    if (!agentIds) continue;

    const ok = await createMatch(gameType, agentIds);
    if (ok) scheduled++;
  }

  log(`Cycle complete. Scheduled ${scheduled} match(es).`);
}

async function main() {
  const once = process.argv.includes("--once");

  log("Matchmaker starting up…");
  log(`Platform URL: ${PLATFORM_URL}`);
  log(`Interval: ${once ? "single run" : `every ${INTERVAL_MS / 60_000} minutes`}`);
  log("");

  await runMatchmakerCycle();

  if (once) {
    log("--once flag set, exiting.");
    process.exit(0);
  }

  log(`Next cycle in ${INTERVAL_MS / 60_000} minutes…`);
  setInterval(async () => {
    await runMatchmakerCycle();
    log(`Next cycle in ${INTERVAL_MS / 60_000} minutes…`);
  }, INTERVAL_MS);
}

main().catch((e) => {
  console.error("Matchmaker crashed:", e);
  process.exit(1);
});
