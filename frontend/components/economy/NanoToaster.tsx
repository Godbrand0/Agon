"use client";

/**
 * Global nanopayment toasts — whenever any agent pays a fee, a small card
 * pops in the corner showing who paid, how much, and what for, with an
 * ArcScan link when the settlement is real. Mounted once in the root layout.
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Zap, Database, Swords, ExternalLink } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { Nanopayment, NanopaymentKind } from "@/lib/database.types";

const KIND_META: Record<NanopaymentKind, { label: string; icon: typeof Zap; ring: string }> = {
  ENTRY_FEE:  { label: "Match entry fee",   icon: Swords,   ring: "border-blue-400/40" },
  ORACLE_FEE: { label: "Oracle data fee",   icon: Database, ring: "border-purple-400/40" },
  ACTION_FEE: { label: "Action execution",  icon: Zap,      ring: "border-agon-green/40" },
};

const TOAST_TTL_MS = 6_000;
const MAX_TOASTS = 4;

interface Toast extends Nanopayment {
  agentName: string;
}

export default function NanoToaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const namesRef = useRef<Record<string, string>>({});

  useEffect(() => {
    // Cache agent names for display
    supabase.from("agents").select("id, name").then(({ data }) => {
      if (data) namesRef.current = Object.fromEntries(data.map((a) => [a.id, a.name]));
    });

    const channel = supabase
      .channel("nanopayment-toasts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "nanopayments" },
        (payload) => {
          const row = payload.new as Nanopayment;
          const toast: Toast = { ...row, agentName: namesRef.current[row.agent_id] ?? "Agent" };
          setToasts((prev) => [toast, ...prev].slice(0, MAX_TOASTS));
          setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== row.id));
          }, TOAST_TTL_MS);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-[90] flex flex-col-reverse gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => {
          const meta = KIND_META[t.kind] ?? KIND_META.ACTION_FEE;
          const Icon = meta.icon;
          const real = t.tx_hash?.startsWith("0x");
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 40, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className={cn(
                "pointer-events-auto w-72 rounded-xl border bg-surface/95 backdrop-blur-lg p-3 shadow-xl",
                meta.ring
              )}
            >
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 h-7 w-7 rounded-full bg-agon-green/10 border border-agon-green/20 flex items-center justify-center shrink-0">
                  <Icon className="h-3.5 w-3.5 text-agon-green" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground">
                    <span className="font-semibold">{t.agentName}</span> paid{" "}
                    <span className="font-data font-bold text-agon-green">
                      ${Number(t.amount).toFixed(4)}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{meta.label}</p>
                  {real ? (
                    <a
                      href={`https://testnet.arcscan.app/tx/${t.tx_hash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 inline-flex items-center gap-1 font-data text-[10px] text-agon-green hover:underline"
                    >
                      {t.tx_hash!.slice(0, 14)}… <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  ) : (
                    <span className="mt-0.5 inline-block font-data text-[10px] text-muted-foreground/60">
                      settling…
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
