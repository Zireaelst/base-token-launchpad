# Decisions log

Status of every open question from the master prompt (`docs/MASTER_PROMPT.md`), milestone M0.
Each entry has the decision, the evidence, and whether it needs a human answer.
Sources were read on 2026-10-30.

Legend: **DECIDED**: settled from source, no input needed. **PROPOSED**: my recommendation, needs approval. **NEEDS YOU**: blocked on keys, funds, brand, or a fee/split decision.

---

## 0. Sources read

| Source | Version read |
|---|---|
| `Uniswap/liquidity-launcher` | `main` @ `266c187`, tag `v3.3.0` → `e428c3f`, and commits `1c59049`, `7ea523c`, `214b8a6` |
| `Uniswap/uerc20-factory` | submodule pin `6f18f1c`, release `de5bacd` (v2.0.0), `main` @ `a747318` |
| OpenZeppelin audit `docs/audit/OpenZeppelin_v3.0.0.pdf` (2026-08-21) | full text |
| `base/skills` → `skills/build-on-base` | @ `95b8ab2` (read from GitHub; **not installed locally**, see §13) |
| `docs.base.org/llms.txt`, Base Builder Codes pages, "migrate to standard web app" | live |
| Roadmap v3 + grant draft (`Zireaelst/Codex-Claude-Research`, `base-project-roadmaps/2026-10-30/`) | live |
| Base mainnet state | read with `cast` against `https://mainnet.base.org` |

---

## 1. Which commit to pin. **APPROVED 2026-10-30**

The prompt pins `1c5904912aefceaceb89c24528cd5e25d0b61597` and calls it "v3.3.0". What the source shows:

- README lists `1c59049` for v3.3.0 `LBPStrategy` on every chain, and for Uniswap's production `InstantLaunchStrategy` on Robinhood Chain. **Verified, the commit matches the README.**
- Git tag `v3.3.0` is a **different commit**, `e428c3f` (on `main`). `1c59049`, `7ea523c` (the "release: v3.3.0" commit) and `214b8a6` are **not ancestors of `main` or of the tag**. They are merges from Uniswap's internal repo, but GitHub serves them by SHA.
- `src/` differs between `1c59049` and the tag in **one file only**: `InstantLaunchStrategy.sol`.
  - At `1c59049`, every launch **reverts** if the PoolManager's protocol fee controller is unset or `triggerFeeUpdate` fails (`_requireFeeUpdate`).
  - At the tag, the failure is ignored (CHANGELOG 3.3.0: "Instant launches no longer revert when a protocol fee controller is unset").
- **Base has a controller set:** `PoolManager.protocolFeeController()` = `0xc53DD825dedBE7814562528A1A30e8e5BCbB4b55` (Uniswap `V4FeeAdapter`; `POOL_MANAGER()` = the Base PoolManager). So the strict path runs on Base, and it works only if `triggerFeeUpdate` succeeds for our pools.

**Proposal:** pin `1c59049` as instructed. It is byte-for-byte what Uniswap runs in production for this strategy. M1 then includes a **gating fork test** proving that `triggerFeeUpdate` succeeds on Base for our pool key. If that test fails, I stop and report rather than switching commits on my own.

**M1 result:** the gating test passes on a Base fork (block 53,284,643); see §9.

**Audit coverage, stated precisely.** OpenZeppelin's v3.0.0 audit (four phases, 2026-07-22 → 07-28) covered `FeeSplitter`, `BeneficiaryVault`, `UERC20BeneficiaryVault`, `InstantLaunchStrategy` (as "DirectLaunchStrategy"), `UniversalRouterStrategy` and `LiquidityLauncher` at earlier commits. The `StrategyBase` / `triggerFeeUpdate` change from 3.3.0 came **after** that audit. Of 23 findings, 11 are resolved. The ones that matter to us are acknowledged but not fixed: M-01, L-01, L-02, L-08 and CR-01 (see §10).
→ The copy will say "built on Uniswap Liquidity Launcher, audited by OpenZeppelin (report ↗)", not a blanket "audited". The roadmap's "6 audits" claim also needs this nuance, because the older audits predate these contracts.

## 2. Does the launcher accept a custom strategy? **DECIDED: yes**

`LiquidityLauncher.distributeToken(token, Distribution{strategy, amount, configData}, salt)` force-approves **any** `distribution.strategy` and calls `initializeDistribution` (`src/LiquidityLauncher.sol`). There is no allowlist. In the other direction, our strategy only accepts calls from its immutable `launcher`.

Uniswap's `LiquidityLauncher` on Base: `0x0000FffFBE8efE702c8703aE3477FF5dE3d319C0`.
- README lists it as **v3.2.0** (commit `dd8769c`), not v3.3.0.
- On-chain: code present (4127 bytes), and the bytecode contains the `distributeWithNative` selector (`0x0ef847b6`), which the first-buy flow needs (§6).
- The M1 fork test proves end-to-end compatibility between this v3.2.0 launcher and our `1c59049` strategy.

Other Base addresses, all read from `script/contracts/Parameters.sol` @ `1c59049`, all with code on-chain:

| Contract | Address |
|---|---|
| v4 PoolManager | `0x498581fF718922c3f8e6A244956aF099B2652b2b` |
| v4 PositionManager | `0x7C5f5A4bBd8fD63184577525326123B519429bDc` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| CREATE2 deployer | `0x4e59b44847b379578588920cA78FbF26c0B4956C` |

## 3. Token factory. **APPROVED 2026-10-30: option A**

The prompt says to reuse "the audited UERC20 factory used by the launcher (address from README)". **No UERC20Factory is deployed on Base:**

- The Liquidity Launcher README lists no factory address.
- The `uerc20-factory` README lists `UERC20Factory` v2.0.0 at `0x000000e200088D55C39a11F609E5F667729ad49b` on Mainnet, Robinhood and Sepolia only. On Base that address has **no code**.
- Base only has **`USUPERC20Factory`** v2.0.0 at `0xeEeeEEE204Afb6BABb1287ffed52cCD6BA0b0fb2` (code present).

The options:

| | A. Deploy canonical `UERC20Factory` v2.0.0 (recommended) | B. Use deployed `USUPERC20Factory` |
|---|---|---|
| Code | Identical audited bytecode, no constructor args. Uniswap's script documents salt `0x2e36…74d8` → `0x000000e2…d49b` via the CREATE2 deployer, so anyone can deploy it to the **same canonical address** on Base | Already there |
| "Fixed supply, no mint" | True: plain ERC20, minted once | Weaker. `crosschainMint` is callable by the SuperchainTokenBridge predeploy, which **has code on Base** (`0x42…0028`). Base-local supply could change if interop is enabled |
| Extra step | One more contract in the deploy (cheap) | None |

**Proposal: A.** The bytecode reproduces the canonical address (§14).
This deviates from rule 1's "reuse Uniswap's deployed factory" only because no such factory exists on Base. We would still deploy only audited, unmodified bytecode.

## 4. Fee splits and constructor arguments. **APPROVED 2026-10-30: T1 (token side 60/40); revisit in `docs/backlog.md`**

`FeeSplitter(positionManager, FeeSplit[])`: each side independently sums to 10,000 bps; recipients are non-zero and unique; `useCallback` requires a contract.

**ETH side (given in the prompt):**

| Recipient | nativeBps | useCallback |
|---|---|---|
| vault | 6000 | true |
| `PLATFORM_TREASURY` (Safe) | 4000 | false |

**Token side: your call.** Context:
- In v4, the fee is charged on the input currency. Buys pay fees in ETH; **sells pay fees in the token**. So the token side is a real fraction of revenue.
- Uniswap's own split sends 100% of token fees to a compounder.
- The roadmap (§3.3) says "creators should not be paid in their own token".

| Option | Creator gets | Platform gets | Note |
|---|---|---|---|
| T1 (prompt default) | 60% of token fees | 40% of token fees | Treasury Safe accumulates many memecoins (sell pressure / optics) |
| T2 | 100% of token fees | 0% of token fees | Changes the platform's share |
| T3 | 60% of token fees | 40% burned (`0xdead`, no callback) | Platform earns ETH only; creator still gets tokens |

I won't pick, because this changes the creator/platform split. **Default if you say "go": T1.**

**Vault:** plain `BeneficiaryVault(positionManager, nativeFallback=PLATFORM_TREASURY, tokenFallback=PLATFORM_TREASURY)`. **PROPOSED.**
- Our strategy always calls `registerBeneficiary` before handing the NFT to the splitter, so the UERC20 graffiti path is unnecessary.
- Skipping that path also skips audit findings L-05, L-06, L-07 and N-01.
- Fallbacks only receive fees from positions that someone else sends to our splitter without registering.

**Strategy:** `InstantLaunchStrategy(launcher=0x0000FffF…19C0, positionManager, poolManager, feeSplitter, vault, initialTick)`.

**`PLATFORM_TREASURY`:** a Safe on Base, from env. **NEEDS YOU: the address.**

## 5. Initial tick. **APPROVED 2026-10-30: 198_050**

The prompt says to copy the tick from "Uniswap's own Base deployment parameters". **There is no Uniswap `InstantLaunchStrategy` on Base.** The README lists only Robinhood Chain (tick 198,050) and Arc (122,050).

Uniswap's deploy script default, commented "default tick on ETH based chains", is **198_050**, and that is what their Robinhood (ETH-gas) deployment uses.
- Valid: a multiple of 25, ≤ `MAX_INITIAL_TICK` 251,325, > `MIN_LAUNCH_TICK` −160,100.
- It opens at roughly 1 ETH ≈ 398.8M tokens, i.e. a **starting fully diluted value of about 2.5 ETH**.

**Proposal: 198_050.** M1 computes the exact value and records it in `deployment.md`. Tell me if you want a different starting market cap. This does not change fees.

Constants from source (the source wins over the docs):
- `TOTAL_SUPPLY = 1e27`
- `LP_FEE = 2_500` (0.25%)
- **`TICK_SPACING = 25`**. `docs/TechnicalReference.md` says 60 — the doc is wrong.
- Range is `[-160_100, initialTick]`, single-sided.

## 6. First buy. **DECIDED: `UniversalRouterStrategy` in the same multicall**

`LiquidityLauncher.multicall` is payable and uses `delegatecall`, so one transaction can carry three calls:

```
multicall{value: firstBuy}([
  createToken(UERC20Factory, name, symbol, 18, 1e27, recipient = launcher, metadata),
  distributeToken(token, {strategy: InstantLaunchStrategy, amount: 1e27, configData: abi.encode(creator)}, salt),
  distributeWithNative(UniversalRouterStrategy, abi.encode(router, creator, route), salt, firstBuy)   // only if firstBuy > 0
])
```

- That is **one signature**, against two (launch, then swap) for a follow-up Universal Router swap. The creator is also guaranteed to be the first buyer, which is the only anti-snipe we can offer in F1.
- Requires deploying our own `UniversalRouterStrategy(launcher)` from the same commit. Uniswap has none on Base.
- The route must use `TAKE` with an explicit recipient (never `TAKE_ALL`) and must sweep leftover ETH, per the contract's NatSpec and audit L-08.
- Universal Router address: from Uniswap's official v4 deployments page / `@uniswap/universal-router-sdk`, recorded in M1.

## 7. Atomic launch (rule 2). **DECIDED**

The SDK exposes only `buildLaunchCalldata()`, which always returns one `multicall` with `createToken(recipient=launcher)` and `distributeToken` together. There is no exported way to build them separately.

Tests:
- **Fork:** a split launch (create in tx 1, attacker calls `distributeToken` to their own strategy in tx 2) succeeds in stealing the supply.
- **SDK unit test:** decodes every builder's output and asserts that any `createToken` with `recipient == launcher` sits in the same multicall as a `distributeToken` for that token.

## 8. Claiming fees ("Claim all"). **PROPOSED, adds a step (rule 6 justification)**

Fees reach the creator in two on-chain steps:
1. Permissionless `FeeSplitter.collectFees(uint256[] tokenIds)` pulls fees from the pool into the vault (and pays the treasury).
2. `BeneficiaryVault.claim(tokenId, min0, min1)`, callable only by the beneficiary NFT owner, once per position. The vault has **no multicall**.

**Proposal:**
- **Smart wallets** (Base App, Coinbase Smart Wallet, any EIP-5792 wallet): one `wallet_sendCalls` batch (`collectFees(all)` + `claim` × N). **One signature.**
- **EOAs:** `collectFees(all)` + `claim` per token, i.e. 1+N signatures. Most creators have 1 token, so this is 2 signatures.
- **Justification:** unavoidable without a custom contract, which is out of scope.
- **Rejected:** a server-side keeper calling `collectFees`. It needs a hot key on the server, which conflicts with rule 4. Revisit later with a CDP server wallet if you want it.

## 9. Protocol fee on Base. **MEASURED in M1: 0.04% each direction**

Base's `V4FeeAdapter` (owner/feeSetter `0x31FAfd48…72A9`, TokenJar `0x9bD25e67…168c`) is called by our strategy through `triggerFeeUpdate`. The fork test `test_launch_feeUpdateSucceedsOnBase_reportProtocolFee` (block 53,284,643) shows:

- `triggerFeeUpdate` succeeds on Base, so the strict path of commit `1c59049` (§1) works. **Gate passed.**
- It sets a protocol fee of **400 pips (0.04%) on buys and on sells**.
- The effective swap fee is `400 + 2500 − 400·2500/1e6 = 2899` pips, ≈ **0.29%**.
- Uniswap takes its 0.04% first. Creators and the platform split the 0.25% LP fee: a 1 ETH buy produced 0.002499 ETH of LP fees, then 60% / 40%.

Consequences:
- The rules card shows the **on-chain** fee, read live from `slot0`, because Uniswap governance can change it: "TRADE FEE 0.29% = 0.25% LP fee (creator 60% · platform 40%) + 0.04% Uniswap protocol fee".
- Marketing copy and the grant text must not say "0.25% trade fee" alone.
- Our split is unchanged. This is disclosure, not a fee change.

## 9b. Compiler pin and bytecode fidelity. **DECIDED in M1**

- Every launcher contract is built with **solc 0.8.26**: `InstantLaunchStrategy` and `LiquidityLauncher` pin it. Our `UniversalRouterStrategy` lands on `0x0A122717…b3Ae`, Uniswap's own address on Robinhood Chain and Arc, which proves the build reproduces Uniswap's bytecode.
- `FeeSplitter`, `BeneficiaryVault` and `UniversalRouterStrategy` declare `^0.8.26`. Compiled alone with auto-detect, they get a newer solc and different bytecode. So `build-upstream.sh` passes `--use 0.8.26`, and `verify-basescan.sh` passes `--compiler-version v0.8.26+commit.8a97fa7a`.
- Checked: the verify standard-JSON input recompiles to the exact deployed artifact for all four launcher contracts.
- The nested `openzeppelin-contracts` submodule in `liquidity-launcher` uses an SSH URL. Clone with `git -c url."https://github.com/".insteadOf="git@github.com:" submodule update --init --recursive`.

## 10. Known contract-level risks (acknowledged upstream, not fixed) and our mitigations

| Finding | Effect for us | Mitigation (app layer only) |
|---|---|---|
| CR-01: anyone can initialize the hookless pool key first, which bricks that token's launch | A griefer who predicts name + symbol + creator can block it | Base has no public mempool. Token address depends on creator graffiti. We simulate before sending; on `PoolAlreadyInitialized` we show "this name/ticker is blocked, change it" |
| L-01: pool opens with zero active liquidity; `slot0` is not a price until the first trade crosses `initialTick` | Wrong price/mcap if read from `slot0` early | Price from the initial tick until the first swap, then from swaps; the first buy closes the gap |
| M-01: stray ETH sent to the splitter is flushed through the splits | Negligible | Document it |
| L-08: prefunded router inputs can be swept | Only if our route leaves dust | `TAKE` explicit recipient + sweep, plus a test |

## 11. Builder Codes (rule 3). **DECIDED approach; NEEDS YOU: the code**

Per `build-on-base` → `builder-codes/wagmi.md` and `smart-wallets.md`:
- `Attribution.toDataSuffix({ codes: [BUILDER_CODE] })` from `ox/erc8021`;
- set as wagmi `createConfig({ dataSuffix })` (needs `viem >= 2.45.0`), so it covers `sendTransaction`, `writeContract` and `sendCalls`;
- additionally passed as `capabilities.dataSuffix` on `sendCalls`.

The SDK builders also append it, and a unit test asserts every built calldata ends with the suffix (trailing `8021…` marker).

For verification, a mainnet tx's input is decoded in M4 and checked with builder-code-checker. Note from the skill: base.dev analytics currently count smart-account txs; EOA support is "coming".

**NEEDS YOU:** the Builder Code from base.dev → Settings → Builder Codes.

## 12. Base App. **DECIDED**

Since 2026-04-09 the Base App opens every app as a standard web app in its in-app browser with an injected wallet. Listing comes from **base.dev project metadata**: name, icon, tagline, description, screenshots, category, primary URL and builder code. There is no `farcaster.json`. Notifications, if ever, go through the base.dev API keyed by wallet.

So:
- no MiniKit or Farcaster SDK;
- wagmi `injected` + Coinbase Smart Wallet connectors;
- test at 375px with an injected provider;
- **NEEDS YOU:** base.dev account actions (M4).

## 13. Tooling. **DONE 2026-10-30 (except the deployer key)**

- `build-on-base` skill installed in the project (`.agents/skills/build-on-base`, symlinked from `.claude/skills`, locked in `skills-lock.json`). `SKILL.md` is identical to `base/skills` @ `95b8ab2`, the version reviewed in M0.
- `base-docs` MCP added (`claude mcp add --transport http base-docs https://docs.base.org/mcp`, local scope).
- Node 24.22.2 installed (`brew install node@24`). The shell PATH still points at node@22; the user switches it.
- CI removed for now at the user's request (2026-10-30). Fork tests run locally against Base: the public RPC `https://mainnet.base.org` for now, a dedicated RPC before launch.
- Deployer key: still open (see §15).

## 14. UERC20Factory reproducibility check. **DECIDED: reproducible**

Built `uerc20-factory` @ `de5bacd` (v2.0.0) with its own `foundry.toml` (solc 0.8.28, `bytecode_hash = "none"`, 50M optimizer runs).

- initcode hash: `0xa30fe8b6c33a03e61dcdd8cafc5d01d1ccea33e3729966ca740632387bec5eca`
- `cast create2 --deployer 0x4e59…956C --salt 0x2e36e8638e3163474ff2b2a355e1de801786d9ef34436cd7dd6418693d4474d8` → **`0x000000e200088D55C39a11F609E5F667729ad49b`**

That is exactly Uniswap's canonical address (13,380 bytes of code on Ethereum mainnet). A CREATE2 address commits to the initcode hash, so option §3-A puts **identical audited bytecode at the same canonical address on Base**. Anyone can submit that deployment, so it requires no trust in us.

## 15. Other inputs I need before M1 ends

- `BASE_RPC_URL`: a dedicated provider (the skill says not to use the public RPC in production). Fork tests can start on `mainnet.base.org`.
- BaseScan / Etherscan v2 API key, for verification.
- Brand name and domain (M3/M4).

## 16. Discrepancies between prompt/docs and source (source wins)

| Claim | Source says |
|---|---|
| Prompt: commit `1c59049` = "v3.3.0" | Tag `v3.3.0` = `e428c3f`. `1c59049` matches the README deployment rows; strategy differs (§1) |
| Prompt: reuse Uniswap's token factory on Base | None deployed on Base (§3) |
| Prompt: copy initial tick from Uniswap's Base deployment | No Base InstantLaunch deployment; using script default 198_050 (§5) |
| Prompt: "LiquidityLauncher … v3.3.0" | Base launcher is v3.2.0 `dd8769c` |
| TechnicalReference: tick spacing 60 | Source: 25 |
| Roadmap §4: "Base: yes (v3.3.0)" | Only `LiquidityLauncher` + `LBPStrategy` / `InitializerHook` are on Base |
| Roadmap: "6 audits" | Only the OZ v3.0.0 audit covers the instant-launch contracts; 3.3.0 fee-update change unaudited (§1) |
| Roadmap F0: "test launch on Base Sepolia" | Prompt says fork tests, no Sepolia. Following the prompt |

---

## 17. Where the Builder Code suffix is attached. **DECIDED in M2**

The `build-on-base` skill prefers a client-level `dataSuffix` in the wagmi config. We attach it in the SDK instead:

- Every `prepare*` builder returns an `AttributedTx`, whose data ends with the ERC-8021 suffix. That type is branded and only `attribute()` produces it. The web app's send helpers accept only `AttributedTx` / `AttributedBatch`, so an unattributed transaction does not compile.
- For EIP-5792 `wallet_sendCalls`, `AttributedBatch` also carries `capabilities.dataSuffix`, so the suffix lands on the outer userOp callData, per `smart-wallets.md`.
- **The wagmi config must not also set `dataSuffix`**, or the suffix would be appended twice. A test asserts each builder appends it exactly once.
- Why: "every transaction carries our Builder Code" becomes a unit-testable property of the SDK (rule 3), not of a runtime config.
- Proven on a Base fork: launch, first buy, buy, sell, Permit2 approval, collect and claim all succeed with the suffix, and `Attribution.fromData` decodes our code from the transaction input as it landed on-chain.
- The code comes from env (`NEXT_PUBLIC_BUILDER_CODE`). Tests use `bc_test`.

## 18. Selling needs a one-time Permit2 approval. **DECIDED in M2 (rule 6 justification)**

The Universal Router pulls sold tokens through Permit2.

- UERC20 already grants Permit2 an infinite ERC-20 allowance (Solady default, verified on the fork), so no ERC-20 `approve` is ever needed.
- The first sell of a token on an EOA takes one extra transaction: `permit2.approve(token, router, max, now + 30 days)`, the same window Uniswap's interface uses. Later sells are one transaction.
- Smart wallets batch the approval and the sell in one `wallet_sendCalls`.
- **Justification:** the only alternative is a Permit2 signature on every sell, which is also two wallet prompts.

## 19. First-buy minimum output. **DECIDED in M2**

The pool is created inside the same transaction, so the first buy's output is deterministic. A pre-initialized pool (CR-01) makes the whole launch revert. `firstBuyMinOut` therefore defaults to 0; the app may pass a simulated amount minus slippage.

## 20. Indexer design. **DECIDED in M2**

- **Ponder 0.18.3:** PGlite locally, Postgres (`DATABASE_URL`) in production.
- **Swaps:** Base's PoolManager emits a very large number of `Swap` events, and Ponder cannot filter on a growing set of pool ids. So we index our tokens' `Transfer` events (factory pattern on `TokenLaunched`). For transfers touching the PoolManager, we fetch the receipt (cached by Ponder) and read the `Swap` logs matching the token's pool id.
- **Trader identity:** the trader is the counterparty of the token transfer: the recipient on buys, the payer on sells. That is the smart account for smart wallets, not the bundler.
- **Creator:** the beneficiary NFT mint in the launch receipt, not `tx.from`.
- **Prices:** integers, in wei per whole token (`2^192 · 1e18 / sqrtPriceX96²`). OHLC is built only from real swaps, at 1m / 5m / 1h / 1d. "1h change" compares against the last trade before the cutoff, or the opening price.
- **Holders:** from transfers; the PoolManager row is labelled as the pool.
- **Stats:** `/stats` excludes `EXCLUDED_WALLETS`.
- **Verified on a fork:**
  - holder balances equal `balanceOf` and sum to the fixed supply;
  - volume equals the sum of trades;
  - creator fees match 60% of collected LP fees exactly;
  - stats match the token list.

## 21. Colour tokens adjusted for WCAG AA. **DECIDED in M3**

The spec's `--mute #8a8a86` (3.2:1 on `--bg`) and `--sell #e5484d` (about 3.6:1) fail AA as text on the light background, and the spec also requires AA. Light theme uses `--mute #5f5f5b` (4.6:1) and `--sell #c62a2f`; dark uses `--mute #9a9a95` and `--sell #ff6b70`. Everything else is as specified. Lighthouse accessibility is 100 on `/`.

## 22. pnpm minimum-release-age exceptions. **DECIDED in M3 (owner did not object)**

pnpm 12 refuses packages published very recently. It recorded two exceptions in `pnpm-workspace.yaml` that the app needs:
- `geist@1.9.0`: Geist Pixel fonts;
- `@base-org/account@2.6.0`: Base Account / Smart Wallet connector.

Both are pinned exactly. Revisit when older versions pass the age check.

## 23. Optional `@x402/*` peers stubbed in the web bundle. **DECIDED in M3**

`@base-org/account` depends on `@coinbase/cdp-sdk`, whose x402 payment helpers import optional `@x402/*` peers. We neither install nor use those, but Turbopack fails on unresolvable imports even in unused code. `next.config.ts` aliases the 20 specifiers to an empty CommonJS stub (`lib/stubs/x402.cjs`). No code path reaches them.

## 24. Token images and the board. **DECIDED in M3**

- Token metadata is on-chain, so anyone launching through another frontend can point `image` anywhere. We render only images from our Blob store or our own upload route; anything else shows a blank tile.
- The board's dithered tiles load a 64px thumbnail via the Next image optimizer, during idle time. Decoding full 512px images was the main cause of mobile Total Blocking Time.
- The hero canvas precomputes both poses' dot levels per resize, batches all dots into one path and runs at about 30 fps.
- Result on `/` (local production build): mobile Lighthouse performance 70 → 96, TBT 1.6 s → 0.2 s.

## 25. Smaller M3 choices

- **Upload validation:** images are decoded server-side with sharp; the client MIME type is not trusted. Output is 512×512 WebP, and its SHA-256 goes on-chain in `extraData` (`{ v, img, x?, tg? }`).
- **Reports:** stored as **private** Blob objects. Moderation acts by editing `HIDDEN_TOKENS`; a hidden token stays reachable by URL with a warning banner.
- **Trade-fee line on the rules card:** read live from the pool's `slot0` (§9). The create preview uses the latest launch's real fee, or says "set at launch".
- **"Creator earnings" on the board:** fees *collected* through the FeeSplitter so far. Uncollected fees are shown exactly on the profile (§8, `readClaimable`).
- **Gas sponsorship:** behind `NEXT_PUBLIC_SPONSOR_FIRST_LAUNCH` (default off), proxied through `/api/paymaster` to `CDP_PAYMASTER_URL`.

## Plan for M1 → M5 (unchanged scope, adjusted by the above)

- **M1 (branch `m1-contracts`):**
  - pnpm workspace scaffold (Node 24, pinned versions);
  - `packages/contracts` with submodule `lib/liquidity-launcher` @ `1c59049`, compiled with its own `foundry.toml` settings;
  - `script/DeployLaunchpad.s.sol` (CREATE2 via `0x4e59…`, deterministic): `UERC20Factory` (if §3-A) → `BeneficiaryVault` → `FeeSplitter` → `InstantLaunchStrategy` → `UniversalRouterStrategy`;
  - fork tests listed in the prompt, plus §1 (fee update) and §9 (protocol fee) gating tests;
  - dry run against a Base fork, then I hand you the broadcast and verify commands.
- **M2:**
  - `packages/sdk` (viem, bigint-only, builders with suffix + tests);
  - `apps/indexer` (Ponder: `TokenLaunched`, PoolManager `Swap` filtered by our pool ids, `FeesCollected` / `FeesForwarded`, vault `Claimed`, beneficiary NFT `Transfer`).
- **M3:** web app per the UX and design spec.
- **M4:** ship.
- **M5:** launch kit.
