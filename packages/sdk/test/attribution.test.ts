import { decodeFunctionData, parseEther } from "viem";
import { describe, expect, it } from "vitest";
import {
  type AttributedTx,
  beneficiaryVaultAbi,
  createAttribution,
  feeSplitterAbi,
  liquidityLauncherAbi,
  permit2Abi,
  prepareBuy,
  prepareClaimAllBatch,
  prepareClaimAllSequential,
  prepareLaunch,
  preparePermit2Approval,
  prepareSell,
  readBuilderCodes,
  stripAttribution,
  universalRouterAbi,
} from "../src/index.ts";
import { attribution, creator, ctx, deadline, metadata } from "./fixtures.ts";

const token = "0x1111111111111111111111111111111111111111" as const;

/** Every transaction builder the SDK exposes, with the ABI its calldata must decode against. */
const builders: Record<string, { tx: AttributedTx; abi: readonly unknown[] }> = {
  launch: {
    tx: prepareLaunch(ctx, { creator, name: "Foo", symbol: "FOO", metadata, deadline }, attribution).tx,
    abi: liquidityLauncherAbi,
  },
  launchWithFirstBuy: {
    tx: prepareLaunch(
      ctx,
      { creator, name: "Foo", symbol: "FOO", metadata, deadline, firstBuyWei: parseEther("0.1") },
      attribution,
    ).tx,
    abi: liquidityLauncherAbi,
  },
  buy: {
    tx: prepareBuy(ctx, { token, amountInWei: parseEther("0.05"), minOut: 1n, deadline }, attribution),
    abi: universalRouterAbi,
  },
  sell: {
    tx: prepareSell(ctx, { token, amountIn: 10n ** 18n, minOutWei: 1n, deadline }, attribution),
    abi: universalRouterAbi,
  },
  permit2Approval: {
    tx: preparePermit2Approval(ctx, { token, nowSeconds: 1_800_000_000n }, attribution),
    abi: permit2Abi,
  },
  ...Object.fromEntries(
    prepareClaimAllSequential(ctx, [7n, 8n], attribution).map((tx, i) => [
      `claimSequential${i}`,
      { tx, abi: i === 0 ? feeSplitterAbi : beneficiaryVaultAbi },
    ]),
  ),
};

describe("Builder Code attribution (rule 3)", () => {
  it("rejects malformed codes", () => {
    for (const bad of ["", "has space", "a,b", "x".repeat(33)])
      expect(() => createAttribution(bad)).toThrow();
  });

  for (const [name, { tx, abi }] of Object.entries(builders)) {
    it(`${name}: calldata ends with our ERC-8021 suffix and still decodes`, () => {
      expect(tx.data.endsWith(attribution.suffix.slice(2))).toBe(true);
      expect(readBuilderCodes(tx.data)).toEqual(["bc_test"]);
      // The original ABI call is intact in front of the suffix.
      expect(() =>
        decodeFunctionData({ abi: abi as never, data: stripAttribution(tx.data, attribution) }),
      ).not.toThrow();
    });
  }

  it("claim-all batch: every call is attributed and the userOp suffix is in capabilities", () => {
    const batch = prepareClaimAllBatch(ctx, [7n, 8n], attribution);
    expect(batch.calls).toHaveLength(3);
    for (const c of batch.calls) expect(readBuilderCodes(c.data)).toEqual(["bc_test"]);
    expect(batch.capabilities.dataSuffix).toEqual({ value: attribution.suffix, optional: true });
  });

  it("suffix is appended exactly once", () => {
    const { tx } = prepareLaunch(
      ctx,
      { creator, name: "Foo", symbol: "FOO", metadata, deadline },
      attribution,
    );
    const once = stripAttribution(tx.data, attribution);
    expect(readBuilderCodes(once)).toBeUndefined();
  });
});
