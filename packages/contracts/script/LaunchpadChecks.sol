// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {FeeSplit} from "@liquidity-launcher/interfaces/IFeeSplitter.sol";
import {ExternalAddresses, Deployment, LaunchpadDeploy} from "./LaunchpadDeploy.sol";

/// @dev View surfaces of the deployed contracts, declared locally so checks never compile upstream code.
interface IInstantLaunchStrategyView {
    function launcher() external view returns (address);
    function positionManager() external view returns (address);
    function poolManager() external view returns (address);
    function feeSplitter() external view returns (address);
    function beneficiaryVault() external view returns (address);
    function initialTick() external view returns (int24);
    function TOTAL_SUPPLY() external view returns (uint256);
    function LP_FEE() external view returns (uint24);
    function TICK_SPACING() external view returns (int24);
}

interface IFeeSplitterView {
    function positionManager() external view returns (address);
    function getSplits() external view returns (FeeSplit[] memory);
}

interface IBeneficiaryVaultView {
    function positionManager() external view returns (address);
    function nativeFallback() external view returns (address);
    function tokenFallback() external view returns (address);
}

interface IUniversalRouterStrategyView {
    function launcher() external view returns (address);
}

/// @title LaunchpadChecks
/// @notice Re-reads every immutable of a deployment on-chain and compares it with the config.
///         Used by the post-deploy script and by the fork tests.
abstract contract LaunchpadChecks is LaunchpadDeploy {
    error CheckFailed(string what);

    function checkDeployment(ExternalAddresses memory ext, Deployment memory d, address treasury, int24 initialTick)
        internal
        view
    {
        _check(d.tokenFactory.code.length > 0, "factory has code");
        _check(d.tokenFactory == ext.uerc20FactoryCanonical, "factory is canonical");

        IInstantLaunchStrategyView s = IInstantLaunchStrategyView(d.instantLaunchStrategy);
        _check(s.launcher() == ext.liquidityLauncher, "strategy.launcher");
        _check(s.positionManager() == ext.positionManager, "strategy.positionManager");
        _check(s.poolManager() == ext.poolManager, "strategy.poolManager");
        _check(s.feeSplitter() == d.feeSplitter, "strategy.feeSplitter");
        _check(s.beneficiaryVault() == d.beneficiaryVault, "strategy.beneficiaryVault");
        _check(s.initialTick() == initialTick, "strategy.initialTick");
        _check(s.TOTAL_SUPPLY() == 1_000_000_000e18, "strategy.TOTAL_SUPPLY");
        _check(s.LP_FEE() == 2_500, "strategy.LP_FEE");
        _check(s.TICK_SPACING() == 25, "strategy.TICK_SPACING");

        IFeeSplitterView fs = IFeeSplitterView(d.feeSplitter);
        _check(fs.positionManager() == ext.positionManager, "splitter.positionManager");
        FeeSplit[] memory actual = fs.getSplits();
        FeeSplit[] memory expected = feeSplits(d.beneficiaryVault, treasury);
        _check(actual.length == expected.length, "splitter.splits.length");
        for (uint256 i; i < expected.length; i++) {
            _check(actual[i].recipient == expected[i].recipient, "splitter.split.recipient");
            _check(actual[i].nativeBps == expected[i].nativeBps, "splitter.split.nativeBps");
            _check(actual[i].tokenBps == expected[i].tokenBps, "splitter.split.tokenBps");
            _check(actual[i].useCallback == expected[i].useCallback, "splitter.split.useCallback");
        }

        IBeneficiaryVaultView v = IBeneficiaryVaultView(d.beneficiaryVault);
        _check(v.positionManager() == ext.positionManager, "vault.positionManager");
        _check(v.nativeFallback() == treasury, "vault.nativeFallback");
        _check(v.tokenFallback() == treasury, "vault.tokenFallback");

        _check(
            IUniversalRouterStrategyView(d.universalRouterStrategy).launcher() == ext.liquidityLauncher,
            "routerStrategy.launcher"
        );
    }

    function _check(bool ok, string memory what) private pure {
        if (!ok) revert CheckFailed(what);
    }
}
