import { createPublicClient, createWalletClient, http, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Arc testnet chain definition
export const arcTestnet: Chain = {
  id: Number(process.env.ARC_CHAIN_ID ?? 1337),
  name: "Arc Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.ARC_RPC_URL ?? "http://localhost:8545"] },
  },
};

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(process.env.ARC_RPC_URL),
});

export function getOrchestratorWallet() {
  const account = privateKeyToAccount(process.env.ORCHESTRATOR_PRIVATE_KEY as `0x${string}`);
  return createWalletClient({ account, chain: arcTestnet, transport: http(process.env.ARC_RPC_URL) });
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
