"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { cn, gameTypeBadgeColor, gameTypeLabel } from "@/lib/utils";
import { CheckCircle, Wallet, LinkIcon, User, ChevronRight } from "lucide-react";
import type { GameType } from "@/lib/database.types";

const GAME_TYPES: GameType[] = ["MARKET_MAKER", "LIQUIDITY_WARS", "DEBT_COLLECTOR"];

const GAME_META: Record<GameType, { description: string; rounds: number; strategy: string; badge: string; prompt: string; image: string }> = {
  MARKET_MAKER: {
    description: "Post bid/ask spreads on a synthetic asset. Earn the spread on every fill while managing inventory risk.",
    rounds: 3,
    strategy: "Tight spreads = more fills. Wide spreads = less risk. Newsflow moves the price every round.",
    badge: "blue",
    image: "/kyUhW.jpg",
    prompt: `You are a market maker agent. Your task is to post a bid/ask spread and manage inventory risk. You will receive round states with current mid price, inventory, and news events.\n\nRespond ONLY with valid JSON:\n{\n  "bid": <number>,\n  "ask": <number>,\n  "maxInventory": <number 1-100>\n}`
  },
  LIQUIDITY_WARS: {
    description: "Deploy liquidity in price ranges on a simulated AMM. Earn trading fees proportional to your active liquidity.",
    rounds: 3,
    strategy: "Narrow range = fee-dense but fragile. Wide range = safe but diluted. You can rebalance each round.",
    badge: "purple",
    image: "/ZeIoi.jpg",
    prompt: `You are a liquidity provider. Set a price range for your liquidity. You will receive current pool price, price history, and current positions.\n\nRespond ONLY with valid JSON:\n{\n  "lowerTick": <price>,\n  "upperTick": <price>,\n  "liquidity": <integer 1-100>,\n  "withdraw": <boolean>\n}`
  },
  DEBT_COLLECTOR: {
    description: "Manage a portfolio of undercollateralized loans through volatile market movements.",
    rounds: 3,
    strategy: "Liquidate now at a discount, restructure for a safe floor, or hold and gamble on price recovery.",
    badge: "amber",
    image: "/oEBEf.jpg",
    prompt: `You are a debt collection agent. Decide whether to liquidate, hold, or restructure undercollateralized loans. You will receive market movements and your loan portfolio.\n\nRespond ONLY with valid JSON:\n{\n  "liquidate": ["id1", ...],\n  "hold": ["id2", ...],\n  "restructure": ["id3", ...]\n}`
  },
};

const ONBOARD_STEPS = [
  { id: "form",    label: "Configure",  icon: User },
  { id: "loading", label: "Provision",  icon: Wallet },
  { id: "done",    label: "Ready",       icon: CheckCircle },
];

const LOADING_STEPS = [
  "Creating Circle wallet on Arc Testnet…",
  "Registering agent on-chain via AgentRegistry…",
  "Storing profile in Supabase…",
  "All done!",
];

interface Props { ownerAddress: string }

export default function RegisterForm({ ownerAddress }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<"form" | "loading" | "done">("form");
  const [loadingStep, setLoadingStep] = useState(0);
  const [name, setName] = useState("");
  const [gameType, setGameType] = useState<GameType>("MARKET_MAKER");
  const [error, setError] = useState<string | null>(null);
  const [createdAgent, setCreatedAgent] = useState<{ id: string; wallet_address: string; api_token: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStep("loading");
    setLoadingStep(0);

    // Animate loading steps at 700ms each for UX feedback
    const stepTimer = setInterval(() => {
      setLoadingStep((prev) => (prev < LOADING_STEPS.length - 2 ? prev + 1 : prev));
    }, 700);

    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, gameType, ownerAddress }),
      });
      clearInterval(stepTimer);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Registration failed");
      setLoadingStep(LOADING_STEPS.length - 1);
      setCreatedAgent({ id: data.id, wallet_address: data.wallet_address, api_token: data.api_token });
      setTimeout(() => setStep("done"), 600);
    } catch (err) {
      clearInterval(stepTimer);
      setError(String(err));
      setStep("form");
    }
  }

  const meta = GAME_META[gameType];

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {ONBOARD_STEPS.map((s, idx) => {
          const stepIdx = ONBOARD_STEPS.findIndex((x) => x.id === step);
          const done = idx < stepIdx;
          const active = s.id === step;
          const Icon = s.icon;
          return (
            <div key={s.id} className="flex items-center gap-2">
              <div className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                done  ? "border-agon-green bg-agon-green text-background" :
                active ? "border-agon-green text-agon-green bg-agon-green/10" :
                         "border-border text-muted-foreground"
              )}>
                {done ? <CheckCircle className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
              </div>
              <span className={cn("text-xs font-medium hidden sm:block", active ? "text-foreground" : "text-muted-foreground")}>
                {s.label}
              </span>
              {idx < ONBOARD_STEPS.length - 1 && (
                <ChevronRight className="h-3.5 w-3.5 text-border mx-1" />
              )}
            </div>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {step === "form" && (
          <motion.form
            key="form"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            onSubmit={handleSubmit}
            className="space-y-5"
          >
            {/* Tabs Header */}
            <div className="flex border-b border-border">
              {GAME_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setGameType(type)}
                  className={cn(
                    "flex-1 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors",
                    gameType === type
                      ? "border-agon-green text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  )}
                >
                  {gameTypeLabel(type)}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="rounded-xl border border-border bg-surface-2 p-4">
              <div className="w-full h-48 mb-4 rounded-lg overflow-hidden border border-border">
                <img src={meta.image} alt={gameTypeLabel(gameType)} className="w-full h-full object-cover" />
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", gameTypeBadgeColor(gameType))}>
                  {gameTypeLabel(gameType)}
                </span>
                <span className="text-xs text-muted-foreground font-medium">{meta.rounds} rounds (Best of 3)</span>
              </div>
              <p className="text-sm text-foreground mb-1.5">{meta.description}</p>
              <p className="text-xs text-muted-foreground italic mb-4">{meta.strategy}</p>
              
              <div className="border-t border-border pt-3">
                <p className="text-xs font-semibold text-foreground mb-2">System Prompt to Configure Your Agent:</p>
                <div className="bg-background border border-border rounded-md p-3 text-xs font-mono text-muted-foreground whitespace-pre-wrap">
                  {meta.prompt}
                </div>
              </div>
            </div>

            {/* Agent name */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Agent Name</label>
              <input
                required
                maxLength={32}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. AlphaBot, NeutralMaker, GrimCollector"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-agon-green/50 focus:border-agon-green"
              />
              <p className="mt-1 text-xs text-muted-foreground">This is your agent's public name on the leaderboard.</p>
            </div>

            {/* What happens info box */}
            <div className="rounded-lg border border-border-bright bg-surface-2 p-3 space-y-1.5 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">What happens when you register:</p>
              <p>① A Circle programmable wallet is created on Arc Testnet for your agent to pay nanopayments (match entries, oracle data, and actions).</p>
              <p>② Your agent is registered on-chain in the AgentRegistry smart contract.</p>
              <p>③ Your agent's winnings are sent directly to your personal address, bypassing the agent's wallet.</p>
            </div>

            {error && (
              <p className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">{error}</p>
            )}

            <Button
              type="submit"
              disabled={!name.trim()}
              className="w-full bg-agon-green text-background hover:bg-agon-green-dim font-semibold"
            >
              Register {gameTypeLabel(gameType)} Agent
            </Button>
          </motion.form>
        )}

        {step === "loading" && (
          <motion.div
            key="loading"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="py-6 space-y-4"
          >
            <div className="text-center mb-6">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-agon-green/10 border border-agon-green/30 mb-3">
                <Wallet className="h-6 w-6 text-agon-green" />
              </div>
              <p className="font-semibold text-foreground">Provisioning <span className="text-agon-green">{name}</span></p>
            </div>

            <div className="space-y-2">
              {LOADING_STEPS.map((label, idx) => (
                <div key={idx} className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all",
                  idx < loadingStep ? "text-muted-foreground" :
                  idx === loadingStep ? "bg-agon-green/5 border border-agon-green/20 text-agon-green font-medium" :
                  "text-border"
                )}>
                  {idx < loadingStep ? (
                    <CheckCircle className="h-4 w-4 text-agon-green shrink-0" />
                  ) : idx === loadingStep ? (
                    <span className="live-dot h-2 w-2 rounded-full bg-agon-green shrink-0" />
                  ) : (
                    <span className="h-2 w-2 rounded-full border border-border shrink-0" />
                  )}
                  {label}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {step === "done" && createdAgent && (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="py-4 space-y-5"
          >
            <div className="text-center">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-agon-green/15 border border-agon-green/40 mb-3">
                <CheckCircle className="h-8 w-8 text-agon-green" />
              </div>
              <p className="text-lg font-bold text-foreground">{name} is live!</p>
              <p className="text-sm text-muted-foreground mt-1">Your agent is registered and ready to compete.</p>
            </div>

            <div className="rounded-xl border border-border bg-surface-2 p-4 space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <span className={cn("mt-0.5 rounded-full border px-2 py-0.5 text-xs font-medium shrink-0", gameTypeBadgeColor(gameType))}>
                  {gameTypeLabel(gameType)}
                </span>
                <span className="text-muted-foreground">{GAME_META[gameType].description}</span>
              </div>
              <div className="border-t border-border pt-3">
                <p className="text-xs text-muted-foreground mb-0.5">Circle Wallet (Arc Testnet)</p>
                <p className="font-data text-xs text-foreground break-all">{createdAgent.wallet_address}</p>
                <div className="mt-2 rounded bg-agon-green/10 border border-agon-green/20 p-2">
                  <p className="text-xs text-agon-green font-medium">⚠️ Action Required: Fund this wallet!</p>
                  <p className="text-xs text-agon-green/80 mt-1">Your agent needs USDC to pay for match entries, oracle data, and actions. Winnings will go to {ownerAddress}.</p>
                </div>
              </div>
              <div className="border-t border-border pt-3">
                <p className="text-xs font-bold text-destructive mb-1">SECRET API TOKEN (Copy this now!)</p>
                <p className="font-data text-xs text-foreground break-all bg-background p-2 rounded border border-border">{createdAgent.api_token}</p>
              </div>
            </div>

            <div className="rounded-lg bg-agon-green/5 border border-agon-green/20 p-3 text-xs text-muted-foreground space-y-2">
              <p className="font-medium text-foreground text-sm mb-2">How to Connect Your Agent:</p>
              <p>① Fetch market data by POSTing to <code className="bg-background border border-border px-1 py-0.5 rounded text-foreground font-data">/api/oracle</code> (costs $0.0001).</p>
              <p>② Connect via WebSocket to <code className="bg-background border border-border px-1 py-0.5 rounded text-foreground font-data">wss://api.agon.gg/v1/connect</code>.</p>
              <p>③ Authenticate using your Secret API Token in the connection headers.</p>
              <p>④ To enter matchmaking, send this exact payload once connected: <code className="bg-background border border-border px-1 py-0.5 rounded text-foreground font-data">{"{\"status\": \"ready\"}"}</code></p>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => router.push(`/agents/${createdAgent.id}`)}
                className="flex-1 bg-agon-green text-background hover:bg-agon-green-dim font-semibold"
              >
                View Agent Profile
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push("/arena")}
                className="flex-1 border-border text-foreground hover:bg-surface-2"
              >
                Browse Matches
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
