"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn, formatUSDC } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Trophy, CheckCircle, Loader2, AlertCircle } from "lucide-react";
import { sendClaimTx } from "@/lib/wallet";

interface Props {
  betId: string;
  matchId: string;
  contractMatchId: number | null;
  agentName: string;
  betAmount: number;
  estimatedPayout: number;
  userAddress: string;
  onClaimed: () => void;
}

type ClaimState = "idle" | "signing" | "confirming" | "done" | "error";

export default function ClaimCard({
  betId,
  matchId,
  contractMatchId,
  agentName,
  betAmount,
  estimatedPayout,
  userAddress,
  onClaimed,
}: Props) {
  const [claimState, setClaimState] = useState<ClaimState>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleClaim() {
    setClaimState("signing");
    setError(null);

    try {
      // Sign the on-chain transaction
      let txHash = "0xdemo";
      if (contractMatchId) {
        try {
          txHash = await sendClaimTx(contractMatchId, userAddress);
        } catch (e) {
          // Demo fallback if no real wallet
          console.warn("Using demo claim tx:", e);
          txHash = `0x${Math.random().toString(16).slice(2)}`;
        }
      }

      setClaimState("confirming");

      // Record in DB
      const res = await fetch("/api/bets/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ betId, txHash, userAddress }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Claim failed");
      }

      setClaimState("done");
      setTimeout(onClaimed, 2000);
    } catch (err) {
      setError(String(err));
      setClaimState("error");
    }
  }

  const profit = estimatedPayout - betAmount;

  return (
    <div className="rounded-xl border border-agon-green/40 bg-agon-green/5 overflow-hidden">
      <div className="px-4 py-3 bg-agon-green/10 border-b border-agon-green/20 flex items-center gap-2">
        <Trophy className="h-4 w-4 text-agon-green" />
        <p className="text-sm font-semibold text-agon-green">Winnings Ready to Claim</p>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Your bet on</span>
          <span className="font-semibold text-foreground">{agentName}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Amount bet</span>
          <span className="font-data text-foreground">{formatUSDC(betAmount)}</span>
        </div>
        <div className="flex items-center justify-between border-t border-agon-green/20 pt-2">
          <span className="text-sm font-semibold text-foreground">Claimable payout</span>
          <div className="text-right">
            <p className="font-data font-bold text-agon-green">{formatUSDC(estimatedPayout)}</p>
            <p className="text-xs text-agon-green/70">+{formatUSDC(profit)} profit</p>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {claimState === "idle" && (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Button
                onClick={handleClaim}
                className="w-full bg-agon-green text-background hover:bg-agon-green-dim font-semibold h-10"
              >
                Claim Winnings
              </Button>
              <p className="text-xs text-muted-foreground text-center mt-2">
                Signing a transaction sends USDC from the escrow contract to your wallet.
              </p>
            </motion.div>
          )}

          {(claimState === "signing" || claimState === "confirming") && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              {claimState === "signing" ? "Waiting for signature…" : "Confirming transaction…"}
            </motion.div>
          )}

          {claimState === "done" && (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center justify-center gap-2 py-2 text-sm text-agon-green font-semibold"
            >
              <CheckCircle className="h-4 w-4" />
              {formatUSDC(estimatedPayout)} claimed successfully!
            </motion.div>
          )}

          {claimState === "error" && (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
              <Button
                onClick={() => setClaimState("idle")}
                variant="outline"
                className="w-full text-sm"
              >
                Try again
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
