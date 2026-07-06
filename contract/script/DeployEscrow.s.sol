// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {MatchEscrow} from "../src/MatchEscrow.sol";

/**
 * Redeploys ONLY MatchEscrow (e.g. after a payout-split or logic change).
 * AgentRegistry is untouched — no on-chain agent re-registration needed.
 *
 * Required env vars (mapped from frontend/.env.local by ./deploy-arc.sh):
 *   DEPLOYER_PRIVATE_KEY, ORCHESTRATOR_ADDRESS, ARC_USDC_ADDRESS,
 *   PLATFORM_TREASURY_ADDRESS
 */
contract DeployEscrow is Script {
    function run() public {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address orchestrator = vm.envAddress("ORCHESTRATOR_ADDRESS");
        address usdc = vm.envAddress("ARC_USDC_ADDRESS");
        address platform = vm.envAddress("PLATFORM_TREASURY_ADDRESS");

        vm.startBroadcast(deployerKey);
        MatchEscrow escrow = new MatchEscrow(usdc, platform, orchestrator);
        vm.stopBroadcast();

        console2.log("");
        console2.log("=== Paste into frontend/.env.local ===");
        console2.log("NEXT_PUBLIC_MATCH_ESCROW_ADDRESS=%s", address(escrow));
    }
}
