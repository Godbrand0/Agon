export type GameType = "MARKET_MAKER" | "LIQUIDITY_WARS" | "DEBT_COLLECTOR";
export type MatchState = "BETTING_OPEN" | "BETTING_CLOSED" | "PLAYING" | "RESOLVED" | "CANCELLED";
export type PayoutRecipientType = "BETTOR" | "AGENT" | "PLATFORM";

export interface Agent {
  id: string;
  name: string;
  owner_address: string;
  game_type: GameType;
  wallet_address: string;
  registry_id: number | null;
  api_token: string;
  status: "OFFLINE" | "READY" | "IN_MATCH";
  wins: number;
  losses: number;
  total_earnings: number;
  active: boolean;
  created_at: string;
}

export interface Match {
  id: string;
  game_type: GameType;
  state: MatchState;
  agent_ids: string[];
  winner_id: string | null;
  total_pot: number;
  starts_at: string;           // scheduled start time
  betting_deadline: string;    // starts_at - 2 minutes
  started_at: string | null;
  resolved_at: string | null;
  contract_match_id: number | null;
  created_at: string;
}

export interface MatchAgent {
  match_id: string;
  agent_id: string;
  final_score: number | null;
  rank: number | null;
  earnings: number;
}

export interface Bet {
  id: string;
  match_id: string;
  user_address: string;
  agent_id: string;
  amount: number;
  tx_hash: string | null;
  claim_tx_hash: string | null;
  payout: number | null;
  profit: number | null;
  won: boolean | null;
  claimed: boolean | null;
  placed_at: string;
}

export interface Round {
  id: string;
  match_id: string;
  round_number: number;
  scores: Record<string, number>;
  events: string[];
  state: Record<string, unknown>;
  created_at: string;
}

export interface Payout {
  id: string;
  match_id: string;
  recipient_address: string;
  recipient_type: PayoutRecipientType;
  amount: number;
  tx_hash: string | null;
  created_at: string;
}

// Supabase generic Database type shape
export type Database = {
  public: {
    Tables: {
      agents:       { Row: Agent;      Insert: Omit<Agent, "id" | "created_at">; Update: Partial<Agent> };
      matches:      { Row: Match;      Insert: Omit<Match, "id" | "created_at">; Update: Partial<Match> };
      match_agents: { Row: MatchAgent; Insert: MatchAgent; Update: Partial<MatchAgent> };
      bets:         { Row: Bet;        Insert: Omit<Bet, "id" | "placed_at">;    Update: Partial<Bet> };
      rounds:       { Row: Round;      Insert: Omit<Round, "id" | "created_at">; Update: Partial<Round> };
      payouts:      { Row: Payout;     Insert: Omit<Payout, "id" | "created_at">; Update: Partial<Payout> };
    };
  };
};
