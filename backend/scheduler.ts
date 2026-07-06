/**
 * Agōn scheduler — the persistent process Vercel can't provide.
 *
 * The frontend's match-creation route schedules a match's start via
 * `setTimeout`, and the fuel-stream engine keeps active streams in an
 * in-memory Map — both assume a long-lived Node process. Vercel serverless
 * functions terminate as soon as they return a response, so neither ever
 * actually fires in production; matches sit stuck in BETTING_OPEN forever.
 *
 * This worker polls Supabase directly and drives the SAME orchestrator/
 * stream-engine code the frontend already has (imported by relative path,
 * not duplicated) — so there's one source of truth for match logic, and
 * this process just supplies the "stays alive" part that was missing.
 *
 * Render's free tier only offers Web Services, not Background Workers —
 * so this also binds a trivial HTTP health-check endpoint on $PORT to pass
 * as a "web service" while the actual work happens in the poll loop below.
 * Free web services still sleep after ~15 min with no HTTP traffic, so pair
 * this with an external uptime pinger (e.g. UptimeRobot, cron-job.org) hitting
 * the deployed URL every ~10 minutes to keep it awake.
 */

import http from "node:http";
import { supabaseAdmin } from "../frontend/lib/supabase";
import { MatchOrchestrator } from "../frontend/server/orchestrator";
import { resumeActiveStreams } from "../frontend/server/stream-engine";

const POLL_INTERVAL_MS = 5000;

// Tracks matches this process has already kicked off, so an overlapping
// poll tick can't fire the same match twice before its state flips out of
// BETTING_OPEN.
const inFlight = new Set<string>();

async function pollDueMatches(): Promise<void> {
  const db = supabaseAdmin();

  const { data: due, error } = await db
    .from("matches")
    .select("id, starts_at")
    .eq("state", "BETTING_OPEN")
    .lte("betting_deadline", new Date().toISOString());

  if (error) {
    console.error("[scheduler] poll failed:", error.message);
    return;
  }

  for (const match of due ?? []) {
    if (inFlight.has(match.id)) continue;
    inFlight.add(match.id);

    console.log(`[scheduler] starting match ${match.id} (was due ${match.starts_at})`);
    new MatchOrchestrator()
      .runMatch(match.id)
      .then(() => console.log(`[scheduler] match ${match.id} finished`))
      .catch((e) => console.error(`[scheduler] match ${match.id} failed:`, e))
      .finally(() => inFlight.delete(match.id));
  }
}

async function main() {
  console.log("[scheduler] Agōn backend worker starting…");

  const required = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NVIDIA_API_KEY"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`[scheduler] missing required env vars: ${missing.join(", ")}`);
    process.exit(1);
  }

  await resumeActiveStreams();
  console.log("[scheduler] fuel streams resumed, polling for due matches every", POLL_INTERVAL_MS / 1000, "s");

  setInterval(() => void pollDueMatches(), POLL_INTERVAL_MS);
  void pollDueMatches(); // don't wait a full interval for the first check

  // Render (and most PaaS "web service" health checks) require a bound port
  const port = Number(process.env.PORT) || 3001;
  http
    .createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Agōn scheduler is running.\n");
    })
    .listen(port, () => console.log(`[scheduler] health check listening on :${port}`));
}

process.on("SIGTERM", () => {
  console.log("[scheduler] SIGTERM received, shutting down");
  process.exit(0);
});

main().catch((e) => {
  console.error("[scheduler] fatal startup error:", e);
  process.exit(1);
});
