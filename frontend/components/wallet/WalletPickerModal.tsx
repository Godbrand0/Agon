"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Wallet as WalletIcon } from "lucide-react";
import { discoverProviders, type EIP6963ProviderDetail } from "@/lib/eip6963";

export type WalletSelection = EIP6963ProviderDetail | "injected";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (selection: WalletSelection) => void;
}

/**
 * Lets the user pick which installed wallet to connect, instead of silently
 * using whichever extension happens to own `window.ethereum`. Wallets are
 * discovered live via EIP-6963 while the modal is open.
 */
export default function WalletPickerModal({ open, onClose, onSelect }: Props) {
  const [providers, setProviders] = useState<EIP6963ProviderDetail[]>([]);

  useEffect(() => {
    if (!open) return;
    setProviders([]);
    return discoverProviders((detail) => setProviders((prev) => [...prev, detail]));
  }, [open]);

  const hasLegacyInjected = providers.length === 0 && typeof window !== "undefined" && "ethereum" in window;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-foreground">Connect a Wallet</h2>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2">
              {providers.map((detail) => (
                <button
                  key={detail.info.uuid}
                  onClick={() => onSelect(detail)}
                  className="w-full flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left hover:border-agon-green/50 hover:bg-agon-green/5 transition-colors"
                >
                  <img src={detail.info.icon} alt="" className="h-6 w-6 rounded shrink-0" />
                  <span className="text-sm font-medium text-foreground">{detail.info.name}</span>
                </button>
              ))}

              {hasLegacyInjected && (
                <button
                  onClick={() => onSelect("injected")}
                  className="w-full flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left hover:border-agon-green/50 hover:bg-agon-green/5 transition-colors"
                >
                  <WalletIcon className="h-6 w-6 text-agon-green shrink-0" />
                  <span className="text-sm font-medium text-foreground">Browser Wallet</span>
                </button>
              )}

              {providers.length === 0 && !hasLegacyInjected && (
                <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center">
                  <p className="text-sm text-muted-foreground mb-1">No wallet detected.</p>
                  <a
                    href="https://metamask.io/download"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-agon-green hover:underline"
                  >
                    Install MetaMask →
                  </a>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
