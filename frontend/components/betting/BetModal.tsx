"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { calculateImpliedOdds, calculateExpectedPayout, calculateExpectedProfit } from "@/lib/odds";
import { formatUSDC } from "@/lib/utils";
import { approveUSDC, sendPlaceBetTx } from "@/lib/wallet";

type BetStep = "idle" | "approving" | "signing" | "confirming" | "recording" | "done" | "error";

interface Props {
  open: boolean;
  onClose: () => void;
  /** called after the bet is recorded — refresh pot/odds/user-bet state */
  onPlaced?: () => void;
  matchId: string;
  matchLabel: string;
  agentId: string;
  agentRegistryId: number | null;
  agentName: string;
  contractMatchId: number | null;
  totalPot: number;
  totalBetsOnAgent: number;
  userAddress: string;
}

export default function BetModal({
  open, onClose, onPlaced, matchId, matchLabel, agentId, agentRegistryId, agentName,
  contractMatchId, totalPot, totalBetsOnAgent, userAddress,
}: Props) {
  const [amount, setAmount] = useState(10);
  const [step, setStep] = useState<BetStep>("idle");
  const [error, setError] = useState<string | null>(null);

  const speculativeTotalPot = totalPot + amount;
  const speculativeTotalOnAgent = totalBetsOnAgent + amount;
  const odds = calculateImpliedOdds(speculativeTotalPot, speculativeTotalOnAgent);
  const payout = calculateExpectedPayout(amount, speculativeTotalOnAgent, speculativeTotalPot);
  const profit = calculateExpectedProfit(amount, speculativeTotalOnAgent, speculativeTotalPot);

  // On-chain betting needs deployed contracts + a match registered on-chain.
  // Otherwise fall back to simulated settlement (bet recorded server-side).
  const chainReady = Boolean(
    process.env.NEXT_PUBLIC_MATCH_ESCROW_ADDRESS &&
    process.env.NEXT_PUBLIC_ARC_USDC_ADDRESS &&
    contractMatchId &&
    agentRegistryId
  );

  async function handleConfirm() {
    if (amount < 1) return;
    setError(null);

    try {
      let txHash: string | undefined;

      if (chainReady) {
        setStep("approving");
        await approveUSDC(amount);

        setStep("signing");
        txHash = await sendPlaceBetTx(contractMatchId!, agentRegistryId!, amount);

        setStep("confirming");
        const { createPublicClient, http } = await import("viem");
        const { arcTestnet } = await import("@/lib/contracts");
        const publicClient = createPublicClient({
          chain: arcTestnet,
          transport: http(process.env.NEXT_PUBLIC_ARC_RPC_URL),
        });
        await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
      }

      setStep("recording");
      const res = await fetch("/api/bets/place", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, agentId, amount, userAddress, txHash }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to record bet");

      setStep("done");
      onPlaced?.();
      setTimeout(onClose, 1500);
    } catch (err) {
      setError(String(err));
      setStep("error");
    }
  }

  function handleClose() {
    if (step === "idle" || step === "done" || step === "error") {
      setStep("idle");
      setError(null);
      onClose();
    }
  }

  const STEP_LABELS: Record<BetStep, string> = {
    idle: "",
    approving: "Approving USDC…",
    signing: "Sign the bet transaction…",
    confirming: "Waiting for confirmation…",
    recording: "Recording bet…",
    done: "Bet placed!",
    error: "",
  };

  const isBusy = step !== "idle" && step !== "done" && step !== "error";

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-foreground">Place Bet</h2>
              <button onClick={handleClose} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {step === "done" ? (
              <div className="text-center py-6">
                <p className="text-2xl mb-2">🎉</p>
                <p className="font-semibold text-agon-green">Bet placed!</p>
              </div>
            ) : step === "error" ? (
              <div className="text-center py-6 space-y-3">
                <p className="text-sm text-destructive">{error ?? "Transaction failed"}</p>
                <Button
                  onClick={() => { setStep("idle"); setError(null); }}
                  variant="outline"
                  className="text-sm"
                >
                  Try again
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-1 mb-5 text-sm">
                  <p className="text-muted-foreground">Match: <span className="text-foreground">{matchLabel}</span></p>
                  <p className="text-muted-foreground">Betting on: <span className="text-foreground font-medium">{agentName}</span></p>
                </div>

                <div className="mb-5">
                  <label className="block text-sm font-medium text-foreground mb-1.5">Bet amount (USDC)</label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    disabled={isBusy}
                    className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 font-data text-foreground focus:outline-none focus:ring-2 focus:ring-agon-green/50 focus:border-agon-green disabled:opacity-50"
                  />
                </div>

                <div className="rounded-lg bg-surface-2 border border-border p-3 space-y-1.5 text-sm mb-5">
                  <Row label="Implied odds" value={`${odds.toFixed(2)}x`} />
                  <Row label="Expected payout" value={formatUSDC(payout)} />
                  <Row label="Expected profit" value={formatUSDC(profit)} highlight={profit > 0} />
                </div>

                <p className="text-xs text-muted-foreground mb-4">
                  {chainReady
                    ? "You will sign two transactions: USDC approval, then the on-chain bet. Bets are final."
                    : "Demo settlement: your bet is recorded instantly with simulated USDC. Bets are final."}
                </p>

                {isBusy && (
                  <div className="mb-4 rounded-lg bg-agon-green/5 border border-agon-green/20 px-3 py-2 text-sm text-agon-green font-medium animate-pulse">
                    {STEP_LABELS[step]}
                  </div>
                )}

                {error && step === "idle" && <p className="mb-3 text-xs text-destructive">{error}</p>}

                <Button
                  onClick={handleConfirm}
                  disabled={isBusy || amount < 1}
                  className="w-full bg-agon-green text-background hover:bg-agon-green-dim font-semibold"
                >
                  {isBusy ? STEP_LABELS[step] : `Confirm Bet · ${formatUSDC(amount)}`}
                </Button>
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-data font-semibold ${highlight ? "text-agon-green" : "text-foreground"}`}>{value}</span>
    </div>
  );
}
