"use client";

import { useState, useEffect, useCallback, createElement } from "react";
import { createWalletClient, custom, type Hash, type EIP1193Provider } from "viem";
import { arcTestnet, MATCH_ESCROW_ABI, MATCH_ESCROW_ADDRESS } from "./contracts";
import { discoverProviders } from "./eip6963";
import WalletPickerModal, { type WalletSelection } from "@/components/wallet/WalletPickerModal";

const STORAGE_ADDRESS = "agon_wallet";
const STORAGE_RDNS = "agon_wallet_rdns"; // which wallet, so reload reconnects the same one

// The explicitly-chosen wallet's provider — module-level (not component
// state) so every hook instance across the app signs through the same
// wallet the user picked, not whichever one happened to be at
// `window.ethereum`.
let activeProvider: EIP1193Provider | null = null;

export function useWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_ADDRESS);
    if (stored) setAddress(stored);
  }, []);

  // Silently re-attach the same wallet's provider after a reload so signing
  // works again without re-prompting the picker.
  useEffect(() => {
    if (activeProvider) return;
    const rdns = localStorage.getItem(STORAGE_RDNS);
    if (!rdns || rdns === "injected") return;
    const stop = discoverProviders((detail) => {
      if (detail.info.rdns === rdns) activeProvider = detail.provider;
    });
    const timer = setTimeout(stop, 400);
    return () => { stop(); clearTimeout(timer); };
  }, []);

  /** Opens the wallet picker instead of silently grabbing window.ethereum. */
  const connect = useCallback(() => {
    setPickerOpen(true);
  }, []);

  const selectWallet = useCallback(async (selection: WalletSelection) => {
    setPickerOpen(false);
    setIsConnecting(true);
    try {
      const provider = selection === "injected" ? getInjectedProvider() : selection.provider;
      const client = createWalletClient({ chain: arcTestnet, transport: custom(provider) });
      const [addr] = await client.requestAddresses();

      activeProvider = provider;
      setAddress(addr);
      localStorage.setItem(STORAGE_ADDRESS, addr);
      localStorage.setItem(STORAGE_RDNS, selection === "injected" ? "injected" : selection.info.rdns);
    } catch (e) {
      console.error("Wallet connect failed:", e);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    activeProvider = null;
    localStorage.removeItem(STORAGE_ADDRESS);
    localStorage.removeItem(STORAGE_RDNS);
  }, []);

  // Render this once anywhere in the consuming component's JSX tree.
  const WalletModal = createElement(WalletPickerModal, {
    open: pickerOpen,
    onClose: () => setPickerOpen(false),
    onSelect: selectWallet,
  });

  return { address, isConnected: !!address, isConnecting, connect, disconnect, WalletModal };
}

function getInjectedProvider(): EIP1193Provider {
  if (typeof window === "undefined" || !("ethereum" in window)) {
    throw new Error("No browser wallet found");
  }
  return (window as Window & { ethereum: EIP1193Provider }).ethereum;
}

/** Prefers the wallet the user explicitly picked; falls back for legacy callers. */
function getEthereumProvider(): EIP1193Provider {
  return activeProvider ?? getInjectedProvider();
}

const USDC_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

export async function approveUSDC(amount: number, spender?: string): Promise<Hash> {
  const usdcAddress = process.env.NEXT_PUBLIC_ARC_USDC_ADDRESS as `0x${string}`;
  if (!usdcAddress) throw new Error("USDC address not configured");

  const spenderAddress = (spender ?? MATCH_ESCROW_ADDRESS) as `0x${string}`;
  if (!spenderAddress) throw new Error("Spender address not configured");

  const client = createWalletClient({
    chain: arcTestnet,
    transport: custom(getEthereumProvider()),
  });

  const [account] = await client.requestAddresses();

  return client.writeContract({
    address: usdcAddress,
    abi: USDC_ABI,
    functionName: "approve",
    args: [spenderAddress, BigInt(Math.round(amount * 1e6))],
    account,
  });
}

export async function sendPlaceBetTx(
  contractMatchId: number,
  agentRegistryId: number,
  amount: number
): Promise<Hash> {
  const client = createWalletClient({
    chain: arcTestnet,
    transport: custom(getEthereumProvider()),
  });

  const [account] = await client.requestAddresses();

  return client.writeContract({
    address: MATCH_ESCROW_ADDRESS,
    abi: MATCH_ESCROW_ABI,
    functionName: "placeBet",
    args: [BigInt(contractMatchId), BigInt(agentRegistryId), BigInt(Math.round(amount * 1e6))],
    account,
  });
}

export async function sendClaimTx(contractMatchId: number, walletAddress: string): Promise<string> {
  const client = createWalletClient({
    chain: arcTestnet,
    transport: custom(getEthereumProvider()),
  });

  return client.writeContract({
    address: MATCH_ESCROW_ADDRESS,
    abi: MATCH_ESCROW_ABI,
    functionName: "claimWinnings",
    args: [BigInt(contractMatchId)],
    account: walletAddress as `0x${string}`,
  });
}
