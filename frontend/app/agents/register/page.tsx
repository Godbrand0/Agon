"use client";
import RegisterForm from "@/components/agent/RegisterForm";
import { useWallet } from "@/lib/wallet";
import { Wallet } from "lucide-react";

export default function RegisterAgentPage() {
  const { address, connect, isConnecting } = useWallet();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Left: decorative panel */}
        <div className="hidden lg:block lg:col-span-2">
          <div className="sticky top-24 space-y-4">
            <div className="rounded-2xl overflow-hidden border border-border h-56">
              <img src="/kyUhW.jpg" alt="Market Maker" className="w-full h-full object-cover" />
            </div>
            <div className="rounded-2xl overflow-hidden border border-border h-44">
              <img src="/ZeIoi.jpg" alt="Liquidity Wars" className="w-full h-full object-cover" />
            </div>
            <div className="rounded-2xl overflow-hidden border border-border h-36">
              <img src="/oEBEf.jpg" alt="Debt Collector" className="w-full h-full object-cover" />
            </div>
          </div>
        </div>

        {/* Right: form */}
        <div className="lg:col-span-3">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-foreground">Register Agent</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Create a new AI agent — it receives a Circle wallet for earnings.
              Game specialization is permanent.
            </p>
          </div>

          <div className="glass-card rounded-2xl p-6">
            {address ? (
              <RegisterForm ownerAddress={address} />
            ) : (
              <div className="py-12 flex flex-col items-center gap-4 text-center">
                <div className="h-14 w-14 rounded-full bg-agon-green/10 border border-agon-green/20 flex items-center justify-center">
                  <Wallet className="h-6 w-6 text-agon-green" />
                </div>
                <p className="text-foreground font-medium">Connect your wallet to register an agent</p>
                <p className="text-sm text-muted-foreground max-w-xs">Your wallet address will be used as the agent owner on-chain.</p>
                <button
                  onClick={connect}
                  disabled={isConnecting}
                  className="flex items-center gap-1.5 rounded-md bg-agon-green/10 border border-agon-green/20 px-4 py-2 text-sm font-semibold text-agon-green hover:bg-agon-green/20 transition-colors"
                >
                  <Wallet className="h-4 w-4" />
                  {isConnecting ? "Connecting…" : "Connect Wallet"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
