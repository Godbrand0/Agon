"use client";

/**
 * ⛽ Fuel stream — stream micropayments from your wallet into an agent's
 * operating wallet.
 *
 * Flow: connect wallet → approve a USDC budget to the platform spender
 * (one signature) → start the stream. The server then pulls `rate` USDC
 * every `interval` seconds via transferFrom; each tick is a real Arc
 * transfer (or simulated when the chain isn't configured).
 */

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Fuel, Play, Square, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useWallet, approveUSDC } from "@/lib/wallet";
import { cn } from "@/lib/utils";

interface Stream {
  id: string;
  status: "ACTIVE" | "STOPPED" | "FAILED";
  rate: number;
  interval_seconds: number;
  total_streamed: number;
  tick_count: number;
  last_error: string | null;
}

interface Tick {
  id: string;
  amount: number;
  tx_hash: string | null;
  created_at: string;
}

interface Props {
  agentId: string;
  agentName: string;
  agentWallet: string;
}

export default function FuelAgentCard({ agentId, agentName, agentWallet }: Props) {
  const { address, isConnected, connect } = useWallet();
  const [spender, setSpender] = useState<string | null>(null);
  const [chainReady, setChainReady] = useState(false);
  const [stream, setStream] = useState<Stream | null>(null);
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [budget, setBudget] = useState(10);
  const [rate, setRate] = useState(0.01);
  const [interval_, setInterval_] = useState(5);
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState<"approve" | "start" | "stop" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const params = new URLSearchParams({ agentId });
    if (address) params.set("ownerAddress", address);
    const res = await fetch(`/api/stream?${params}`);
    if (!res.ok) return;
    const data = await res.json();
    setSpender(data.spender);
    setChainReady(data.chainReady);
    const active = (data.streams as Stream[]).find((s) => s.status === "ACTIVE");
    setStream(active ?? (data.streams as Stream[])[0] ?? null);
  }, [agentId, address]);

  useEffect(() => { refresh(); }, [refresh]);

  // Live tick feed
  useEffect(() => {
    supabase
      .from("stream_ticks")
      .select("id, amount, tx_hash, created_at")
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false })
      .limit(8)
      .then(({ data }) => { if (data) setTicks(data as Tick[]); });

    const channel = supabase
      .channel(`fuel-${agentId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "stream_ticks", filter: `agent_id=eq.${agentId}` },
        (payload) => {
          setTicks((prev) => [payload.new as Tick, ...prev].slice(0, 8));
          refresh();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [agentId, refresh]);

  async function handleApprove() {
    if (!spender) { setError("Platform spender not configured"); return; }
    setBusy("approve");
    setError(null);
    try {
      await approveUSDC(budget, spender);
      setApproved(true);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e).slice(0, 140));
    } finally {
      setBusy(null);
    }
  }

  async function handleStart() {
    if (!address) return;
    setBusy("start");
    setError(null);
    try {
      const res = await fetch("/api/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", agentId, ownerAddress: address, rate, intervalSeconds: interval_ }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start stream");
      setStream(data);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e).slice(0, 140));
    } finally {
      setBusy(null);
    }
  }

  async function handleStop() {
    if (!address || !stream) return;
    setBusy("stop");
    try {
      await fetch("/api/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop", streamId: stream.id, ownerAddress: address }),
      });
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  const isStreaming = stream?.status === "ACTIVE";

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Fuel className="h-4 w-4 text-agon-green" />
          <p className="text-sm font-semibold text-foreground">Fuel Stream</p>
        </div>
        {isStreaming && (
          <span className="flex items-center gap-1.5 text-xs text-agon-green font-medium">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-agon-green" /> Streaming
          </span>
        )}
      </div>

      <div className="p-4 space-y-4">
        <p className="text-xs text-muted-foreground">
          Stream USDC into {agentName}&apos;s operating wallet so it can keep paying match
          entry, oracle, and action fees. One approval, then the platform pulls your set
          rate on an interval — every tick settles on Arc.
          {!chainReady && " (Chain not configured — ticks will be simulated.)"}
        </p>

        {!isConnected ? (
          <Button onClick={connect} className="w-full bg-agon-green text-background hover:bg-agon-green-dim font-semibold">
            Connect Wallet to Fuel
          </Button>
        ) : isStreaming ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-center">
              <MiniStat label="Rate" value={`$${Number(stream.rate).toFixed(3)}/${stream.interval_seconds}s`} />
              <MiniStat label="Ticks" value={String(stream.tick_count)} />
              <MiniStat label="Streamed" value={`$${Number(stream.total_streamed).toFixed(3)}`} highlight />
            </div>
            <Button
              onClick={handleStop}
              disabled={busy === "stop"}
              variant="outline"
              className="w-full border-destructive/40 text-destructive hover:bg-destructive/10"
            >
              <Square className="h-3.5 w-3.5 mr-1.5" /> {busy === "stop" ? "Stopping…" : "Stop Stream"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <LabeledInput label="Budget (USDC)" value={budget} min={1} step={1} onChange={setBudget} disabled={approved} />
              <LabeledInput label="Per tick" value={rate} min={0.001} step={0.001} onChange={setRate} />
              <LabeledInput label="Every (sec)" value={interval_} min={3} step={1} onChange={setInterval_} />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleApprove}
                disabled={busy !== null || approved || !chainReady}
                variant="outline"
                className={cn("flex-1", approved && "border-agon-green/40 text-agon-green")}
                title={!chainReady ? "Chain not configured — approval not needed for simulated ticks" : undefined}
              >
                {approved ? (<><CheckCircle className="h-3.5 w-3.5 mr-1.5" /> Approved</>) :
                  busy === "approve" ? "Approving…" : `1. Approve $${budget}`}
              </Button>
              <Button
                onClick={handleStart}
                disabled={busy !== null || (chainReady && !approved)}
                className="flex-1 bg-agon-green text-background hover:bg-agon-green-dim font-semibold"
              >
                <Play className="h-3.5 w-3.5 mr-1.5" /> {busy === "start" ? "Starting…" : "2. Start Stream"}
              </Button>
            </div>

            {stream?.status === "FAILED" && stream.last_error && (
              <p className="text-xs text-destructive">Last stream stopped: {stream.last_error}</p>
            )}
          </div>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

        {/* Live drip feed */}
        {ticks.length > 0 && (
          <div className="border-t border-border pt-3 space-y-1 max-h-40 overflow-y-auto">
            <AnimatePresence initial={false}>
              {ticks.map((t) => {
                const real = t.tx_hash?.startsWith("0x");
                return (
                  <motion.div
                    key={t.id}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-between text-xs font-data"
                  >
                    <span className="text-agon-green">+${Number(t.amount).toFixed(4)}</span>
                    <span className="text-muted-foreground truncate mx-2">→ {agentWallet.slice(0, 10)}…</span>
                    {real ? (
                      <a
                        href={`https://testnet.arcscan.app/tx/${t.tx_hash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-agon-green hover:underline shrink-0"
                      >
                        tx↗
                      </a>
                    ) : (
                      <span className="text-muted-foreground/60 shrink-0">sim</span>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg bg-surface-2 border border-border px-2 py-1.5">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={cn("font-data text-sm font-semibold", highlight ? "text-agon-green" : "text-foreground")}>{value}</p>
    </div>
  );
}

function LabeledInput({ label, value, min, step, onChange, disabled }: {
  label: string; value: number; min: number; step: number; onChange: (v: number) => void; disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-[10px] text-muted-foreground uppercase tracking-wide mb-1">{label}</label>
      <input
        type="number"
        min={min}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 font-data text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-agon-green/50 disabled:opacity-50"
      />
    </div>
  );
}
