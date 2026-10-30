// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {ExternalAddresses, Deployment} from "./LaunchpadDeploy.sol";
import {LaunchpadChecks} from "./LaunchpadChecks.sol";

/// @title DeployLaunchpad
/// @notice Deploys the canonical UERC20Factory (if missing), our BeneficiaryVault, FeeSplitter,
///         InstantLaunchStrategy and UniversalRouterStrategy, then re-checks every immutable.
/// @dev Env: PLATFORM_TREASURY (Safe, required), INITIAL_TICK (optional), LAUNCHPAD_SALT (optional).
///      See docs/deployment.md for the exact command. Mainnet broadcasts are run by a human.
contract DeployLaunchpad is Script, LaunchpadChecks {
    function run() external returns (Deployment memory d) {
        require(block.chainid == 8453, "DeployLaunchpad: Base mainnet (8453) only");

        ExternalAddresses memory ext = loadExternal();
        address treasury = vm.envAddress("PLATFORM_TREASURY");
        int24 initialTick = int24(vm.envOr("INITIAL_TICK", int256(DEFAULT_INITIAL_TICK)));
        bytes32 salt = vm.envOr("LAUNCHPAD_SALT", bytes32(0));

        Deployment memory predicted = predict(ext, treasury, initialTick, salt);
        console.log("Treasury (Safe):        ", treasury);
        console.log("Initial tick:           ", initialTick);
        console.log("Predicted UERC20Factory:", predicted.tokenFactory);
        console.log("Predicted Vault:        ", predicted.beneficiaryVault);
        console.log("Predicted FeeSplitter:  ", predicted.feeSplitter);
        console.log("Predicted InstantLaunch:", predicted.instantLaunchStrategy);
        console.log("Predicted URStrategy:   ", predicted.universalRouterStrategy);

        broadcasting = true;
        d = deployLaunchpad(ext, treasury, initialTick, salt);
        broadcasting = false;

        checkDeployment(ext, d, treasury, initialTick);
        console.log("All immutables match the config.");
    }
}
