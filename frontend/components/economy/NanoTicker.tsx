"use client";

/**
 * Live M2M economy ticker — streams the `nanopayments` ledger via Supabase
 * Realtime. Shows every fee agents pay (entry / oracle / action) with its
 * settlement reference, plus running totals. Pass `matchId` to scope to one
 * match, omit for the global feed.
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Zap, Database, Swords } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { Nanopayment, NanopaymentKind } from "@/lib/database.types";

const KIND_META: Record<NanopaymentKind, { label: string; icon: typeof Zap; color: string }> = {
  ENTRY_FEE:  { label: "Entry",  icon: Swords,   color: "text-blue-400" },
  ORACLE_FEE: { label: "Oracle", icon: Database, color: "text-purple-400" },
  ACTION_FEE: { label: "Action", icon: Zap,      color: "text-agon-green" },
};

const MAX_ROWS = 12;

function explorerUrl(txHash: string | null): string | null {
  if (!txHash || !txHash.startsWith("0x")) return null; // sim_ / circle: refs have no explorer page
  return `https://testnet.arcscan.app/tx/${txHash}`;
}

interface Props {
  matchId?: string;
  className?: string;
}

export default function NanoTicker({ matchId, className }: Props) {
  const [rows, setRows] = useState<Nanopayment[]>([]);
  const [agentNames, setAgentNames] = useState<Record<string, string>>({});
  const totalRef = useRef({ count: 0, sum: 0 });

  useEffect(() => {
    let query = supabase
      .from("nanopayments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS);
    if (matchId) query = query.eq("match_id", matchId);

    query.then(({ data }) => {
      if (data) {
        setRows(data as Nanopayment[]);
        totalRef.current = {
          count: data.length,
          sum: data.reduce((s, n) => s + Number(n.amount), 0),
        };
      }
    });

    // Agent id → name for display
    supabase.from("agents").select("id, name").then(({ data }) => {
      if (data) setAgentNames(Object.fromEntries(data.map((a) => [a.id, a.name])));
    });

    const channel = supabase
      .channel(`nanopayments-${matchId ?? "global"}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "nanopayments",
          ...(matchId ? { filter: `match_id=eq.${matchId}` } : {}),
        },
        (payload) => {
          const row = payload.new as Nanopayment;
          totalRef.current.count += 1;
          totalRef.current.sum += Number(row.amount);
          setRows((prev) => [row, ...prev].slice(0, MAX_ROWS));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [matchId]);

  const { count, sum } = totalRef.current;

  return (
    <div className={cn("rounded-xl border border-border bg-surface overflow-hidden", className)}>
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-agon-green" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            M2M Nanopayments
          </span>
        </div>
        <span className="font-data text-xs text-agon-green">
          {count} fees · ${sum.toFixed(4)}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">
          No fees yet — agents pay per entry, data request, and action once a match runs.
        </p>
      ) : (
        <div className="divide-y divide-border/50 max-h-72 overflow-y-auto">
          <AnimatePresence initial={false}>
            {rows.map((n) => {
              const meta = KIND_META[n.kind] ?? KIND_META.ACTION_FEE;
              const Icon = meta.icon;
              const url = explorerUrl(n.tx_hash);
              const sim = !url;
              return (
                <motion.div
                  key={n.id}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2.5 px-4 py-2 text-xs"
                >
                  <Icon className={cn("h-3.5 w-3.5 shrink-0", meta.color)} />
                  <span className="text-foreground font-medium shrink-0">
                    {agentNames[n.agent_id] ?? n.agent_id.slice(0, 6)}
                  </span>
                  <span className="text-muted-foreground truncate flex-1">{meta.label} fee</span>
                  <span className={cn("font-data font-semibold shrink-0", meta.color)}>
                    −${Number(n.amount).toFixed(4)}
                  </span>
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-data text-agon-green hover:underline shrink-0"
                      title={n.tx_hash ?? undefined}
                    >
                      tx↗
                    </a>
                  ) : (
                    <span
                      className="font-data text-muted-foreground/60 shrink-0"
                      title={sim ? "Simulated settlement (agent wallet unfunded)" : undefined}
                    >
                      sim
                    </span>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
