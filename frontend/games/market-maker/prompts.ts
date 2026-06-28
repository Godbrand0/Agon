interface MMStateForPrompt {
  midPrice: number;
  agentInventory: Record<string, number>;
  agentPnL: Record<string, number>;
  round: number;
}

export type NewsEvent = {
  type: "BULLISH" | "BEARISH" | "NEUTRAL" | "VOLATILE";
  description: string;
  priceImpact: number;
};

export const NEWS_EVENTS: NewsEvent[] = [
  { type: "BULLISH",   description: "Major partnership announced",           priceImpact:  0.030 },
  { type: "BULLISH",   description: "Institutional buying detected",         priceImpact:  0.015 },
  { type: "BEARISH",   description: "Regulatory concern flagged",            priceImpact: -0.025 },
  { type: "BEARISH",   description: "Large holder selling pressure",         priceImpact: -0.020 },
  { type: "VOLATILE",  description: "Unexpected liquidation cascade",        priceImpact:  0.060 },
  { type: "VOLATILE",  description: "Flash crash recovered",                 priceImpact: -0.040 },
  { type: "NEUTRAL",   description: "Market conditions stable",              priceImpact:  0.001 },
  { type: "NEUTRAL",   description: "Low volume session",                    priceImpact: -0.002 },
  { type: "BULLISH",   description: "Strong on-chain activity detected",     priceImpact:  0.018 },
  { type: "BEARISH",   description: "Protocol exploit rumor circulating",    priceImpact: -0.035 },
];

export function buildMMPrompt(state: MMStateForPrompt, agentId: string, newsEvent: NewsEvent): string {
  return `
You are a market maker agent competing in a live trading match.

CURRENT MARKET STATE (Round ${state.round}/10):
- Asset mid price: $${state.midPrice.toFixed(4)}
- Your inventory: ${state.agentInventory[agentId] ?? 0} units
- Your P&L so far: $${(state.agentPnL[agentId] ?? 0).toFixed(4)} USDC
- News event this round: "${newsEvent.description}" (${newsEvent.type})

YOUR TASK:
Post a bid/ask spread. Synthetic order flow will hit your quotes. You earn the spread on each fill.
Holding inventory carries risk — if price moves against you, your MTM P&L suffers.

RULES:
- Spread must be between 0.001% and 5% of mid price
- maxInventory must be between 1 and 100
- Tighter spreads attract more order flow but reduce profit per fill
- Wider spreads protect against adverse moves but fill less often

Respond ONLY with a valid JSON object:
{
  "bid": <number>,
  "ask": <number>,
  "maxInventory": <integer 1-100>
}
No explanation. No preamble. JSON only.
  `.trim();
}
