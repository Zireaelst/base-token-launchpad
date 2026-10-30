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
