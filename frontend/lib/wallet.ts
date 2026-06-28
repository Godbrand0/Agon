"use client";

import { useState, useEffect, useCallback } from "react";
import { createWalletClient, custom, type Hash } from "viem";
import { arcTestnet, MATCH_ESCROW_ABI, MATCH_ESCROW_ADDRESS } from "./contracts";

export function useWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("agon_wallet");
    if (stored) setAddress(stored);
  }, []);

  const connect = useCallback(async () => {
    if (typeof window === "undefined" || !("ethereum" in window)) {
      alert("MetaMask not found. Please install MetaMask to connect.");
      return;
    }
    setIsConnecting(true);
    try {
      const client = createWalletClient({
        chain: arcTestnet,
        transport: custom((window as Window & { ethereum: unknown }).ethereum),
      });
      const [addr] = await client.requestAddresses();
      setAddress(addr);
      localStorage.setItem("agon_wallet", addr);
    } catch (e) {
      console.error("Wallet connect failed:", e);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    localStorage.removeItem("agon_wallet");
  }, []);

  return { address, isConnected: !!address, isConnecting, connect, disconnect };
}

function getEthereumProvider(): unknown {
  if (typeof window === "undefined" || !("ethereum" in window)) {
    throw new Error("MetaMask not found");
  }
  return (window as Window & { ethereum: unknown }).ethereum;
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

export async function approveUSDC(amount: number): Promise<Hash> {
  const usdcAddress = process.env.NEXT_PUBLIC_ARC_USDC_ADDRESS as `0x${string}`;
  if (!usdcAddress) throw new Error("USDC address not configured");

  const client = createWalletClient({
    chain: arcTestnet,
    transport: custom(getEthereumProvider()),
  });

  const [account] = await client.requestAddresses();

  const { writeContract } = await import("viem");
  const hash = await (client as unknown as { writeContract: typeof writeContract }).writeContract({
    address: usdcAddress,
    abi: USDC_ABI,
    functionName: "approve",
    args: [MATCH_ESCROW_ADDRESS, BigInt(Math.round(amount * 1e6))],
    account,
  });

  return hash as Hash;
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

  const { writeContract } = await import("viem");
  const hash = await (client as unknown as { writeContract: typeof writeContract }).writeContract({
    address: MATCH_ESCROW_ADDRESS,
    abi: MATCH_ESCROW_ABI,
    functionName: "placeBet",
    args: [BigInt(contractMatchId), BigInt(agentRegistryId), BigInt(Math.round(amount * 1e6))],
    account,
  });

  return hash as Hash;
}

export async function sendClaimTx(contractMatchId: number, walletAddress: string): Promise<string> {
  if (!("ethereum" in window)) throw new Error("MetaMask not found");

  const client = createWalletClient({
    chain: arcTestnet,
    transport: custom(getEthereumProvider()),
  });

  const { writeContract } = await import("viem");
  const hash = await (client as unknown as { writeContract: typeof writeContract }).writeContract({
    address: MATCH_ESCROW_ADDRESS,
    abi: MATCH_ESCROW_ABI,
    functionName: "claimWinnings",
    args: [BigInt(contractMatchId)],
    account: walletAddress as `0x${string}`,
  });

  return hash as string;
}
