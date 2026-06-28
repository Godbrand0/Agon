import type { IGameEngine, GameType, AgentAction, RoundResult, MatchResult } from "../types";
import { buildLWPrompt } from "./prompts";

interface Position {
  lowerTick: number;
  upperTick: number;
  liquidity: number;
  feesEarned: number;
  ilLoss: number;
  entryPrice: number;
}

interface LWState {
  currentPrice: number;
  priceHistory: number[];
  totalLiquidity: number;
  agentPositions: Record<string, Position | null>;
  round: number;
}

interface LWAction {
  lowerTick: number;
  upperTick: number;
  liquidity: number;
  withdraw: boolean;
  reasoning?: string;
}

const FEE_RATE = 0.003;

export class LiquidityWarsEngine implements IGameEngine {
  gameType: GameType = "LIQUIDITY_WARS";
  totalRounds = 3;

  private agentIds: string[] = [];
  private state!: LWState;
  private roundResults: RoundResult[] = [];
  private startTime = 0;
  private pendingActions: Record<string, LWAction> = {};
  private pendingReasonings: Record<string, string> = {};
  private roundWins: Record<string, number> = {};

  initialize(agentIds: string[]): void {
    this.agentIds = agentIds;
    this.startTime = Date.now();
    this.roundWins = Object.fromEntries(agentIds.map((id) => [id, 0]));
    this.state = {
      currentPrice: 100,
      priceHistory: [100],
      totalLiquidity: 0,
      agentPositions: Object.fromEntries(agentIds.map((id) => [id, null])),
      round: 0,
    };
  }

  getAgentPrompt(agentId: string, round: number): string {
    return buildLWPrompt({ ...this.state, round }, agentId);
  }

  processAgentAction(agentId: string, action: AgentAction): void {
    const a = action.action as unknown as LWAction;
    this.pendingReasonings[agentId] = a.reasoning ?? "No reasoning provided.";
    this.pendingActions[agentId] = {
      lowerTick: Number(a.lowerTick),
      upperTick: Number(a.upperTick),
      liquidity: Math.min(100, Math.max(1, Math.round(Number(a.liquidity)))),
      withdraw: Boolean(a.withdraw),
    };
  }

  async runRound(): Promise<RoundResult> {
    this.state.round++;
    const events: string[] = [];
    const prevScores = Object.fromEntries(
      this.agentIds.map((id) => {
        const pos = this.state.agentPositions[id];
        return [id, pos ? pos.feesEarned - pos.ilLoss : 0];
      })
    );

    const drift = (100 - this.state.currentPrice) * 0.05;
    const shock = (Math.random() - 0.5) * 8;
    this.state.currentPrice = Math.max(50, this.state.currentPrice + drift + shock);
    this.state.priceHistory.push(this.state.currentPrice);
    events.push(`📊 Price moved to $${this.state.currentPrice.toFixed(2)}`);

    for (const agentId of this.agentIds) {
      const a = this.pendingActions[agentId];
      if (!a) continue;

      if (a.withdraw || this.state.agentPositions[agentId] === null) {
        this.state.agentPositions[agentId] = {
          lowerTick:  a.lowerTick,
          upperTick:  a.upperTick,
          liquidity:  a.liquidity,
          feesEarned: this.state.agentPositions[agentId]?.feesEarned ?? 0,
          ilLoss:     this.state.agentPositions[agentId]?.ilLoss ?? 0,
          entryPrice: this.state.currentPrice,
        };
      }
    }

    const price = this.state.currentPrice;
    const syntheticVolume = 500 + Math.random() * 500;

    const activeLiq = this.agentIds.reduce((sum, id) => {
      const pos = this.state.agentPositions[id];
      if (!pos) return sum;
      return pos.lowerTick <= price && price <= pos.upperTick ? sum + pos.liquidity : sum;
    }, 0);

    for (const agentId of this.agentIds) {
      const pos = this.state.agentPositions[agentId];
      if (!pos) continue;

      const inRange = pos.lowerTick <= price && price <= pos.upperTick;
      if (inRange && activeLiq > 0) {
        const share = pos.liquidity / activeLiq;
        const fees = syntheticVolume * FEE_RATE * share;
        pos.feesEarned += fees;
        events.push(`✅ In range $${pos.lowerTick}-$${pos.upperTick} · ${(share * 100).toFixed(1)}% share · +$${fees.toFixed(2)} fees`);
      } else {
        const ilThisRound = Math.abs(Math.sqrt(price / pos.entryPrice) - 1) * pos.liquidity * 0.5;
        pos.ilLoss += ilThisRound;
        events.push(`❌ Out of range · IL: -$${ilThisRound.toFixed(2)}`);
        pos.entryPrice = price;
      }
    }

    const scores = Object.fromEntries(
      this.agentIds.map((id) => {
        const pos = this.state.agentPositions[id];
        return [id, pos ? pos.feesEarned - pos.ilLoss : 0];
      })
    );

    const roundDelta: Record<string, number> = Object.fromEntries(
      this.agentIds.map((id) => [id, (scores[id] ?? 0) - (prevScores[id] ?? 0)])
    );

    const roundWinner = Object.entries(roundDelta).sort(([, a], [, b]) => b - a)[0][0];
    this.roundWins[roundWinner] = (this.roundWins[roundWinner] ?? 0) + 1;

    const result: RoundResult = {
      round: this.state.round,
      scores,
      events,
      roundWinner,
      roundDelta,
      state: {
        currentPrice: price,
        priceHistory: [...this.state.priceHistory],
        positions: { ...this.state.agentPositions },
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
    const finalScores: Record<string, number> = {};
    for (const id of this.agentIds) {
      const pos = this.state.agentPositions[id];
      finalScores[id] = pos ? pos.feesEarned - pos.ilLoss : 0;
    }
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
