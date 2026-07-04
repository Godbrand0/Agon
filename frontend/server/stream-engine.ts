/**
 * Fuel stream engine — pulls micropayments from an owner's wallet into their
 * agent's operating wallet on an interval.
 *
 * Trust model (approve-and-pull): the owner signs ONE USDC `approve` giving
 * the orchestrator wallet an allowance; each tick the orchestrator calls
 * `transferFrom(owner → agentWallet, rate)` on Arc's native USDC. Every tick
 * is a real on-chain transfer with an ArcScan-visible hash.
 *
 * Degrades gracefully: without chain env (or on transfer failure) ticks are
 * simulated with `sim_` hashes. Three consecutive failures auto-stop a stream.
 */

import { supabaseAdmin } from "../lib/supabase";
import {
  tryGetOrchestratorWallet,
  getPublicClient,
  isStreamChainReady,
  simTxHash,
  USDC_ERC20_ABI,
  USDC_ADDRESS,
} from "../lib/contracts";

const MIN_INTERVAL_S = 3;
const MAX_FAILURES = 3;

interface RunningStream {
  timer: NodeJS.Timeout;
  failures: number;
}

// Module-level registry (survives across requests in one server process)
const running = new Map<string, RunningStream>();

export function isStreamRunning(streamId: string): boolean {
  return running.has(streamId);
}

export async function startStream(streamId: string): Promise<void> {
  if (running.has(streamId)) return;

  const db = supabaseAdmin();
  const { data: stream } = await db
    .from("streams")
    .select("*, agents(wallet_address, name)")
    .eq("id", streamId)
    .single();

  if (!stream || stream.status !== "ACTIVE") return;

  const intervalMs = Math.max(stream.interval_seconds, MIN_INTERVAL_S) * 1000;
  const timer = setInterval(() => void tick(streamId), intervalMs);
  running.set(streamId, { timer, failures: 0 });
  console.log(`[stream] started ${streamId} → ${stream.agents?.name} · ${stream.rate} USDC every ${stream.interval_seconds}s`);
}

export function stopStreamTimer(streamId: string): void {
  const entry = running.get(streamId);
  if (entry) {
    clearInterval(entry.timer);
    running.delete(streamId);
  }
}

/** Re-arm timers for ACTIVE streams after a server restart (lazy, idempotent). */
export async function resumeActiveStreams(): Promise<void> {
  const db = supabaseAdmin();
  const { data: active } = await db.from("streams").select("id").eq("status", "ACTIVE");
  for (const s of active ?? []) {
    if (!running.has(s.id)) await startStream(s.id);
  }
}

async function tick(streamId: string): Promise<void> {
  const db = supabaseAdmin();
  const entry = running.get(streamId);
  if (!entry) return;

  const { data: stream } = await db
    .from("streams")
    .select("*, agents(wallet_address)")
    .eq("id", streamId)
    .single();

  if (!stream || stream.status !== "ACTIVE") {
    stopStreamTimer(streamId);
    return;
  }

  const agentWallet: string | undefined = stream.agents?.wallet_address;
  if (!agentWallet) {
    await failStream(streamId, "Agent has no wallet address");
    return;
  }

  let txHash: string | null = null;

  if (isStreamChainReady()) {
    txHash = await pullOnChain(stream.owner_address, agentWallet, Number(stream.rate));
  }

  if (txHash === null && isStreamChainReady()) {
    // Real mode but the pull failed (no allowance / no balance / RPC error)
    entry.failures += 1;
    if (entry.failures >= MAX_FAILURES) {
      await failStream(streamId, "Transfer failed repeatedly — check USDC allowance and balance");
    }
    return;
  }

  entry.failures = 0;
  const finalHash = txHash ?? simTxHash();

  await db.from("stream_ticks").insert({
    stream_id: streamId,
    agent_id: stream.agent_id,
    amount: stream.rate,
    tx_hash: finalHash,
  });

  await db.from("streams").update({
    total_streamed: Number(stream.total_streamed) + Number(stream.rate),
    tick_count: stream.tick_count + 1,
    last_tick_at: new Date().toISOString(),
    last_error: null,
  }).eq("id", streamId);
}

async function pullOnChain(owner: string, agentWallet: string, rate: number): Promise<string | null> {
  try {
    const wallet = tryGetOrchestratorWallet();
    // tryGetOrchestratorWallet also checks contract addresses which streaming
    // doesn't need — build directly if that gate failed but stream env is fine
    const client = wallet ?? (await import("../lib/contracts")).getOrchestratorWallet();

    const units = BigInt(Math.round(rate * 1e6)); // ERC-20 view: 6 decimals
    const hash = await client.writeContract({
      address: USDC_ADDRESS,
      abi: USDC_ERC20_ABI,
      functionName: "transferFrom",
      args: [owner as `0x${string}`, agentWallet as `0x${string}`, units],
    });

    const receipt = await getPublicClient().waitForTransactionReceipt({ hash, timeout: 30_000 });
    return receipt.status === "success" ? hash : null;
  } catch (e) {
    console.warn("[stream] on-chain pull failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

async function failStream(streamId: string, reason: string): Promise<void> {
  stopStreamTimer(streamId);
  const db = supabaseAdmin();
  await db.from("streams").update({
    status: "FAILED",
    last_error: reason,
    stopped_at: new Date().toISOString(),
  }).eq("id", streamId);
  console.warn(`[stream] ${streamId} stopped: ${reason}`);
}
