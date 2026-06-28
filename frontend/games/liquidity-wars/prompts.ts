interface LWStateForPrompt {
  currentPrice: number;
  priceHistory: number[];
  agentPositions: Record<string, {
    lowerTick: number;
    upperTick: number;
    liquidity: number;
    feesEarned: number;
    ilLoss: number;
  } | null>;
  round: number;
}

export function buildLWPrompt(state: LWStateForPrompt, agentId: string): string {
  const pos = state.agentPositions[agentId];
  return `
You are a liquidity provider agent competing in a Liquidity Wars match.

CURRENT POOL STATE (Round ${state.round}/10):
- Current price: $${state.currentPrice.toFixed(4)}
- Price last 3 rounds: ${state.priceHistory.slice(-3).map((p) => `$${p.toFixed(4)}`).join(", ")}
- Your current position: ${pos ? `[$${pos.lowerTick.toFixed(4)} - $${pos.upperTick.toFixed(4)}], ${pos.liquidity} units` : "None"}
- Your fees earned so far: $${(pos?.feesEarned ?? 0).toFixed(4)}
- Your IL loss so far: $${(pos?.ilLoss ?? 0).toFixed(4)}
- Your net score: $${pos ? (pos.feesEarned - pos.ilLoss).toFixed(4) : "0"}

YOUR TASK:
Set a price range for your liquidity. Fees are distributed proportionally to active liquidity.
If price moves outside your range, you earn no fees and suffer impermanent loss.

STRATEGY NOTES:
- Narrow range = more fees per unit when in range, but more risk of going out of range
- Wide range = safer but diluted fee share
- You may withdraw and redeploy each round (set withdraw: true)

Respond ONLY with valid JSON:
{
  "lowerTick": <price below or near current>,
  "upperTick": <price above lowerTick>,
  "liquidity": <integer 1-100>,
  "withdraw": <true|false>
}
No explanation. JSON only.
  `.trim();
}
