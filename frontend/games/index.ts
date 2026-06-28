import type { IGameEngine, GameType } from "./types";
import { MarketMakerEngine } from "./market-maker/engine";
import { LiquidityWarsEngine } from "./liquidity-wars/engine";
import { DebtCollectorEngine } from "./debt-collector/engine";

export function getGameEngine(gameType: GameType): IGameEngine {
  switch (gameType) {
    case "MARKET_MAKER":    return new MarketMakerEngine();
    case "LIQUIDITY_WARS":  return new LiquidityWarsEngine();
    case "DEBT_COLLECTOR":  return new DebtCollectorEngine();
    default:
      throw new Error(`Unknown game type: ${gameType}`);
  }
}

export { MarketMakerEngine } from "./market-maker/engine";
export { LiquidityWarsEngine } from "./liquidity-wars/engine";
export { DebtCollectorEngine } from "./debt-collector/engine";
export type { IGameEngine, GameType, RoundResult, MatchResult, AgentAction } from "./types";
