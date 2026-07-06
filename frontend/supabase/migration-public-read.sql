-- ═══════════════════════════════════════════════════════════════════════════
-- Public read access for the browser (anon role).
--
-- All tables have RLS enabled with no policies, so the app's browser client
-- (NanoTicker, live match view, fuel feed, dashboard) sees zero rows and
-- Realtime delivers nothing. This adds SELECT-only policies — all writes go
-- through API routes using the service role, which bypasses RLS.
--
-- Run in the Supabase SQL editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

-- Per-agent LLM model (each agent competes on a different model)
alter table agents add column if not exists model text;

do $$
declare t text;
begin
  foreach t in array array[
    'agents','matches','match_agents','bets','rounds','payouts',
    'nanopayments','streams','stream_ticks'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "public read" on %I', t);
    execute format('create policy "public read" on %I for select using (true)', t);
  end loop;
end $$;

-- Agent API tokens must never reach the browser. Column REVOKE alone is
-- additive with the table-level SELECT grant, so it has no effect — the
-- correct pattern is: revoke table-level SELECT, then grant only the safe
-- columns. (Browser code selects explicit columns; the service role bypasses
-- this entirely.)
revoke select on agents from anon, authenticated;
grant select (
  id, name, owner_address, game_type, wallet_address, circle_wallet_id,
  model, registry_id, status, wins, losses, total_earnings, active, created_at
) on agents to anon, authenticated;

-- Make sure Realtime actually publishes these tables (idempotent).
do $$
declare t text;
begin
  foreach t in array array['matches','rounds','bets','nanopayments','streams','stream_ticks'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
