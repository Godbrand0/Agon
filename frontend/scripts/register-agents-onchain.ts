/**
 * Register Supabase agents in the on-chain AgentRegistry and store their
 * registry IDs back. Required for fully on-chain betting (BetModal and
 * MatchEscrow reference agents by registry ID).
 *
 * Usage: node --env-file=.env.local --import tsx scripts/register-agents-onchain.ts
 */

import { supabaseAdmin } from "../lib/supabase";
import {
  getOrchestratorWallet,
  getPublicClient,
  AGENT_REGISTRY_ABI,
  AGENT_REGISTRY_ADDRESS,
} from "../lib/contracts";

async function main() {
  if (!AGENT_REGISTRY_ADDRESS) throw new Error("NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS not set");

  const db = supabaseAdmin();
  const wallet = getOrchestratorWallet();
  const publicClient = getPublicClient();

  const { data: agents, error } = await db
    .from("agents")
    .select("id, name, game_type, wallet_address, registry_id")
    .is("registry_id", null)
    .eq("active", true);

  if (error) throw new Error(error.message);
  if (!agents || agents.length === 0) {
    console.log("All agents already registered on-chain.");
    return;
  }

  console.log(`Registering ${agents.length} agent(s) in AgentRegistry ${AGENT_REGISTRY_ADDRESS}…\n`);

  for (const agent of agents) {
    // Simulate to get the returned agentId, then send the same request
    const { request, result } = await publicClient.simulateContract({
      account: wallet.account,
      address: AGENT_REGISTRY_ADDRESS,
      abi: AGENT_REGISTRY_ABI,
      functionName: "registerAgent",
      args: [agent.name, agent.game_type, agent.wallet_address as `0x${string}`],
    });

    const hash = await wallet.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
    if (receipt.status !== "success") {
      console.error(`❌ ${agent.name}: tx reverted (${hash})`);
      continue;
    }

    const registryId = Number(result);
    await db.from("agents").update({ registry_id: registryId }).eq("id", agent.id);

    console.log(`✅ ${agent.name} → registry ID ${registryId}`);
    console.log(`   tx: https://testnet.arcscan.app/tx/${hash}`);
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("❌ Registration failed:", e);
  process.exit(1);
});
