import type { GameType } from "./database.types";

/**
 * Launch configuration: which games are live in this build.
 *
 * Market Maker Duel is the showcase game for the hackathon demo.
 * Liquidity Wars and Debt Collector engines exist but are locked —
 * they appear in the UI as "coming soon" and are rejected by the API.
 */
export const ENABLED_GAMES: GameType[] = ["MARKET_MAKER"];

export const ALL_GAMES: GameType[] = ["MARKET_MAKER", "LIQUIDITY_WARS", "DEBT_COLLECTOR"];

export function isGameEnabled(gameType: GameType): boolean {
  return ENABLED_GAMES.includes(gameType);
}

export const GAME_LOCKED_MESSAGE = "This arena is locked for launch — Market Maker Duel is live now.";
