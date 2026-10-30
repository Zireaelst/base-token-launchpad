#!/usr/bin/env bash
# Verifies every launchpad contract on BaseScan. Each contract is verified from its own submodule
# root so the compiler settings match the audited build.
# Required env: ETHERSCAN_API_KEY, PLATFORM_TREASURY, VAULT, SPLITTER, STRATEGY, ROUTER_STRATEGY
#   (addresses as printed by `forge script script/CheckLaunchpad.s.sol`).
# Optional env: INITIAL_TICK (default 198050).
set -euo pipefail
cd "$(dirname "$0")/.."

: "${ETHERSCAN_API_KEY:?}" "${PLATFORM_TREASURY:?}" "${VAULT:?}" "${SPLITTER:?}" "${STRATEGY:?}" "${ROUTER_STRATEGY:?}"
INITIAL_TICK="${INITIAL_TICK:-198050}"

cfg() { python3 -I -c "import json,sys; print(json.load(open('config/base.json'))[sys.argv[1]])" "$1"; }
LAUNCHER=$(cfg liquidityLauncher)
POOL_MANAGER=$(cfg poolManager)
POSITION_MANAGER=$(cfg positionManager)
FACTORY=$(cfg uerc20FactoryCanonical)

verify() { forge verify-contract --chain base --watch --etherscan-api-key "$ETHERSCAN_API_KEY" "$@"; }

# Every launcher contract was built with solc 0.8.26 (InstantLaunchStrategy pins it, and our
# UniversalRouterStrategy reproduces Uniswap's own Robinhood/Arc address). Several sources say
# ^0.8.26, so pin it here or verification would pick a newer compiler.
LAUNCHER_SOLC=v0.8.26+commit.8a97fa7a

verify --root lib/uerc20-factory "$FACTORY" src/factories/UERC20Factory.sol:UERC20Factory

verify --root lib/liquidity-launcher --compiler-version "$LAUNCHER_SOLC" "$VAULT" src/periphery/BeneficiaryVault.sol:BeneficiaryVault \
  --constructor-args "$(cast abi-encode 'constructor(address,address,address)' "$POSITION_MANAGER" "$PLATFORM_TREASURY" "$PLATFORM_TREASURY")"

verify --root lib/liquidity-launcher --compiler-version "$LAUNCHER_SOLC" "$SPLITTER" src/periphery/FeeSplitter.sol:FeeSplitter \
  --constructor-args "$(cast abi-encode 'constructor(address,(address,uint16,uint16,bool)[])' "$POSITION_MANAGER" "[($VAULT,6000,6000,true),($PLATFORM_TREASURY,4000,4000,false)]")"

verify --root lib/liquidity-launcher --compiler-version "$LAUNCHER_SOLC" "$STRATEGY" src/strategies/InstantLaunchStrategy.sol:InstantLaunchStrategy \
  --constructor-args "$(cast abi-encode 'constructor(address,address,address,address,address,int24)' "$LAUNCHER" "$POSITION_MANAGER" "$POOL_MANAGER" "$SPLITTER" "$VAULT" "$INITIAL_TICK")"

verify --root lib/liquidity-launcher --compiler-version "$LAUNCHER_SOLC" "$ROUTER_STRATEGY" src/strategies/UniversalRouterStrategy.sol:UniversalRouterStrategy \
  --constructor-args "$(cast abi-encode 'constructor(address)' "$LAUNCHER")"
