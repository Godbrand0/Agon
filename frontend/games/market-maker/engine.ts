import type { IGameEngine, GameType, AgentAction, RoundResult, MatchResult } from "../types";
import { buildMMPrompt, NEWS_EVENTS } from "./prompts";

interface MMState {
  midPrice: number;
  agentInventory: Record<string, number>;
  agentPnL: Record<string, number>;
  agentQuotes: Record<string, { bid: number; ask: number }>;
  round: number;
}

interface MMAction {
  bid: number;
  ask: number;
  maxInventory: number;
  reasoning?: string;
}

export class MarketMakerEngine implements IGameEngine {
  gameType: GameType = "MARKET_MAKER";
  totalRounds = 3;

  private agentIds: string[] = [];
  private state!: MMState;
  private roundResults: RoundResult[] = [];
  private startTime = 0;
  private pendingActions: Record<string, MMAction> = {};
  private pendingReasonings: Record<string, string> = {};
  private roundWins: Record<string, number> = {};

  initialize(agentIds: string[]): void {
    this.agentIds = agentIds;
    this.startTime = Date.now();
    this.roundWins = Object.fromEntries(agentIds.map((id) => [id, 0]));
    this.state = {
      midPrice: 100,
      agentInventory: Object.fromEntries(agentIds.map((id) => [id, 0])),
      agentPnL: Object.fromEntries(agentIds.map((id) => [id, 0])),
      agentQuotes: {},
      round: 0,
    };
  }

  getAgentPrompt(agentId: string, round: number): string {
    const newsEvent = NEWS_EVENTS[Math.floor(Math.random() * NEWS_EVENTS.length)];
    return buildMMPrompt({ ...this.state, round }, agentId, newsEvent);
  }

  processAgentAction(agentId: string, action: AgentAction): void {
    const a = action.action as unknown as MMAction;
    this.pendingReasonings[agentId] = a.reasoning ?? "No reasoning provided.";
    this.pendingActions[agentId] = {
      bid: Number(a.bid),
      ask: Number(a.ask),
      maxInventory: Math.min(100, Math.max(1, Number(a.maxInventory))),
    };
  }

  async runRound(): Promise<RoundResult> {
    this.state.round++;
    const events: string[] = [];
    const prevPnL = { ...this.state.agentPnL };

    // News event drives price
    const news = NEWS_EVENTS[Math.floor(Math.random() * NEWS_EVENTS.length)];
    const prevPrice = this.state.midPrice;
    this.state.midPrice *= 1 + news.priceImpact;
    events.push(`📰 "${news.description}" → price ${news.priceImpact >= 0 ? "+" : ""}${(news.priceImpact * 100).toFixed(1)}% to $${this.state.midPrice.toFixed(2)}`);

    for (const agentId of this.agentIds) {
      const q = this.pendingActions[agentId];
      if (!q) continue;

      const spread = q.ask - q.bid;
      const midP = this.state.midPrice;

      if (q.bid >= q.ask || q.bid <= 0) {
        events.push(`⚠ Agent invalid quote — skipped`);
        continue;
      }

      const spreadPct = spread / midP;
      const maxFills = Math.max(1, Math.round(20 * (1 - Math.min(spreadPct / 0.05, 1))));
      const buyFills = Math.floor(Math.random() * maxFills);
      const sellFills = Math.floor(Math.random() * maxFills);

      const inv = this.state.agentInventory[agentId];
      const actualSell = Math.min(buyFills, inv + q.maxInventory);
      const actualBuy = Math.min(sellFills, q.maxInventory - inv);

      const spreadIncome = (actualSell + actualBuy) * (spread / 2);
      this.state.agentInventory[agentId] += actualBuy - actualSell;
      const invChange = (this.state.midPrice - prevPrice) * this.state.agentInventory[agentId];

      const roundPnL = spreadIncome + invChange;
      this.state.agentPnL[agentId] += roundPnL;
      this.state.agentQuotes[agentId] = { bid: q.bid, ask: q.ask };

      events.push(
        `Quote $${q.bid.toFixed(2)}/$${q.ask.toFixed(2)} · ${actualBuy + actualSell} fills · P&L: ${roundPnL >= 0 ? "+" : ""}$${roundPnL.toFixed(2)}`
      );
    }

    const scores = { ...this.state.agentPnL };
    const roundDelta: Record<string, number> = Object.fromEntries(
      this.agentIds.map((id) => [id, (scores[id] ?? 0) - (prevPnL[id] ?? 0)])
    );

    // Round winner = agent with highest delta this round
    const roundWinner = Object.entries(roundDelta).sort(([, a], [, b]) => b - a)[0][0];
    this.roundWins[roundWinner] = (this.roundWins[roundWinner] ?? 0) + 1;

    const result: RoundResult = {
      round: this.state.round,
      scores,
      events,
      roundWinner,
      roundDelta,
      state: {
        midPrice: this.state.midPrice,
        inventory: { ...this.state.agentInventory },
        quotes: { ...this.state.agentQuotes },
        reasoning: { ...this.pendingReasonings },
        roundWinner,
        roundDelta,
      },
    };

    this.roundResults.push(result);
    this.pendingActions = {};
    this.pendingReasonings = {};
    return result;
  }

  getResult(): MatchResult {
    const finalScores = { ...this.state.agentPnL };
    const winnerId = Object.entries(this.roundWins).sort(([, a], [, b]) => b - a)[0][0];
    return {
      winnerId,
      finalScores,
      rounds: this.roundResults,
      roundWins: { ...this.roundWins },
      durationMs: Date.now() - this.startTime,
    };
  }
}
