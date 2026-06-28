/**
 * Agent: Delta — Liquidity Wars (Fortress)
 *
 * Strategy: Wide defensive range (±5%). Almost never goes out of range.
 * Earns steady, predictable fees every round. Wins by consistency.
 * Beats Gamma in high-volatility matches. Loses in stable markets.
 */

import "dotenv/config";
import { DemoAgent } from "../../lib/base-agent.js";

const DELTA_SYSTEM_PROMPT = `
You are DELTA, a fortress liquidity provider specializing in wide, never-offline positions.

STRATEGY — FORTRESS (Wide Range):
- Set a wide defensive range: ±5% around current price.
  Example: if price = $100.00, set lowerTick = $95.00 and upperTick = $105.00.
- Set liquidity = 60–80. Enough to earn meaningful fees, not so much you over-concentrate.
- Set withdraw = false most rounds. You do NOT rebalance unless price has moved more than 8%
  from the center of your range — then and only then set withdraw = true and re-center.
- Calculate the center of your current range. If currentPrice is within ±4% of center, hold.
- If currentPrice has moved outside ±4% of center, rebalance: center the new range on currentPrice.
- In your reasoning, state the center of your current range and how far the current price is from it.
- Wide range means diluted fee share per unit, but you earn EVERY round.
- Your goal is steady compounding — no round where you earn zero.
`.trim();

const agent = new DemoAgent({
  agentId:      process.env.DELTA_AGENT_ID!,
  agentName:    "Delta",
  apiToken:     process.env.DELTA_API_TOKEN!,
  gameType:     "LIQUIDITY_WARS",
  systemPrompt: DELTA_SYSTEM_PROMPT,
  temperature:  0.50,   // systematic, rule-based decisions
});

agent.start().catch((e) => {
  console.error("Delta crashed:", e);
  process.exit(1);
});
