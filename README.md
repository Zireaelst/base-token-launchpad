# base-token-launchpad

The cheapest and most creator-friendly way to launch a token on Base. A launch is one signature: it creates a fixed-supply token and puts it into a Uniswap v4 pool. The liquidity is locked forever. Creators earn 60% of the LP fees, in ETH and the token.

Contracts are **unmodified audited Uniswap Liquidity Launcher code**, deployed as our own instances. Only the constructor parameters are ours. See [`docs/decisions.md`](docs/decisions.md) for every decision and [`docs/deployment.md`](docs/deployment.md) for the deploy runbook.

## Layout

```
apps/web            Next.js app (M3)
apps/indexer        Ponder indexer (M2)
packages/contracts  Foundry: pinned submodules, deploy script, Base fork tests
packages/sdk        typed ABIs, addresses, calldata builders with Builder Code (M2)
packages/ui         design system (M3)
docs/               decisions, deployment, backlog, runbook, grant metrics
```

## Prerequisites

- Node 24 LTS (`.nvmrc`) and pnpm (version pinned in `package.json` → `packageManager`)
- Foundry v1.5.1 (`foundryup`)
- A Base mainnet RPC URL for fork tests

## Contracts in 5 minutes

```bash
git clone https://github.com/Zireaelst/base-token-launchpad && cd base-token-launchpad
# liquidity-launcher declares one nested submodule over SSH; this fetches everything over HTTPS
git -c url."https://github.com/".insteadOf="git@github.com:" submodule update --init --recursive --depth 1

cd packages/contracts
bash script/build-upstream.sh && forge build   # audited code is built in its own root
export BASE_RPC_URL=https://...                 # any Base mainnet RPC
forge test --fork-url "$BASE_RPC_URL"
```

## SDK and indexer against a local Base fork

```bash
pnpm install
bash packages/contracts/script/local-fork.sh &        # anvil fork of Base + our contracts -> deployments/local.json
pnpm --filter @launchpad/sdk test:fork                 # real attributed launch, buy, sell, claim on the fork

cd apps/indexer
LAUNCHPAD_DEPLOYMENT=../../packages/contracts/deployments/local.json \
PONDER_RPC_URL_8453=http://127.0.0.1:8545 \
pnpm start --schema local                              # API on http://127.0.0.1:42069
pnpm test:fork                                         # indexer vs chain
```

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` runs the offline checks for the whole workspace.

## Web app on a local Base fork

```bash
bash scripts/local-stack.sh                    # fork + contracts + indexer + web on http://localhost:3000
WEB_MODE=prod bash scripts/local-stack.sh      # same with a production build
cd apps/web && npx playwright install chromium && pnpm e2e   # create → buy → sell → claim through the UI
```

The e2e test uses a mock injected wallet that forwards to the fork, and checks that every transaction carries the Builder Code.
Screenshots: `SCREENSHOTS=1 npx playwright test screenshots` writes to `docs/screenshots/m3/`.
