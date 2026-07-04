#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# Deploy Agōn contracts to Arc testnet.
#
#   cd contract && ./deploy-arc.sh
#
# Reads config from ../frontend/.env.local — no separate setup needed.
# The deployer wallet must hold testnet USDC (gas): faucet.circle.com
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

# Foundry lives in ~/.foundry/bin on this machine; make sure it's reachable
command -v forge >/dev/null 2>&1 || export PATH="$HOME/.foundry/bin:$PATH"

cd "$(dirname "$0")"
ENV_FILE="../frontend/.env.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ $ENV_FILE not found"; exit 1
fi

get() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '[:space:]'; }

export DEPLOYER_PRIVATE_KEY="$(get DEPLOYER_PRIVATE_KEY)"
export ARC_USDC_ADDRESS="$(get ARC_USDC_ADDRESS)"
ARC_RPC_URL="$(get ARC_RPC_URL)"
ORCHESTRATOR_KEY="$(get ORCHESTRATOR_PRIVATE_KEY)"
PLATFORM="$(get PLATFORM_TREASURY_ADDRESS)"

[[ -n "$DEPLOYER_PRIVATE_KEY" ]] || { echo "❌ DEPLOYER_PRIVATE_KEY missing in .env.local"; exit 1; }
[[ -n "$ARC_RPC_URL" ]]          || { echo "❌ ARC_RPC_URL missing in .env.local"; exit 1; }
[[ -n "$ARC_USDC_ADDRESS" ]]     || { echo "❌ ARC_USDC_ADDRESS missing in .env.local"; exit 1; }

# Orchestrator address: derived from its key (falls back to deployer's)
export ORCHESTRATOR_ADDRESS="$(cast wallet address --private-key "${ORCHESTRATOR_KEY:-$DEPLOYER_PRIVATE_KEY}")"

# Platform treasury: defaults to the deployer address if unset
export PLATFORM_TREASURY_ADDRESS="${PLATFORM:-$(cast wallet address --private-key "$DEPLOYER_PRIVATE_KEY")}"

DEPLOYER_ADDRESS="$(cast wallet address --private-key "$DEPLOYER_PRIVATE_KEY")"
BALANCE="$(cast balance "$DEPLOYER_ADDRESS" --rpc-url "$ARC_RPC_URL")"

echo "── Agōn → Arc testnet ────────────────────────────────"
echo "  RPC:          $ARC_RPC_URL"
echo "  Deployer:     $DEPLOYER_ADDRESS"
echo "  Balance:      $BALANCE (native USDC, 18-dec view)"
echo "  Orchestrator: $ORCHESTRATOR_ADDRESS"
echo "  Platform:     $PLATFORM_TREASURY_ADDRESS"
echo "  USDC:         $ARC_USDC_ADDRESS"
echo "──────────────────────────────────────────────────────"

if [[ "$BALANCE" == "0" ]]; then
  echo "❌ Deployer has no gas. Fund $DEPLOYER_ADDRESS at https://faucet.circle.com (Arc Testnet)"
  exit 1
fi

forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$ARC_RPC_URL" \
  --broadcast \
  -vv

echo ""
echo "✅ Done. Copy the two NEXT_PUBLIC_* lines above into frontend/.env.local,"
echo "   then restart the dev server. Explorer: https://testnet.arcscan.app"
