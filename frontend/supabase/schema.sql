-- ═══════════════════════════════════════════════════════════════════════════
-- Agōn — Supabase schema
-- Run this once in the Supabase SQL editor (Dashboard → SQL → New query).
-- Matches lib/database.types.ts.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists agents (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  owner_address   text not null,
  game_type       text not null check (game_type in ('MARKET_MAKER', 'LIQUIDITY_WARS', 'DEBT_COLLECTOR')),
  wallet_address  text not null,            -- Circle operating wallet address (nanopayments)
  circle_wallet_id text,                    -- Circle dev-controlled wallet ID (null in sim mode)
  registry_id     bigint,                   -- on-chain AgentRegistry ID (null in sim mode)
  api_token       text not null,
  status          text not null default 'OFFLINE' check (status in ('OFFLINE', 'READY', 'IN_MATCH')),
  wins            integer not null default 0,
  losses          integer not null default 0,
  total_earnings  numeric(20,6) not null default 0,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

create table if not exists matches (
  id                 uuid primary key default gen_random_uuid(),
  game_type          text not null check (game_type in ('MARKET_MAKER', 'LIQUIDITY_WARS', 'DEBT_COLLECTOR')),
  state              text not null default 'BETTING_OPEN'
    check (state in ('BETTING_OPEN','BETTING_CLOSED','PLAYING','RESOLVED','CANCELLED')),
  agent_ids          uuid[] not null,
  winner_id          uuid references agents(id),
  total_pot          numeric(20,6) not null default 0,
  starts_at          timestamptz not null,
  betting_deadline   timestamptz not null,
  started_at         timestamptz,
  resolved_at        timestamptz,
  contract_match_id  bigint,                -- on-chain MatchEscrow ID (null in sim mode)
  created_at         timestamptz not null default now()
);

create table if not exists match_agents (
  match_id     uuid references matches(id) not null,
  agent_id     uuid references agents(id) not null,
  final_score  numeric(20,6),
  rank         integer,
  earnings     numeric(20,6) not null default 0,
  primary key (match_id, agent_id)
);

create table if not exists bets (
  id             uuid primary key default gen_random_uuid(),
  match_id       uuid references matches(id) not null,
  user_address   text not null,
  agent_id       uuid references agents(id) not null,
  amount         numeric(20,6) not null,
  tx_hash        text,                      -- real 0x… or sim_0x… in demo mode
  claim_tx_hash  text,
  payout         numeric(20,6),             -- null until resolved
  profit         numeric(20,6),             -- null until resolved
  won            boolean,                   -- null until resolved
  claimed        boolean,
  placed_at      timestamptz not null default now()
);

create table if not exists rounds (
  id            uuid primary key default gen_random_uuid(),
  match_id      uuid references matches(id) not null,
  round_number  integer not null,
  scores        jsonb not null,             -- { agentId: score }
  events        text[] not null,
  state         jsonb not null,             -- full game state snapshot (incl. agent reasoning)
  created_at    timestamptz not null default now()
);

create table if not exists payouts (
  id                 uuid primary key default gen_random_uuid(),
  match_id           uuid references matches(id) not null,
  recipient_address  text not null,
  recipient_type     text not null check (recipient_type in ('BETTOR','AGENT','PLATFORM')),
  amount             numeric(20,6) not null,
  tx_hash            text,
  created_at         timestamptz not null default now()
);

-- M2M nanopayment ledger: every entry/oracle/action fee an agent pays.
-- Powers the live "agent economics" ticker in the UI.
create table if not exists nanopayments (
  id           uuid primary key default gen_random_uuid(),
  agent_id     uuid references agents(id) not null,
  match_id     uuid references matches(id),
  kind         text not null check (kind in ('ENTRY_FEE','ORACLE_FEE','ACTION_FEE')),
  amount       numeric(20,6) not null,
  from_wallet  text not null,
  to_wallet    text not null,
  reason       text,
  tx_hash      text,
  created_at   timestamptz not null default now()
);

-- Idempotent migration for databases created before circle_wallet_id existed
alter table agents add column if not exists circle_wallet_id text;

-- Indexes
create index if not exists idx_bets_match          on bets(match_id);
create index if not exists idx_bets_user           on bets(user_address);
create index if not exists idx_matches_state       on matches(state);
create index if not exists idx_matches_game_type   on matches(game_type);
create index if not exists idx_rounds_match        on rounds(match_id);
create index if not exists idx_payouts_match       on payouts(match_id);
create index if not exists idx_nanopayments_agent  on nanopayments(agent_id);
create index if not exists idx_nanopayments_match  on nanopayments(match_id);
create index if not exists idx_agents_game_type    on agents(game_type);

-- Realtime: live match updates in the UI
alter publication supabase_realtime add table rounds;
alter publication supabase_realtime add table matches;
alter publication supabase_realtime add table bets;
alter publication supabase_realtime add table nanopayments;
