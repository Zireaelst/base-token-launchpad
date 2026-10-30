# Master Prompt — Base Token Launchpad MVP (Build & Ship)

> **Kullanım:** `Zireaelst/base-token-launchpad` repo'sunu klonla ve içinde `claude` başlat. Önce aşağıdaki "0. Kurulum" komutlarını terminalde kendin çalıştır. Sonra `---` çizgisinin altındaki her şeyi Claude Code'a tek mesaj olarak yapıştır. Claude Code ilk olarak plan çıkarır, onayından sonra milestone milestone ilerler. Mainnet deploy ve para hareketi gerektiren adımlarda durur ve sana sorar.

## 0. Kurulum (sen çalıştır)

```bash
git clone https://github.com/Zireaelst/base-token-launchpad && cd base-token-launchpad
```

```bash
npx skills add base/skills --skill build-on-base
```

```bash
claude mcp add --transport http base-docs https://docs.base.org/mcp
```

```bash
curl -L https://foundry.paradigm.xyz | bash && foundryup
```

```bash
cast wallet import deployer --interactive
```

Opsiyonel: Vercel'e deploy için Vercel plugin'i ve `npm i -g vercel@latest`.

---

# MISSION

You are the lead engineer shipping the MVP of a **token launchpad on Base mainnet** in this repository (`Zireaelst/base-token-launchpad`, currently empty except README). Goal: a live, simple, pump.fun/PONS-style launchpad that people actually use, so we can apply to the **Base Builder Grant** with a real contract address, live URL, Loom demo and real usage numbers.

Product docs (read them first, they are the source of truth for scope):
- Roadmap v3: https://github.com/Zireaelst/Codex-Claude-Research/blob/main/base-project-roadmaps/2026-10-30/01-launchpad-rakip-analizi-ve-roadmap.md
- Grant draft: https://github.com/Zireaelst/Codex-Claude-Research/blob/main/base-project-roadmaps/2026-10-30/02-base-grant-basvuru-taslagi.md

This prompt covers roadmap **phase F1 (live MVP)** and the contract-free parts of **F2**. The custom v4 hook (F3) is OUT OF SCOPE.

# TOOLS YOU MUST USE

- **Skill `build-on-base`** (installed in `.claude/skills` or `.agents/skills`): load it before touching network config, deployments, BaseScan verification or Builder Codes. Follow its guardrails exactly.
- **MCP `base-docs`** (`https://docs.base.org/mcp`): use it for Base network facts, Builder Codes / ERC-8021, Base App standard-web-app requirements and base.dev metadata. Also `https://docs.base.org/llms.txt`.
- **Uniswap Liquidity Launcher source**: https://github.com/Uniswap/liquidity-launcher (README deployment tables, `docs/TechnicalReference.md`, `src/periphery/README.md`). Read addresses and ABIs from there. Never type addresses from memory.
- Use `gh` for GitHub work. Use your built-in browser to visually check the frontend.

If a tool or doc contradicts this prompt on a factual point (an address, an API, a fee constant), the source wins. Note the discrepancy in `docs/decisions.md`.

# NON-NEGOTIABLE RULES

1. **No changes to audited contract code.** We deploy our own instances of Uniswap Liquidity Launcher contracts from the exact audited commit (v3.3.0, commit `1c5904912aefceaceb89c24528cd5e25d0b61597`. Verify this commit against the README table). Only constructor parameters differ. Any custom Solidity we write is limited to deploy scripts and tests.
2. **Token creation and distribution happen in one `LiquidityLauncher.multicall`** (`createToken(recipient=launcher)` + `distributeToken`). Tokens left in the launcher between transactions can be stolen, so add a test proving our frontend never splits them.
3. **Every transaction the app sends carries our Builder Code** (ERC-8021 data suffix via `ox/erc8021`, wired through wagmi/viem). Per the skill: missing attribution fails silently. Add a test that asserts the suffix on built calldata.
4. **No private keys in the repo, env files, logs or chat.** Deploys use the Foundry keystore `deployer` (`--account deployer`). **You prepare the mainnet broadcast command; the human runs it.** Never run `--broadcast` against mainnet yourself.
5. **No fake data.** No seeded fake tokens, volumes or user counts in production. Empty states must look good instead. Stats on the landing page come from the indexer or are hidden.
6. **Simplicity budget (UX).** Our UX must stay as simple as pump.fun / PONS (see UX section). Any feature that adds a step to "create token" or "buy" needs an explicit justification in `docs/decisions.md`. If unsure, leave it out.
7. Pin every dependency version (no `latest` in lockfiles or CI). Use Node 24 LTS and pnpm.
8. Small, reviewable commits on a feature branch per milestone, then a PR to `main`. Conventional commit messages.

# PRODUCT (MVP SCOPE)

**What it is:** "The cheapest and most creator-friendly way to launch a token on Base." Instant launch into a Uniswap v4 pool with permanently locked liquidity. The creator earns **60% of all trading fees in ETH**; the platform earns 40%. There is no platform token.

**Contract facts (verify in source):**
- `InstantLaunchStrategy`: fixed 1,000,000,000 supply (18 decimals). Native ETH / token v4 pool with no hook. **LP fee 0.25%** (`LP_FEE = 2_500`), tick spacing from source. Single-sided position, LP NFT locked forever in `FeeSplitter`.
- `FeeSplitter`: splits are constructor parameters. Each side (ETH, token) independently sums to 10,000 bps.
- Creator share is paid through a `BeneficiaryVault` / `UERC20BeneficiaryVault`. The beneficiary is an ERC-721, so it is transferable.
- Token factory: the audited UERC20 factory used by the launcher (address from README).
- Optional creator first buy in the same flow: evaluate `UniversalRouterStrategy` or a follow-up Universal Router swap. Choose the one with fewer signatures and document why.

**Our deployment (packages/contracts):**
- Git submodule `lib/liquidity-launcher` pinned at the audited commit.
- Foundry script `script/DeployLaunchpad.s.sol` deploys **our** `FeeSplitter` (splits: ETH side 6000 → beneficiary vault, 4000 → platform treasury; token side: same 60/40 unless the source/docs suggest a safer default, which you document) + vault + `InstantLaunchStrategy` (initial tick / liquidity immutables copied exactly from Uniswap's own Base deployment parameters, read from the README table and their deploy scripts). It reuses Uniswap's deployed `LiquidityLauncher`, PoolManager, PositionManager and token factory on Base. Confirm in source that the launcher accepts any strategy address. If it does not, stop and report.
- The platform treasury is a Safe address supplied via env (`PLATFORM_TREASURY`). Never an EOA we control in code.
- **Fork tests** (`forge test --fork-url $BASE_RPC_URL`), no Sepolia:
  - Full launch through our instance via one multicall. Assert the pool exists, the LP NFT is owned by the FeeSplitter, and supply is correct.
  - Swaps generate fees; `collectFees` → creator gets 60% of ETH fees, treasury 40%; beneficiary claim works; beneficiary NFT transfer moves future fees.
  - A split launch (create in one tx, distribute in another) is shown to be stealable. Our TS client never builds that shape (unit test in `packages/sdk`).
  - Duplicate pool key reverts. Wrong supply reverts.
- Write `docs/deployment.md`: exact command, constructor args, expected addresses, verification steps (BaseScan verify via the skill), and a post-deploy checklist that re-reads every immutable on-chain and compares it with the config.

# ARCHITECTURE

```
apps/web          Next.js (App Router, TS, React Server Components), wagmi + viem, Tailwind
apps/indexer      Ponder: indexes TokenLaunched, v4 Swap events for our pools, FeeSplitter/vault claims
packages/contracts Foundry: submodule + deploy script + fork tests
packages/sdk      typed ABIs, addresses per chain, launch/trade/claim calldata builders, Builder Code suffix, bigint-only amounts
packages/ui       design system (tokens, ASCII/pixel components)
docs/             decisions.md, deployment.md, runbook.md, grant-metrics.md
```

- **Trading:** Uniswap v4 via the Universal Router (`@uniswap/v4-sdk`, `@uniswap/universal-router-sdk`). Quotes from the V4 Quoter. Exact-input buys/sells with `minOut` and deadline. Default slippage 5% for new tokens, editable. Amounts are `bigint`/integer strings end to end. No JS float math for money.
- **Data:** Ponder → Postgres (provision through the Vercel Marketplace, e.g. Neon). Read API for: token list (new / trending by 1h volume / top creator earnings), token detail, trades, OHLC built from real swaps only, holders (top 20), creator earnings.
- **Metadata:** token image + description stored in object storage (Vercel Blob), with the hash recorded. Image upload is resized and validated server-side (max 2 MB, png/jpg/webp/gif).
- **Wallets:** wagmi with injected (Base App in-app browser, Coinbase Wallet, MetaMask, Rabby) and Coinbase Smart Wallet. Optional Privy for email login if credits are granted. Keep it behind a flag.
- **Gas sponsorship (flag, default off):** CDP Paymaster for a creator's first launch via Smart Wallet. Build it behind `NEXT_PUBLIC_SPONSOR_FIRST_LAUNCH`.
- **Base App compatibility:** the Base App opens standard web apps in its in-app browser with an injected wallet. Listing comes from base.dev metadata (no Farcaster manifest). Implement the required metadata per `base-docs` MCP and test the flows in a mobile viewport with an injected provider.
- **Env:** `.env.example` with every variable documented. Server-only secrets never prefixed `NEXT_PUBLIC_`. RPC keys stay server-side (proxy reads through API routes).

# UX — "AS SIMPLE AS PUMP.FUN / PONS"

Four screens only. Every screen works one-handed on a 375px phone.

1. **Board (`/`)**: a short hero (see design), then **one list** with three tabs: `New` · `Trending` · `Top earners`. Each row: pixelated token image, `$TICKER`, name, market cap, 1h change, age, creator earnings. Search by name, ticker or address. A live ticker strip shows real events ("$FOO launched 12s ago", "$BAR +4.2 ETH volume"). No filters panel, no sidebar.
2. **Create (`/create`)**: **one page, one button.** Fields: image (drag/drop), name, ticker, description (optional), links (optional, collapsed), first buy in ETH (optional). A live preview card on the right (below on mobile) shows the rules card. The button reads `Launch $TICKER`. Flow: 1 signature → pending state → redirect to the token page with confetti-free success state and a share button. Target: under 30 seconds from landing to live token.
3. **Token (`/t/[address]`)**: chart (OHLC from real trades), **Buy/Sell box** (ETH amount presets 0.01 / 0.05 / 0.1 / max; sell 25/50/100%), **Rules card**, trades feed, top holders, links, share. On mobile the Buy/Sell is a sticky bottom bar opening a sheet.
4. **Profile (`/u/[address]`)**: tokens created, **claimable ETH and one `Claim all` button**, holdings, history.

**Rules card** (our differentiator, on token page, create preview and the OG share image):
```
SUPPLY      1,000,000,000 (fixed, no mint)
LIQUIDITY   locked forever (Uniswap v4)
TRADE FEE   0.25%  →  creator 60% · platform 40%
CONTRACTS   audited (Uniswap Liquidity Launcher) ↗
CREATOR     0xabc…123  ·  launched 3h ago
```
Written in plain words, with links to BaseScan for every claim.

**Transaction states** (shared component): `quote` → `confirm in wallet` → `submitted` → `confirmed` → `indexed`. Rejected, reverted, wrong network and insufficient funds each get a clear one-line message. A rejected signature keeps the form data.

**Explicitly NOT in MVP:** bonding curve, custom fees, hooks or rule modules, holder rewards, comments/chat, livestreams, referral contracts, leaderboards with prizes, multi-chain, platform token, airdrops.

**Trust & safety:** duplicate-ticker warning, image moderation hook (pluggable, simple blocklist first), report button, hide flagged tokens from the board (they stay accessible by URL with a warning banner). No promises of returns anywhere in copy.

# DESIGN — ASCII / GEIST PIXEL

Mood: a monochrome LED / terminal wall. Calm and editorial, with crypto energy coming from motion, not colour. References: a pixel-type "AI agent" landing page with a scanline-halftone mascot and a speech bubble, and a dot-matrix canvas hero whose images are drawn live as quantised LED halftone dots. **Use the techniques, not the assets.**

**Type**
- Display/headlines and tickers: **Geist Pixel** (npm `geist`, import from `geist/font/pixel`; use the Square variant for headings, Grid or Line for accents). If `next/font/google` `Geist_Pixel` is stable in our Next version, either is fine; keep the `ELSH` axis.
- UI and numbers: **Geist Mono** with tabular numerals. Body copy: Geist Sans.
- The Geist family is OFL-1.1, so it is safe to ship.

**Colour tokens** (light default, dark supported, both WCAG AA)
```
--bg #f2f2ef  --ink #0d0d0d  --mute #8a8a86  --line #d9d9d4
--buy #0052ff (Base blue, also focus ring)  --sell #e5484d
dark: --bg #0b0b0b --ink #ededea --mute #7a7a76 --line #222
```
Colour appears only on buy/sell, price change and focus. Everything else is ink on paper.

**Signature visuals**
- **Hero canvas:** a mascot (our own asset, generated or drawn. Never hotlink third-party images) rendered every frame as **horizontal scanline rows of quantised dots** (luminance → 5 dot sizes; row pitch ≈ 2× column pitch). Slow drift, breathing scale, occasional **row-glitch** (a random row shifts a few columns for a beat) and a **dot-by-dot dissolve** into a second pose. A pixel speech bubble shows **real** latest events from the indexer ("3 tokens launched in the last minute"). Hide the bubble when there is no data.
- **Headline:** big Geist Pixel, e.g. `LAUNCH / ON BASE`, then one mono subline: "Fixed supply. Locked liquidity. Creators earn 60% of fees, in ETH." CTAs: black square button `Launch a token` + text link `Explore tokens ›`. A stats row (real data only) in mono, separated by `·`.
- **Token images** in lists are shown through a small dithered/halftone filter (canvas or CSS), so the board looks uniform and on-brand. The token page shows the original image.
- **ASCII details:** box-drawing borders for the rules card, `[ BUY ]` / `[ SELL ]` style tabs, blinking block cursor on inputs, a loading state that "types" dots. Use them sparingly; readability first.
- **Performance and accessibility:** canvas at max 2× DPR, paused when off-screen or tab hidden, static frame under `prefers-reduced-motion`. The hero must not delay LCP: render the headline first and lazy-start the canvas. Touch targets ≥ 44px. Visible keyboard focus everywhere.

# METRICS & GRANT READINESS

- `docs/grant-metrics.md` plus a Dune dashboard spec (SQL queries) for: all-time unique users, DAU, WAU, all-time volume, last-30-day volume, launches, creators who claimed, ETH paid to creators. Team/test wallets go in an exclusion list.
- Vercel Analytics plus a small event log for the funnel: landing → create started → launch signed → first trade.
- `/stats` public page showing the same real numbers.

# MILESTONES (stop and report after each, with evidence)

**M0 — Plan (no code).** Read the roadmap docs, the `build-on-base` skill and the Liquidity Launcher source. Output: `docs/decisions.md` with every open question answered or flagged (the launcher accepts a custom strategy? exact constructor args? token-side split? first-buy mechanism?). Show me the plan and wait for approval.

**M1 — Contracts.** Monorepo scaffold, submodule, deploy script, fork tests green. Evidence: `forge test` output and a dry-run (`forge script` without `--broadcast`) against a Base fork showing the addresses that would be deployed. **Stop:** hand me the exact mainnet broadcast + verify commands. I run them and paste the addresses back.

**M2 — SDK + indexer.** Calldata builders (launch multicall, buy, sell, claim) with Builder Code suffix and unit tests. Ponder indexing our strategy's `TokenLaunched` + pool swaps, tested against a fork or against our first mainnet launch.

**M3 — Web app.** The four screens, tx states, rules card, design system, hero canvas. Evidence: screenshots at 375px and 1440px, light and dark; Lighthouse ≥ 90 performance and accessibility on `/`; Playwright e2e on an anvil Base fork: create → buy → sell → claim.

**M4 — Ship.** Deploy to Vercel (production env vars, Postgres, Blob), domain, OG images (rules card), base.dev app registration metadata, Builder Code verified on a real mainnet transaction (decode the calldata suffix and show it). **Stop** before anything that spends real funds beyond the test launch, and ask me.

**M5 — Launch kit.** `docs/runbook.md` (incidents, RPC failover, indexer re-sync), Loom demo script (2–3 min: launch → buy → creator claim), X/Telegram announcement copy, and a first-launch checklist for 10 pilot creators.

# DEFINITION OF DONE

- A stranger on a phone inside the Base App browser can launch a token in < 30 s with one signature, buy and sell it, and the creator can claim ETH fees with one click.
- Our contracts are verified on BaseScan, and every immutable matches `docs/deployment.md`.
- Every app transaction carries our Builder Code.
- No fake data anywhere. Metrics page and Dune queries return real numbers.
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` pass in CI. Fork tests pass.
- README explains setup, architecture, and how to run everything locally in < 10 minutes.

When something is ambiguous, prefer the simpler option, write it in `docs/decisions.md`, and keep going. Ask me only for: keys and funds, mainnet broadcasts, brand name and domain, base.dev account actions, and anything that changes fees or the creator/platform split.
