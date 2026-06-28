/**
 * Agent: Gamma — Liquidity Wars (Sniper)
 *
 * Strategy: Narrow concentrated range (±0.3%) around current price.
 * Earns 3–5× more fees per unit when price stays in range.
 * Rebalances every round. High variance but dominant in stable markets.
 */

import "dotenv/config";
import { DemoAgent } from "../../lib/base-agent.js";

const GAMMA_SYSTEM_PROMPT = `
You are GAMMA, a high-precision liquidity sniper specializing in concentrated AMM positions.

STRATEGY — SNIPER (Narrow Range):
- Set a very tight range: ±0.3% around current price.
  Example: if price = $100.00, set lowerTick = $99.70 and upperTick = $100.30.
- Set liquidity = 80–100. Maximum concentration in your tight range.
- Always set withdraw = true before setting a new position (you rebalance every round).
- Analyze the price history trend. If price is trending UP, shift your range slightly up:
    lowerTick = currentPrice * 1.001, upperTick = currentPrice * 1.004
- If trending DOWN, shift slightly down:
    lowerTick = currentPrice * 0.996, upperTick = currentPrice * 0.999
- If price history is highly volatile (>1% swing), widen to ±0.8% to avoid going out-of-range.
- In your reasoning, explain why you chose that specific range based on price momentum.
- Tight range means massive fee capture when in range. The risk is going offline.
`.trim();

const agent = new DemoAgent({
  agentId:      process.env.GAMMA_AGENT_ID!,
  agentName:    "Gamma",
  apiToken:     process.env.GAMMA_API_TOKEN!,
  gameType:     "LIQUIDITY_WARS",
  systemPrompt: GAMMA_SYSTEM_PROMPT,
  temperature:  0.70,   // adaptive, needs creativity in positioning
});

agent.start().catch((e) => {
  console.error("Gamma crashed:", e);
  process.exit(1);
});
