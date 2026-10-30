# Deployment (Base mainnet)

How our launchpad contracts are deployed, verified and checked. Decisions behind every value: `docs/decisions.md`.

**A human runs the mainnet broadcast.** Agents prepare and simulate; they never pass `--broadcast` against mainnet.

## What gets deployed

All five contracts are unmodified audited code. They are built **inside their own submodule** with that submodule's own `foundry.toml`, and deployed through the deterministic CREATE2 deployer `0x4e59b44847b379578588920cA78FbF26c0B4956C`. None of them has an owner or admin; the deployer EOA keeps no privileges.

| # | Contract | Source (pinned) | Constructor args | Salt |
|---|---|---|---|---|
| 1 | `UERC20Factory` | `uerc20-factory` @ `de5bacd` (v2.0.0), solc 0.8.28, 50M runs | none | `0x2e36e8638e3163474ff2b2a355e1de801786d9ef34436cd7dd6418693d4474d8` (Uniswap's) |
| 2 | `BeneficiaryVault` | `liquidity-launcher` @ `1c59049`, solc 0.8.26, 200 runs | `positionManager`, `nativeFallback = PLATFORM_TREASURY`, `tokenFallback = PLATFORM_TREASURY` | `LAUNCHPAD_SALT` (default `0x0`) |
| 3 | `FeeSplitter` | same | `positionManager`, `[(vault, 6000, 6000, true), (PLATFORM_TREASURY, 4000, 4000, false)]` | same |
| 4 | `InstantLaunchStrategy` | same | `launcher`, `positionManager`, `poolManager`, `feeSplitter`, `vault`, `initialTick = 198050` | same |
| 5 | `UniversalRouterStrategy` | same | `launcher` | same |

**Factory init code hash.** The deploy script asserts it is `0xa30fe8b6c33a03e61dcdd8cafc5d01d1ccea33e3729966ca740632387bec5eca`. With Uniswap's salt that hash lands at Uniswap's canonical address, `0x000000e200088D55C39a11F609E5F667729ad49b`.

**External addresses.** All are read from `packages/contracts/config/base.json`, which records the source of each:

| Name | Address |
|---|---|
| `LiquidityLauncher` (Uniswap, v3.2.0) | `0x0000FffFBE8efE702c8703aE3477FF5dE3d319C0` |
| PoolManager | `0x498581fF718922c3f8e6A244956aF099B2652b2b` |
| PositionManager | `0x7C5f5A4bBd8fD63184577525326123B519429bDc` |
| Universal Router 2.1.2 | `0xd6145b2D3F379919E8CdEda7B97e37c4b2Ca9c40` |

### Expected addresses

Addresses 2–4 depend on `PLATFORM_TREASURY`, so they are only final once the Safe exists. The simulation step below prints them.

| Contract | Address |
|---|---|
| `UERC20Factory` | `0x000000e200088D55C39a11F609E5F667729ad49b`, always |
| `UniversalRouterStrategy` | `0x0A122717bc36E3C7A7958128a5C789E0b070b3Ae`, always |

The `UniversalRouterStrategy` address is identical to Uniswap's own deployment on Robinhood Chain and Arc (same init code). It is evidence that our build reproduces Uniswap's bytecode.

Dry run on a Base fork (block 53,284,643) with a placeholder treasury `0x…F00D`:

| Contract | Address (placeholder treasury) |
|---|---|
| `BeneficiaryVault` | `0x476bDF489FD0cf81E1B58F8f4cd9B0f62d6324A2` |
| `FeeSplitter` | `0xEE03DE7A6536BE2bBb3b8C4F7E8872b03D626a9B` |
| `InstantLaunchStrategy` | `0x4EF4FAE8CD0eD8DaC86aF7e319F5Ecb3BD427Adc` |

Estimated gas for the whole script: ~13.1M. That is ~0.00014 ETH of L2 execution at 0.0107 gwei, plus the L1 data fee for ~60 KB of init code.

## Prerequisites (once)

```bash
cast wallet import deployer --interactive        # Foundry keystore; never a raw key
# fund `deployer` on Base with ~0.005 ETH
# create the platform Safe on Base and note its address
```

## Commands

Run from `packages/contracts`. Use a dedicated RPC provider, not the public endpoint.

```bash
export BASE_RPC_URL=https://...           # dedicated Base mainnet RPC
export PLATFORM_TREASURY=0x...            # the Safe on Base (must already be deployed)
export ETHERSCAN_API_KEY=...              # Etherscan v2 key (works for BaseScan)

# 1. Build the audited artifacts in their own roots, then our scripts/tests.
bash script/build-upstream.sh && forge build

# 2. Fork tests must be green.
forge test --fork-url "$BASE_RPC_URL"

# 3. Simulate (no broadcast). Prints the predicted addresses and runs the immutable checks.
forge script script/DeployLaunchpad.s.sol:DeployLaunchpad \
  --rpc-url "$BASE_RPC_URL" --account deployer

# 4. Broadcast (human only).
forge script script/DeployLaunchpad.s.sol:DeployLaunchpad \
  --rpc-url "$BASE_RPC_URL" --account deployer --broadcast --slow

# 5. Re-check every immutable on-chain (read-only).
forge script script/CheckLaunchpad.s.sol:CheckLaunchpad --rpc-url "$BASE_RPC_URL"

# 6. Verify on BaseScan, using the addresses printed by step 5.
VAULT=0x... SPLITTER=0x... STRATEGY=0x... ROUTER_STRATEGY=0x... \
  bash script/verify-basescan.sh
```

The scripts refuse to run on any chain other than 8453. `DeployLaunchpad` also reverts if `PLATFORM_TREASURY` has no code, because the platform's share must go to a Safe and never to an EOA. Re-running `DeployLaunchpad` is safe: contracts that already exist are skipped.

## Verification notes

- `verify-basescan.sh` verifies each contract from its own submodule root, so BaseScan gets the audited compiler settings.
- Launcher contracts are verified with `--compiler-version v0.8.26+commit.8a97fa7a`. Several sources declare `^0.8.26`, so without the pin a newer solc would be picked and the bytecode would not match.
- Checked before deploy: the standard-JSON input that `forge verify-contract` submits recompiles with solc 0.8.26 to **exactly** the artifact bytecode for `BeneficiaryVault`, `FeeSplitter`, `InstantLaunchStrategy` and `UniversalRouterStrategy`.
- The `UERC20Factory` at the canonical address may already show as verified ("similar match") on BaseScan; re-verifying is harmless.

## Post-deploy checklist

- [ ] Step 5 (`CheckLaunchpad`) prints `OK: every immutable matches the config.` It re-reads:
  - **`InstantLaunchStrategy`:** `launcher`, `positionManager`, `poolManager`, `feeSplitter`, `beneficiaryVault`, `initialTick`, `TOTAL_SUPPLY` (1e27), `LP_FEE` (2500), `TICK_SPACING` (25).
  - **`FeeSplitter`:** `positionManager` and the full `getSplits()` array: recipients, 6000/4000 on both sides, callback flags.
  - **`BeneficiaryVault`:** `positionManager`, `nativeFallback`, `tokenFallback` (both the Safe).
  - **`UniversalRouterStrategy`:** `launcher`.
  - **`UERC20Factory`:** has code at the canonical address.
- [ ] All five contracts show verified source on BaseScan.
- [ ] Addresses written back into this file and into `packages/sdk` (M2).
- [ ] The Safe's owners and threshold are recorded in `docs/runbook.md`.
- [ ] First real launch (M4): the LP NFT is owned by the `FeeSplitter`, the creator owns the vault NFT, and the tx input ends with our Builder Code suffix.

## Known on-chain facts measured on a fork (block 53,284,643)

- **Protocol fee.** Base's Uniswap `V4FeeAdapter` sets a protocol fee of **400 pips (0.04%) in each direction** on our pools at launch, via `triggerFeeUpdate`. Uniswap governance can change it later.
  - The effective swap fee is `400 + 2500 − 400·2500/1e6 = 2899` pips ≈ **0.29%**.
  - Creators and the platform split only the LP fee: 0.25% of the input after the protocol fee.
- **First buy.** 0.1 ETH bought ~38.2M tokens (≈3.8% of supply) at the opening tick 198,050.
