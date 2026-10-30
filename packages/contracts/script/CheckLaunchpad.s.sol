// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {ExternalAddresses, Deployment} from "./LaunchpadDeploy.sol";
import {LaunchpadChecks} from "./LaunchpadChecks.sol";

/// @title CheckLaunchpad
/// @notice Read-only post-deploy check: recomputes the deterministic addresses from the same env as
///         DeployLaunchpad and re-reads every immutable on-chain. Never broadcasts.
/// @dev Env: PLATFORM_TREASURY (required), INITIAL_TICK (optional), LAUNCHPAD_SALT (optional).
contract CheckLaunchpad is Script, LaunchpadChecks {
    function run() external view {
        require(block.chainid == 8453, "CheckLaunchpad: Base mainnet (8453) only");
        ExternalAddresses memory ext = loadExternal();
        address treasury = vm.envAddress("PLATFORM_TREASURY");
        int24 initialTick = int24(vm.envOr("INITIAL_TICK", int256(DEFAULT_INITIAL_TICK)));
        bytes32 salt = vm.envOr("LAUNCHPAD_SALT", bytes32(0));

        Deployment memory d = predict(ext, treasury, initialTick, salt);
        console.log("UERC20Factory:          ", d.tokenFactory);
        console.log("BeneficiaryVault:       ", d.beneficiaryVault);
        console.log("FeeSplitter:            ", d.feeSplitter);
        console.log("InstantLaunchStrategy:  ", d.instantLaunchStrategy);
        console.log("UniversalRouterStrategy:", d.universalRouterStrategy);
        checkDeployment(ext, d, treasury, initialTick);
        console.log("OK: every immutable matches the config.");
    }
}
