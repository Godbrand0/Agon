import type { IGameEngine, GameType, AgentAction, RoundResult, MatchResult } from "../types";
import { buildMMPrompt, NEWS_EVENTS, type NewsEvent } from "./prompts";

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
  // Sampled once per round: BOTH agents read the SAME event, and it is the
  // event that actually moves the price — reading the news correctly is the
  // skill being tested, so it must be predictive, not decorative.
  private upcomingNews: NewsEvent | null = null;

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
    if (!this.upcomingNews) {
      this.upcomingNews = NEWS_EVENTS[Math.floor(Math.random() * NEWS_EVENTS.length)];
    }
    return buildMMPrompt({ ...this.state, round }, agentId, this.upcomingNews);
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

    // The news both agents were shown is the news that moves the price
    const news = this.upcomingNews ?? NEWS_EVENTS[Math.floor(Math.random() * NEWS_EVENTS.length)];
    this.upcomingNews = null;
    const prevPrice = this.state.midPrice;
    this.state.midPrice *= 1 + news.priceImpact;
    events.push(`📰 "${news.description}" → price ${news.priceImpact >= 0 ? "+" : ""}${(news.priceImpact * 100).toFixed(1)}% to $${this.state.midPrice.toFixed(2)}`);

    // Per-agent structured breakdown for the UI (spread income vs. news-driven
    // mark-to-market, not just a flattened P&L number).
    const agentBreakdown: Record<string, {
      quote: { bid: number; ask: number } | null;
      fills: number;
      spreadIncome: number;
      invChange: number;
      inventoryBefore: number;
      inventoryAfter: number;
      pnlDelta: number;
      invalid: boolean;
    }> = {};

    for (const agentId of this.agentIds) {
      const q = this.pendingActions[agentId];
      const inventoryBefore = this.state.agentInventory[agentId];

      if (!q || q.bid >= q.ask || q.bid <= 0) {
        events.push(`⚠ ${agentId} — invalid or missing quote, skipped`);
        agentBreakdown[agentId] = {
          quote: null, fills: 0, spreadIncome: 0, invChange: 0,
          inventoryBefore, inventoryAfter: inventoryBefore, pnlDelta: 0, invalid: true,
        };
        continue;
      }

      const spread = q.ask - q.bid;
      const midP = this.state.midPrice;
      const spreadPct = spread / midP;
      const maxFills = Math.max(1, Math.round(20 * (1 - Math.min(spreadPct / 0.05, 1))));
      const buyFills = Math.floor(Math.random() * maxFills);
      const sellFills = Math.floor(Math.random() * maxFills);

      const actualSell = Math.min(buyFills, inventoryBefore + q.maxInventory);
      const actualBuy = Math.min(sellFills, q.maxInventory - inventoryBefore);

      const spreadIncome = (actualSell + actualBuy) * (spread / 2);
      this.state.agentInventory[agentId] += actualBuy - actualSell;
      const inventoryAfter = this.state.agentInventory[agentId];
      const invChange = (this.state.midPrice - prevPrice) * inventoryAfter;

      const roundPnL = spreadIncome + invChange;
      this.state.agentPnL[agentId] += roundPnL;
      this.state.agentQuotes[agentId] = { bid: q.bid, ask: q.ask };

      agentBreakdown[agentId] = {
        quote: { bid: q.bid, ask: q.ask },
        fills: actualBuy + actualSell,
        spreadIncome,
        invChange,
        inventoryBefore,
        inventoryAfter,
        pnlDelta: roundPnL,
        invalid: false,
      };

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
        prevPrice,
        news: { description: news.description, type: news.type, impactPct: news.priceImpact },
        inventory: { ...this.state.agentInventory },
        quotes: { ...this.state.agentQuotes },
        reasoning: { ...this.pendingReasonings },
        breakdown: agentBreakdown,
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
