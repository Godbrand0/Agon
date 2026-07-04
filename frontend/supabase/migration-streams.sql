-- ═══════════════════════════════════════════════════════════════════════════
-- Fuel streams — owners stream micropayments into their agent's wallet.
-- Run in the Supabase SQL editor (after schema.sql).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists streams (
  id               uuid primary key default gen_random_uuid(),
  agent_id         uuid references agents(id) not null,
  owner_address    text not null,
  rate             numeric(20,6) not null,      -- USDC per tick
  interval_seconds integer not null default 5,
  status           text not null default 'ACTIVE' check (status in ('ACTIVE','STOPPED','FAILED')),
  total_streamed   numeric(20,6) not null default 0,
  tick_count       integer not null default 0,
  last_tick_at     timestamptz,
  last_error       text,
  created_at       timestamptz not null default now(),
  stopped_at       timestamptz
);

create table if not exists stream_ticks (
  id          uuid primary key default gen_random_uuid(),
  stream_id   uuid references streams(id) not null,
  agent_id    uuid references agents(id) not null,
  amount      numeric(20,6) not null,
  tx_hash     text,                              -- real 0x… or sim_0x…
  created_at  timestamptz not null default now()
);

create index if not exists idx_streams_agent      on streams(agent_id);
create index if not exists idx_streams_status     on streams(status);
create index if not exists idx_stream_ticks_agent on stream_ticks(agent_id);
create index if not exists idx_stream_ticks_stream on stream_ticks(stream_id);

alter publication supabase_realtime add table streams;
alter publication supabase_realtime add table stream_ticks;
