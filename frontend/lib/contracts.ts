import { createPublicClient, createWalletClient, http, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// `||` (not `??`) so empty-string env vars fall through to the default
const RPC_URL =
  process.env.ARC_RPC_URL ||
  process.env.NEXT_PUBLIC_ARC_RPC_URL ||
  "http://localhost:8545";

// Arc testnet chain definition
// Gas is paid in native USDC (18-decimal native view; the ERC-20 interface
// at 0x36…00 uses 6 decimals — never mix the two views)
export const arcTestnet: Chain = {
  id: Number(process.env.ARC_CHAIN_ID || 5042002),
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
  },
  blockExplorers: {
    default: { name: "ArcScan", url: "https://testnet.arcscan.app" },
  },
};

export function getPublicClient() {
  return createPublicClient({
    chain: arcTestnet,
    transport: http(RPC_URL),
  });
}

export function getOrchestratorWallet() {
  const account = privateKeyToAccount(process.env.ORCHESTRATOR_PRIVATE_KEY as `0x${string}`);
  return createWalletClient({ account, chain: arcTestnet, transport: http(RPC_URL) });
}

/**
 * True when the backend has everything needed to write on-chain.
 * When false, the app runs in simulated-settlement mode: matches, bets,
 * and payouts are recorded in Supabase with `sim_` tx hashes so the full
 * product loop still works without deployed contracts.
 */
export function isChainConfigured(): boolean {
  return Boolean(
    process.env.ARC_RPC_URL &&
    process.env.ORCHESTRATOR_PRIVATE_KEY &&
    process.env.NEXT_PUBLIC_MATCH_ESCROW_ADDRESS &&
    process.env.NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS
  );
}

/** Nullable variant — returns null instead of throwing when chain env is missing. */
export function tryGetOrchestratorWallet(): ReturnType<typeof getOrchestratorWallet> | null {
  if (!isChainConfigured()) return null;
  try {
    return getOrchestratorWallet();
  } catch (e) {
    console.warn("[chain] orchestrator wallet unavailable, running simulated:", e);
    return null;
  }
}

/** Deterministic-looking simulated tx hash for demo-mode settlement records. */
export function simTxHash(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `sim_0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

// ── AgentRegistry ABI (subset used by the backend) ──────────────────────────
export const AGENT_REGISTRY_ABI = [
  {
    name: "registerAgent",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name",          type: "string" },
      { name: "gameType",      type: "string" },
      { name: "walletAddress", type: "address" },
    ],
    outputs: [{ name: "agentId", type: "uint256" }],
  },
  {
    name: "updateStats",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId",  type: "uint256" },
      { name: "won",      type: "bool" },
      { name: "earnings", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "getWinRate",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "agents",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [
      { name: "owner",         type: "address" },
      { name: "name",          type: "string" },
      { name: "gameType",      type: "string" },
      { name: "walletAddress", type: "address" },
      { name: "wins",          type: "uint256" },
      { name: "losses",        type: "uint256" },
      { name: "totalEarnings", type: "uint256" },
      { name: "registeredAt",  type: "uint256" },
      { name: "active",        type: "bool" },
    ],
  },
] as const;

// ── MatchEscrow ABI (subset used by the backend) ─────────────────────────────
export const MATCH_ESCROW_ABI = [
  {
    name: "createMatch",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "matchId",         type: "uint256" },
      { name: "agentIds",        type: "uint256[]" },
      { name: "agentWallets",    type: "address[]" },
      { name: "bettingDuration", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "closeBetting",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "matchId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "startMatch",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "matchId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "resolveMatch",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "matchId",       type: "uint256" },
      { name: "winnerAgentId", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "cancelMatch",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "matchId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "claimWinnings",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "matchId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "getClaimableAmount",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "matchId", type: "uint256" },
      { name: "user",    type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "hasClaimed",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "matchId", type: "uint256" },
      { name: "user",    type: "address" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "placeBet",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "matchId", type: "uint256" },
      { name: "agentId", type: "uint256" },
      { name: "amount",  type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "getImpliedOdds",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "matchId", type: "uint256" },
      { name: "agentId", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "getUserBet",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "matchId", type: "uint256" },
      { name: "user",    type: "address" },
      { name: "agentId", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const AGENT_REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS as `0x${string}`;
export const MATCH_ESCROW_ADDRESS   = process.env.NEXT_PUBLIC_MATCH_ESCROW_ADDRESS   as `0x${string}`;

// ── USDC ERC-20 (Arc native USDC, ERC-20 view: 6 decimals) ──────────────────
export const USDC_ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount",  type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner",   type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "transferFrom",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from",   type: "address" },
      { name: "to",     type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const USDC_ADDRESS = (process.env.ARC_USDC_ADDRESS ||
  process.env.NEXT_PUBLIC_ARC_USDC_ADDRESS ||
  "0x3600000000000000000000000000000000000000") as `0x${string}`;

/** Chain requirements for fuel streaming (no deployed contracts needed). */
export function isStreamChainReady(): boolean {
  return Boolean(process.env.ARC_RPC_URL && process.env.ORCHESTRATOR_PRIVATE_KEY);
}
