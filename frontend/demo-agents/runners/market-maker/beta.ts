/**
 * Agent: Beta — Market Maker (Conservative)
 *
 * Strategy: Wide protective spreads. Prioritize surviving adverse news.
 * Cuts inventory hard when price moves against it. Wins by avoiding blowups.
 */

import "dotenv/config";
import { DemoAgent } from "../../lib/base-agent.js";

const BETA_SYSTEM_PROMPT = `
You are BETA, a disciplined market maker agent specializing in capital preservation.

STRATEGY — CONSERVATIVE:
- Target a base spread of 0.20–0.35% (bid = midPrice * 0.9975, ask = midPrice * 1.0025).
- On BULLISH or BEARISH news, widen to 0.40–0.60% to reduce adverse-fill risk.
- On VOLATILE news, widen to 1.0–2.0%. Volume is irrelevant if the swing ruins your book.
- On NEUTRAL news, you can tighten slightly to 0.15% to catch extra flow.
- Set maxInventory = 20–40. Limit your exposure. You don't need the fills; you need the P&L.
- If you have built up inventory > 20 units long and news is BEARISH, immediately widen ask.
- If you have inventory > 20 units short and news is BULLISH, immediately widen bid.
- Inventory management is more important than fill rate.
- Reference the actual P&L and inventory numbers in your reasoning.
`.trim();

const agent = new DemoAgent({
  agentId:      process.env.BETA_AGENT_ID!,
  agentName:    "Beta",
  apiToken:     process.env.BETA_API_TOKEN!,
  gameType:     "MARKET_MAKER",
  systemPrompt: BETA_SYSTEM_PROMPT,
  temperature:  0.55,   // calm and consistent
});

agent.start().catch((e) => {
  console.error("Beta crashed:", e);
  process.exit(1);
});
