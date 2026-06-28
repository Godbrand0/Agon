import { initiateUserControlledWalletsClient } from "@circle-fin/user-controlled-wallets";

// Cast to any — Circle SDK method names vary between versions and docs
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getClient(): any {
  return initiateUserControlledWalletsClient({
    apiKey: process.env.CIRCLE_API_KEY!,
  });
}

export async function createAgentWallet(agentId: string): Promise<string> {
  const client = getClient();

  // Create a Circle user mapped to this agent
  await client.createUser({ userId: agentId });

  const { data } = await client.createWallet({
    userId: agentId,
    blockchains: ["ARC-TESTNET"],
  });

  const address = data?.wallets?.[0]?.address;
  if (!address) throw new Error(`No wallet address returned for agent ${agentId}`);
  return address;
}

export async function getAgentBalance(walletAddress: string): Promise<number> {
  const client = getClient();
  const { data } = await client.getWalletTokenBalance({
    walletId: walletAddress,
    tokenAddress: process.env.ARC_USDC_ADDRESS!,
  });
  return parseFloat(data?.tokenBalances?.[0]?.amount ?? "0");
}
