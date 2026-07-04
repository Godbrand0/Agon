/**
 * Circle developer-controlled wallets on Arc Testnet.
 *
 * Agents are headless, so their operating wallets are dev-controlled: the
 * server holds the entity secret and signs USDC transfers programmatically —
 * no per-transfer user challenge (which user-controlled wallets require).
 *
 * Everything degrades gracefully: without CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET
 * wallets get placeholder addresses and nanopayments are simulated with
 * `sim_` hashes, so the demo loop never breaks.
 */

import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import crypto from "crypto";
import { supabaseAdmin } from "./supabase";
import { simTxHash } from "./contracts";

export function isCircleConfigured(): boolean {
  return Boolean(process.env.CIRCLE_API_KEY && process.env.CIRCLE_ENTITY_SECRET);
}

// SDK responses vary between versions — access data loosely
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getClient(): any {
  if (!_client) {
    _client = initiateDeveloperControlledWalletsClient({
      apiKey: process.env.CIRCLE_API_KEY!,
      entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
    });
  }
  return _client;
}

// ── Wallet set ────────────────────────────────────────────────────────────────

let _walletSetId: string | null = null;

/**
 * All agent wallets live in one wallet set. Prefer CIRCLE_WALLET_SET_ID from
 * env; otherwise create one on first use and log it so it can be persisted.
 */
async function getWalletSetId(): Promise<string> {
  if (process.env.CIRCLE_WALLET_SET_ID) return process.env.CIRCLE_WALLET_SET_ID;
  if (_walletSetId) return _walletSetId;

  const client = getClient();
  const res = await client.createWalletSet({ name: "Agon Agent Wallets" });
  const id = res?.data?.walletSet?.id;
  if (!id) throw new Error("Circle wallet set creation failed: no ID returned");

  _walletSetId = id;
  console.warn(
    `[Circle] Created wallet set ${id} — add CIRCLE_WALLET_SET_ID=${id} to .env.local to reuse it across restarts.`
  );
  return id;
}

// ── Agent wallets ─────────────────────────────────────────────────────────────

export interface AgentWallet {
  address: string;
  circleWalletId: string | null; // null when simulated
}

/**
 * Create an agent's operating wallet on Arc Testnet.
 * Falls back to a placeholder address when Circle isn't configured.
 */
export async function createAgentWallet(agentId: string): Promise<AgentWallet> {
  if (!isCircleConfigured()) {
    return {
      address: `0x${crypto.randomBytes(20).toString("hex")}`,
      circleWalletId: null,
    };
  }

  const client = getClient();
  const walletSetId = await getWalletSetId();

  const res = await client.createWallets({
    walletSetId,
    blockchains: ["ARC-TESTNET"],
    count: 1,
    accountType: "EOA",
    metadata: [{ name: `agent-${agentId}`, refId: agentId }],
  });

  const wallet = res?.data?.wallets?.[0];
  if (!wallet?.address || !wallet?.id) {
    throw new Error(`Circle wallet creation returned no wallet for agent ${agentId}`);
  }

  return { address: wallet.address, circleWalletId: wallet.id };
}

// USDC token ID cache per Circle wallet (needed for createTransaction)
const usdcTokenIdCache = new Map<string, string>();

async function getUsdcTokenId(circleWalletId: string): Promise<{ tokenId: string; balance: number } | null> {
  const client = getClient();
  const res = await client.getWalletTokenBalance({ id: circleWalletId });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const balances: any[] = res?.data?.tokenBalances ?? [];
  const usdc = balances.find((b) => b?.token?.symbol === "USDC");
  if (!usdc?.token?.id) return null;
  usdcTokenIdCache.set(circleWalletId, usdc.token.id);
  return { tokenId: usdc.token.id, balance: parseFloat(usdc.amount ?? "0") };
}

export async function getAgentBalance(circleWalletId: string): Promise<number> {
  const info = await getUsdcTokenId(circleWalletId);
  return info?.balance ?? 0;
}

// ── Nanopayments ──────────────────────────────────────────────────────────────

export type NanopaymentKind = "ENTRY_FEE" | "ORACLE_FEE" | "ACTION_FEE";

/**
 * Charge a nanopayment from an agent's wallet to the protocol wallet.
 *
 * With Circle configured and the agent holding a funded dev-controlled wallet,
 * this is a real USDC transfer on Arc (the tx hash lands on the recorded row
 * as soon as Circle reports it). Otherwise the transfer is simulated. Either
 * way a `nanopayments` row is written so the UI can show the live M2M economy.
 */
export async function chargeNanopayment(
  agentId: string,
  walletAddress: string,
  amount: number,
  reason: string,
  opts?: { matchId?: string; kind?: NanopaymentKind }
): Promise<boolean> {
  const protocolWallet = process.env.PROTOCOL_WALLET_ADDRESS;
  if (!protocolWallet) {
    console.warn("[Circle] PROTOCOL_WALLET_ADDRESS not set. Skipping nanopayment.");
    return false;
  }

  const db = supabaseAdmin();
  let txRef: string | null = null;

  if (isCircleConfigured()) {
    txRef = await transferViaCircle(db, agentId, protocolWallet, amount, reason);
  }

  const simulated = txRef === null;
  if (simulated) txRef = simTxHash();

  console.log(
    `[Nanopayment${simulated ? " · sim" : ""}] ${amount} USDC · Agent ${agentId} (${walletAddress}) → Protocol (${protocolWallet}) · ${reason} · ${txRef}`
  );

  try {
    const { data: row } = await db.from("nanopayments").insert({
      agent_id: agentId,
      match_id: opts?.matchId ?? null,
      kind: opts?.kind ?? "ACTION_FEE",
      amount,
      from_wallet: walletAddress,
      to_wallet: protocolWallet,
      reason,
      tx_hash: txRef,
    }).select("id").single();

    // Real transfers start as `circle:<id>` — swap in the on-chain hash
    // in the background once Circle confirms (never blocks the match).
    if (!simulated && row?.id && txRef?.startsWith("circle:")) {
      void resolveTxHashLater(row.id, txRef.slice("circle:".length));
    }
  } catch (e) {
    // Recording is best-effort — never block a match on bookkeeping
    console.warn("[Nanopayment] failed to record:", e);
  }

  return true;
}

/** Returns `circle:<transactionId>` on success, or null to fall back to sim. */
async function transferViaCircle(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  agentId: string,
  destinationAddress: string,
  amount: number,
  reason: string
): Promise<string | null> {
  try {
    const { data: agent } = await db
      .from("agents")
      .select("circle_wallet_id")
      .eq("id", agentId)
      .single();

    const circleWalletId: string | null = agent?.circle_wallet_id ?? null;
    if (!circleWalletId) return null; // agent predates Circle setup → simulate

    const cachedTokenId = usdcTokenIdCache.get(circleWalletId);
    const tokenId = cachedTokenId ?? (await getUsdcTokenId(circleWalletId))?.tokenId;
    if (!tokenId) {
      console.warn(`[Circle] No USDC balance found for wallet ${circleWalletId} (fund it at faucet.circle.com) — simulating "${reason}"`);
      return null;
    }

    const client = getClient();
    const res = await client.createTransaction({
      walletId: circleWalletId,
      tokenId,
      destinationAddress,
      amount: [amount.toString()],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    });

    const txId = res?.data?.id;
    if (!txId) return null;
    return `circle:${txId}`;
  } catch (e) {
    console.warn(`[Circle] transfer failed for agent ${agentId} — simulating "${reason}":`, e);
    return null;
  }
}

/** Poll Circle for the on-chain hash and update the nanopayment row. */
async function resolveTxHashLater(rowId: string, circleTxId: string): Promise<void> {
  const client = getClient();
  const db = supabaseAdmin();
  for (let attempt = 0; attempt < 6; attempt++) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const res = await client.getTransaction({ id: circleTxId });
      const tx = res?.data?.transaction;
      if (tx?.txHash) {
        await db.from("nanopayments").update({ tx_hash: tx.txHash }).eq("id", rowId);
        return;
      }
      if (tx?.state === "FAILED" || tx?.state === "CANCELLED" || tx?.state === "DENIED") {
        console.warn(`[Circle] transaction ${circleTxId} ended ${tx.state}`);
        return;
      }
    } catch {
      // keep polling
    }
  }
}
