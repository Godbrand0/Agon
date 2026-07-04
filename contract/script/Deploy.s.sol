// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {MatchEscrow} from "../src/MatchEscrow.sol";

/**
 * Deploys AgentRegistry + MatchEscrow to Arc testnet.
 *
 * Required env vars (see ../deploy-arc.sh which maps them from
 * frontend/.env.local):
 *   DEPLOYER_PRIVATE_KEY    deployer key (gas paid in native USDC)
 *   ORCHESTRATOR_ADDRESS    backend signer allowed to run matches
 *   ARC_USDC_ADDRESS        USDC ERC-20 (0x3600…0000 on Arc testnet)
 *   PLATFORM_TREASURY_ADDRESS  receives the 10% platform share
 */
contract Deploy is Script {
    function run() public {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address orchestrator = vm.envAddress("ORCHESTRATOR_ADDRESS");
        address usdc = vm.envAddress("ARC_USDC_ADDRESS");
        address platform = vm.envAddress("PLATFORM_TREASURY_ADDRESS");

        vm.startBroadcast(deployerKey);

        AgentRegistry registry = new AgentRegistry(orchestrator);
        MatchEscrow escrow = new MatchEscrow(usdc, platform, orchestrator);

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== Paste into frontend/.env.local ===");
        console2.log("NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS=%s", address(registry));
        console2.log("NEXT_PUBLIC_MATCH_ESCROW_ADDRESS=%s", address(escrow));
    }
}
