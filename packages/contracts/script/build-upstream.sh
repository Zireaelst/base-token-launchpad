#!/usr/bin/env bash
# Builds the audited upstream submodules with their OWN foundry.toml (compiler, optimizer,
# bytecode_hash), so the artifacts we deploy are byte-identical to Uniswap's builds.
set -euo pipefail
cd "$(dirname "$0")/.."

forge build --root lib/liquidity-launcher --use 0.8.26 \
  src/LiquidityLauncher.sol \
  src/strategies/InstantLaunchStrategy.sol \
  src/strategies/UniversalRouterStrategy.sol \
  src/periphery/FeeSplitter.sol \
  src/periphery/BeneficiaryVault.sol

forge build --root lib/uerc20-factory \
  src/factories/UERC20Factory.sol
