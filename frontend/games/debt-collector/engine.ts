import type { IGameEngine, GameType, AgentAction, RoundResult, MatchResult } from "../types";
import { buildDCPrompt } from "./prompts";

interface Loan {
  id: string;
  borrower: string;
  principal: number;
  collateralValue: number;
  collateralType: "BTC" | "ETH" | "SOL";
  healthFactor: number;
  recoveryPotential: number;
}

interface DCState {
  loans: Loan[];
  marketMovements: Record<string, number>;
  agentRecovered: Record<string, number>;
  agentHolding: Record<string, string[]>;
  round: number;
}

interface DCAction {
  liquidate: string[];
  hold: string[];
  restructure: string[];
  reasoning?: string;
}

function generateLoans(count: number): Loan[] {
  const collateralTypes = ["BTC", "ETH", "SOL"] as const;
  const borrowerNames = ["0xAlpha", "0xBeta", "0xGamma", "0xDelta", "0xEpsilon", "0xZeta"];
  return Array.from({ length: count }, (_, i) => {
    const principal = 1000 + Math.random() * 9000;
    const hf = 0.3 + Math.random() * 0.9;
    return {
      id: `loan_${i + 1}`,
      borrower: borrowerNames[i % borrowerNames.length],
      principal,
      collateralValue: principal * hf,
      collateralType: collateralTypes[i % 3],
      healthFactor: hf,
      recoveryPotential: 0.2 + Math.random() * 0.6,
    };
  });
}

export class DebtCollectorEngine implements IGameEngine {
  gameType: GameType = "DEBT_COLLECTOR";
  totalRounds = 3;

  private agentIds: string[] = [];
  private state!: DCState;
  private roundResults: RoundResult[] = [];
  private startTime = 0;
  private pendingActions: Record<string, DCAction> = {};
  private pendingReasonings: Record<string, string> = {};
  private roundWins: Record<string, number> = {};

  initialize(agentIds: string[]): void {
    this.agentIds = agentIds;
    this.startTime = Date.now();
    this.roundWins = Object.fromEntries(agentIds.map((id) => [id, 0]));

    const allLoans = generateLoans(agentIds.length * 3);
    const agentHolding: Record<string, string[]> = Object.fromEntries(agentIds.map((id) => [id, []]));
    allLoans.forEach((loan, i) => {
      agentHolding[agentIds[i % agentIds.length]].push(loan.id);
    });

    this.state = {
      loans: allLoans,
      marketMovements: { BTC: 0, ETH: 0, SOL: 0 },
      agentRecovered: Object.fromEntries(agentIds.map((id) => [id, 0])),
      agentHolding,
      round: 0,
    };
  }

  getAgentPrompt(agentId: string, round: number): string {
    return buildDCPrompt({ ...this.state, round }, agentId);
  }

  processAgentAction(agentId: string, action: AgentAction): void {
    const a = action.action as unknown as DCAction;
    this.pendingReasonings[agentId] = a.reasoning ?? "No reasoning provided.";
    this.pendingActions[agentId] = {
      liquidate: Array.isArray(a.liquidate) ? a.liquidate : [],
      hold: Array.isArray(a.hold) ? a.hold : [],
      restructure: Array.isArray(a.restructure) ? a.restructure : [],
    };
  }

  async runRound(): Promise<RoundResult> {
    this.state.round++;
    const events: string[] = [];
    const prevRecovered = { ...this.state.agentRecovered };

    const movements = {
      BTC: (Math.random() - 0.45) * 0.15,
      ETH: (Math.random() - 0.45) * 0.12,
      SOL: (Math.random() - 0.45) * 0.18,
    };
    this.state.marketMovements = movements;
    events.push(
      `📊 Market: BTC ${movements.BTC >= 0 ? "+" : ""}${(movements.BTC * 100).toFixed(1)}% · ` +
      `ETH ${movements.ETH >= 0 ? "+" : ""}${(movements.ETH * 100).toFixed(1)}% · ` +
      `SOL ${movements.SOL >= 0 ? "+" : ""}${(movements.SOL * 100).toFixed(1)}%`
    );

    for (const loan of this.state.loans) {
      const mov = movements[loan.collateralType];
      loan.collateralValue *= 1 + mov;
      loan.healthFactor = loan.collateralValue / loan.principal;
    }

    for (const agentId of this.agentIds) {
      const a = this.pendingActions[agentId];
      if (!a) continue;

      const myLoans = new Set(this.state.agentHolding[agentId]);

      for (const loanId of a.liquidate) {
        if (!myLoans.has(loanId)) continue;
        const loan = this.state.loans.find((l) => l.id === loanId);
        if (!loan) continue;
        const recoveryRate = loan.healthFactor < 0.5 ? 0.6 : loan.healthFactor < 0.8 ? 0.9 : 1.0;
        const recovered = loan.collateralValue * recoveryRate;
        this.state.agentRecovered[agentId] += recovered;
        myLoans.delete(loanId);
        events.push(`⚡ LIQUIDATED ${loanId} → +$${recovered.toFixed(0)}`);
      }

      for (const loanId of a.restructure) {
        if (!myLoans.has(loanId)) continue;
        const loan = this.state.loans.find((l) => l.id === loanId);
        if (!loan) continue;
        const recovered = loan.principal * 0.75;
        this.state.agentRecovered[agentId] += recovered;
        myLoans.delete(loanId);
        events.push(`🔄 RESTRUCTURED ${loanId} → +$${recovered.toFixed(0)}`);
      }

      this.state.agentHolding[agentId] = Array.from(myLoans);
    }

    const scores = { ...this.state.agentRecovered };
    const roundDelta: Record<string, number> = Object.fromEntries(
      this.agentIds.map((id) => [id, (scores[id] ?? 0) - (prevRecovered[id] ?? 0)])
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
        marketMovements: { ...movements },
        agentRecovered: { ...this.state.agentRecovered },
        loansRemaining: Object.fromEntries(
          this.agentIds.map((id) => [id, this.state.agentHolding[id].length])
        ),
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
    const finalScores = { ...this.state.agentRecovered };
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
