/**
 * Testnet safety valve — drains the FULL MatchEscrow USDC balance to the
 * contract owner (including any unclaimed bettor pool). Not for production
 * use; see the warning on withdrawAll() in MatchEscrow.sol.
 *
 * Usage: node --env-file=.env.local --import tsx scripts/withdraw-all.ts
 */

import { getOrchestratorWallet, getPublicClient, MATCH_ESCROW_ABI, MATCH_ESCROW_ADDRESS, USDC_ERC20_ABI, USDC_ADDRESS } from "../lib/contracts";

async function main() {
  if (!MATCH_ESCROW_ADDRESS) throw new Error("NEXT_PUBLIC_MATCH_ESCROW_ADDRESS not set");

  const wallet = getOrchestratorWallet();
  const publicClient = getPublicClient();

  const balance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: USDC_ERC20_ABI,
    functionName: "balanceOf",
    args: [MATCH_ESCROW_ADDRESS],
  });

  console.log(`Escrow balance: ${Number(balance) / 1e6} USDC`);
  if (balance === 0n) {
    console.log("Nothing to withdraw.");
    return;
  }

  const { request } = await publicClient.simulateContract({
    account: wallet.account,
    address: MATCH_ESCROW_ADDRESS,
    abi: MATCH_ESCROW_ABI,
    functionName: "withdrawAll",
  });

  const hash = await wallet.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  console.log(receipt.status === "success" ? "✅ Withdrawn" : "❌ Reverted");
  console.log(`https://testnet.arcscan.app/tx/${hash}`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("❌ Withdraw failed:", e);
  process.exit(1);
});
