// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {CommonBase} from "forge-std/Base.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {FeeSplit} from "@liquidity-launcher/interfaces/IFeeSplitter.sol";

/// @notice External (already deployed) contracts on Base, read from config/base.json.
struct ExternalAddresses {
    address liquidityLauncher;
    address poolManager;
    address positionManager;
    address permit2;
    address create2Deployer;
    address universalRouter;
    address uerc20FactoryCanonical;
    bytes32 uerc20FactorySalt;
    bytes32 uerc20FactoryInitCodeHash;
}

/// @notice Contracts this launchpad deploys.
struct Deployment {
    address tokenFactory;
    address beneficiaryVault;
    address feeSplitter;
    address instantLaunchStrategy;
    address universalRouterStrategy;
}

/// @title LaunchpadDeploy
/// @notice Deploys our instances of the audited Uniswap Liquidity Launcher contracts. Shared by the
///         deploy script and the fork tests so both exercise the exact same path.
/// @dev Bytecode comes from artifacts built in each submodule's own root (script/build-upstream.sh),
///      never from this package's compiler settings. Every contract is deployed through the
///      deterministic CREATE2 deployer, so addresses are known before broadcasting.
abstract contract LaunchpadDeploy is CommonBase {
    using stdJson for string;

    /// @notice Creator / platform split in bps. Applies independently to the ETH side and the
    ///         token side (decisions.md §4, option T1). Changing this changes the fee model.
    uint16 internal constant CREATOR_BPS = 6_000;
    uint16 internal constant PLATFORM_BPS = 4_000;

    /// @notice Opening tick for every launch (decisions.md §5). Uniswap's default for ETH chains.
    int24 internal constant DEFAULT_INITIAL_TICK = 198_050;

    string internal constant LAUNCHER_OUT = "lib/liquidity-launcher/out/";
    string internal constant UERC20_OUT = "lib/uerc20-factory/out/";

    /// @dev Set by the script; tests deploy without broadcasting.
    bool internal broadcasting;

    error TreasuryNotAContract(address treasury);
    error InitCodeHashMismatch(string name, bytes32 actual, bytes32 expected);
    error Create2Failed(string name);
    error AddressMismatch(string name, address actual, address expected);

    function loadExternal() internal view returns (ExternalAddresses memory ext) {
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/config/base.json"));
        ext.liquidityLauncher = json.readAddress(".liquidityLauncher");
        ext.poolManager = json.readAddress(".poolManager");
        ext.positionManager = json.readAddress(".positionManager");
        ext.permit2 = json.readAddress(".permit2");
        ext.create2Deployer = json.readAddress(".create2Deployer");
        ext.universalRouter = json.readAddress(".universalRouter");
        ext.uerc20FactoryCanonical = json.readAddress(".uerc20FactoryCanonical");
        ext.uerc20FactorySalt = json.readBytes32(".uerc20FactorySalt");
        ext.uerc20FactoryInitCodeHash = json.readBytes32(".uerc20FactoryInitCodeHash");
    }

    /// @notice Fee splits for our FeeSplitter: 60% to the beneficiary vault (creator), 40% to the
    ///         platform treasury, on both the ETH and the token side.
    function feeSplits(address beneficiaryVault, address treasury) internal pure returns (FeeSplit[] memory splits) {
        splits = new FeeSplit[](2);
        // The vault attributes received amounts per position, so it needs the callback.
        splits[0] =
            FeeSplit({recipient: beneficiaryVault, nativeBps: CREATOR_BPS, tokenBps: CREATOR_BPS, useCallback: true});
        // The treasury is a Safe that only receives funds.
        splits[1] = FeeSplit({recipient: treasury, nativeBps: PLATFORM_BPS, tokenBps: PLATFORM_BPS, useCallback: false});
    }

    /// @notice Init code (creation code + constructor args) for every contract, in deploy order.
    function initCodes(
        ExternalAddresses memory ext,
        address treasury,
        int24 initialTick,
        address vault,
        address splitter
    )
        internal
        view
        returns (
            bytes memory factoryCode,
            bytes memory vaultCode,
            bytes memory splitterCode,
            bytes memory strategyCode,
            bytes memory routerStrategyCode
        )
    {
        factoryCode = vm.getCode(string.concat(UERC20_OUT, "UERC20Factory.sol/UERC20Factory.json"));
        vaultCode = abi.encodePacked(
            vm.getCode(string.concat(LAUNCHER_OUT, "BeneficiaryVault.sol/BeneficiaryVault.json")),
            abi.encode(IPositionManager(ext.positionManager), treasury, treasury)
        );
        splitterCode = abi.encodePacked(
            vm.getCode(string.concat(LAUNCHER_OUT, "FeeSplitter.sol/FeeSplitter.json")),
            abi.encode(IPositionManager(ext.positionManager), feeSplits(vault, treasury))
        );
        strategyCode = abi.encodePacked(
            vm.getCode(string.concat(LAUNCHER_OUT, "InstantLaunchStrategy.sol/InstantLaunchStrategy.json")),
            abi.encode(
                ext.liquidityLauncher,
                IPositionManager(ext.positionManager),
                IPoolManager(ext.poolManager),
                splitter,
                vault,
                initialTick
            )
        );
        routerStrategyCode = abi.encodePacked(
            vm.getCode(string.concat(LAUNCHER_OUT, "UniversalRouterStrategy.sol/UniversalRouterStrategy.json")),
            abi.encode(ext.liquidityLauncher)
        );
    }

    /// @notice Predicts every address without deploying anything.
    function predict(ExternalAddresses memory ext, address treasury, int24 initialTick, bytes32 salt)
        internal
        view
        returns (Deployment memory d)
    {
        d.tokenFactory = ext.uerc20FactoryCanonical;
        (, bytes memory vaultCode,,,) = initCodes(ext, treasury, initialTick, address(0), address(0));
        d.beneficiaryVault = _create2Address(ext.create2Deployer, salt, vaultCode);
        (,, bytes memory splitterCode,,) = initCodes(ext, treasury, initialTick, d.beneficiaryVault, address(0));
        d.feeSplitter = _create2Address(ext.create2Deployer, salt, splitterCode);
        (,,, bytes memory strategyCode, bytes memory routerStrategyCode) =
            initCodes(ext, treasury, initialTick, d.beneficiaryVault, d.feeSplitter);
        d.instantLaunchStrategy = _create2Address(ext.create2Deployer, salt, strategyCode);
        d.universalRouterStrategy = _create2Address(ext.create2Deployer, salt, routerStrategyCode);
    }

    /// @notice Deploys (or reuses, if already deployed) every launchpad contract.
    function deployLaunchpad(ExternalAddresses memory ext, address treasury, int24 initialTick, bytes32 salt)
        internal
        returns (Deployment memory d)
    {
        // The platform's share must go to a Safe, never to an EOA we control in code.
        if (treasury.code.length == 0) revert TreasuryNotAContract(treasury);

        // 1. Canonical UERC20Factory: identical audited bytecode at Uniswap's canonical address.
        (bytes memory factoryCode,,,,) = initCodes(ext, treasury, initialTick, address(0), address(0));
        bytes32 factoryHash = keccak256(factoryCode);
        if (factoryHash != ext.uerc20FactoryInitCodeHash) {
            revert InitCodeHashMismatch("UERC20Factory", factoryHash, ext.uerc20FactoryInitCodeHash);
        }
        d.tokenFactory = _deploy("UERC20Factory", ext.create2Deployer, ext.uerc20FactorySalt, factoryCode);
        if (d.tokenFactory != ext.uerc20FactoryCanonical) {
            revert AddressMismatch("UERC20Factory", d.tokenFactory, ext.uerc20FactoryCanonical);
        }

        // 2-5. Our instances. Each depends on the previous address, so build init code in order.
        (, bytes memory vaultCode,,,) = initCodes(ext, treasury, initialTick, address(0), address(0));
        d.beneficiaryVault = _deploy("BeneficiaryVault", ext.create2Deployer, salt, vaultCode);

        (,, bytes memory splitterCode,,) = initCodes(ext, treasury, initialTick, d.beneficiaryVault, address(0));
        d.feeSplitter = _deploy("FeeSplitter", ext.create2Deployer, salt, splitterCode);

        (,,, bytes memory strategyCode, bytes memory routerStrategyCode) =
            initCodes(ext, treasury, initialTick, d.beneficiaryVault, d.feeSplitter);
        d.instantLaunchStrategy = _deploy("InstantLaunchStrategy", ext.create2Deployer, salt, strategyCode);
        d.universalRouterStrategy = _deploy("UniversalRouterStrategy", ext.create2Deployer, salt, routerStrategyCode);
    }

    function _deploy(string memory name, address deployer, bytes32 salt, bytes memory initCode)
        private
        returns (address deployed)
    {
        deployed = _create2Address(deployer, salt, initCode);
        // Idempotent: re-running the script skips contracts that already exist.
        if (deployed.code.length > 0) return deployed;
        if (broadcasting) vm.broadcast();
        (bool ok, bytes memory ret) = deployer.call(abi.encodePacked(salt, initCode));
        if (!ok || ret.length != 20 || address(bytes20(ret)) != deployed) revert Create2Failed(name);
    }

    function _create2Address(address deployer, bytes32 salt, bytes memory initCode) internal pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), deployer, salt, keccak256(initCode))))));
    }
}
