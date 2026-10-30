/**
 * Indexer vs chain, on the local Base fork:
 *   1. bash packages/contracts/script/local-fork.sh            (anvil + our contracts)
 *   2. pnpm --filter @launchpad/sdk test:fork                   (real launches, trades, claims)
 *   3. LAUNCHPAD_DEPLOYMENT=../../packages/contracts/deployments/local.json \
 *      PONDER_RPC_URL_8453=http://127.0.0.1:8545 \
 *      pnpm --filter @launchpad/indexer start --schema local --port 42069
 *   4. pnpm --filter @launchpad/indexer test:fork
 * Env: INDEXER_URL (default http://127.0.0.1:42069), FORK_RPC_URL (default from deployments/local.json).
 */
import { readFileSync } from "node:fs";
import { TOTAL_SUPPLY, uerc20Abi } from "@launchpad/sdk";
import type { Address } from "viem";
import { createPublicClient, getAddress, http } from "viem";
import { base } from "viem/chains";
import { describe, expect, it } from "vitest";

const local = JSON.parse(
  readFileSync(new URL("../../../packages/contracts/deployments/local.json", import.meta.url), "utf8"),
) as { rpcUrl: string };
const api = process.env.INDEXER_URL ?? "http://127.0.0.1:42069";
const client = createPublicClient({ chain: base, transport: http(process.env.FORK_RPC_URL ?? local.rpcUrl) });

const get = async <T>(path: string): Promise<T> => {
  const res = await fetch(`${api}${path}`);
  expect(res.ok).toBe(true);
  return (await res.json()) as T;
};

type TokenItem = { address: Address; volumeWei: string; creatorFeesWei: string };

describe("indexer matches the chain", async () => {
  const { items: tokens } = await get<{ items: TokenItem[] }>("/tokens?tab=new&limit=100");

  it("has indexed at least one launch", () => {
    expect(tokens.length).toBeGreaterThan(0);
  });

  for (const t of tokens) {
    describe(t.address, () => {
      it("holder balances equal on-chain balanceOf and sum to the fixed supply", async () => {
        const { items } = await get<{ items: { account: Address; balance: string }[] }>(
          `/tokens/${t.address}/holders`,
        );
        let sum = 0n;
        for (const h of items) {
          const onchain = await client.readContract({
            address: getAddress(t.address),
            abi: uerc20Abi,
            functionName: "balanceOf",
            args: [getAddress(h.account)],
          });
          expect(BigInt(h.balance)).toBe(onchain);
          sum += onchain;
        }
        // Top 20 covers every holder on a fresh fork; on mainnet this is a lower bound.
        if (items.length < 20) expect(sum).toBe(TOTAL_SUPPLY);
      });

      it("volume equals the sum of its trades (real swaps only)", async () => {
        const { items } = await get<{ items: { ethWei: string }[] }>(`/tokens/${t.address}/trades?limit=100`);
        const total = items.reduce((s, x) => s + BigInt(x.ethWei), 0n);
        if (items.length < 100) expect(total).toBe(BigInt(t.volumeWei));
      });
    });
  }

  it("stats are consistent with the token list", async () => {
    const stats = await get<{ launches: number; volumeWei: string }>("/stats");
    expect(stats.launches).toBe(tokens.length);
    expect(BigInt(stats.volumeWei)).toBe(tokens.reduce((s, x) => s + BigInt(x.volumeWei), 0n));
  });
});
