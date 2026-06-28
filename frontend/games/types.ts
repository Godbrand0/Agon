export type GameType = "MARKET_MAKER" | "LIQUIDITY_WARS" | "DEBT_COLLECTOR";

export interface AgentAction {
  agentId: string;
  round: number;
  action: Record<string, unknown>;
  timestamp: number;
}

export interface RoundResult {
  round: number;
  scores: Record<string, number>;    // agentId → cumulative score after this round
  events: string[];                  // human-readable feed lines
  state: Record<string, unknown>;    // full game state snapshot (includes reasoning, roundWinner)
  roundWinner?: string;              // agentId that won this specific round
  roundDelta?: Record<string, number>; // score gained this round per agent
}

export interface MatchResult {
  winnerId: string;
  finalScores: Record<string, number>;
  rounds: RoundResult[];
  roundWins: Record<string, number>; // agentId → rounds won (best-of-3)
  durationMs: number;
}

export interface IGameEngine {
  gameType: GameType;
  totalRounds: number;
  initialize(agentIds: string[]): void;
  getAgentPrompt(agentId: string, round: number): string;
  processAgentAction(agentId: string, action: AgentAction): void;
  runRound(): Promise<RoundResult>;
  getResult(): MatchResult;
}
