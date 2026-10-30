import { decodeFunctionData, encodeAbiParameters, encodeFunctionData, parseEther, zeroHash } from "viem";
import { describe, expect, it } from "vitest";
import * as sdk from "../src/index.ts";
import {
  applySlippage,
  assertAtomicLaunch,
  liquidityLauncherAbi,
  prepareLaunch,
  stripAttribution,
  TOTAL_SUPPLY,
} from "../src/index.ts";
import { attribution, creator, ctx, deadline, metadata } from "./fixtures.ts";

const launcher = ctx.external.liquidityLauncher;
const meta = encodeAbiParameters(
  [
    {
      type: "tuple",
      components: [{ type: "string" }, { type: "string" }, { type: "string" }, { type: "bytes" }],
    },
  ],
  [["", "", "", "0x"]],
);

function inner(data: `0x${string}`) {
  const outer = decodeFunctionData({ abi: liquidityLauncherAbi, data: stripAttribution(data, attribution) });
  expect(outer.functionName).toBe("multicall");
  return (outer.args[0] as readonly `0x${string}`[]).map((d) =>
    decodeFunctionData({ abi: liquidityLauncherAbi, data: d }),
  );
}

const createToken = (recipient = launcher, name = "Foo") =>
  encodeFunctionData({
    abi: liquidityLauncherAbi,
    functionName: "createToken",
    args: [ctx.deployment.tokenFactory, name, "FOO", 18, TOTAL_SUPPLY, recipient, meta],
  });

const distributeToken = (token: `0x${string}`) =>
  encodeFunctionData({
    abi: liquidityLauncherAbi,
    functionName: "distributeToken",
    args: [
      token,
      {
        strategy: ctx.deployment.instantLaunchStrategy,
        amount: TOTAL_SUPPLY,
        configData: encodeAbiParameters([{ type: "address" }], [creator]),
      },
      zeroHash,
    ],
  });

const multicall = (calls: `0x${string}`[]) =>
  encodeFunctionData({ abi: liquidityLauncherAbi, functionName: "multicall", args: [calls] });

describe("launch calldata (rule 2: create + distribute in one multicall)", () => {
  it("builds exactly one multicall: createToken(recipient = launcher) then distributeToken", () => {
    const { tx, token } = prepareLaunch(
      ctx,
      { creator, name: "Foo", symbol: "FOO", metadata, deadline },
      attribution,
    );
    expect(tx.to).toBe(launcher);
    expect(tx.value).toBe(0n);
    const calls = inner(tx.data);
    expect(calls.map((c) => c.functionName)).toEqual(["createToken", "distributeToken"]);
    const [create, distribute] = calls;
    if (create?.functionName !== "createToken" || distribute?.functionName !== "distributeToken")
      throw new Error();
    expect(create.args[5]).toBe(launcher);
    expect(create.args[4]).toBe(TOTAL_SUPPLY);
    expect(distribute.args[0]).toBe(token);
    expect(distribute.args[1].strategy).toBe(ctx.deployment.instantLaunchStrategy);
    expect(distribute.args[1].amount).toBe(TOTAL_SUPPLY);
  });

  it("first buy rides in the same multicall and carries the ETH", () => {
    const firstBuyWei = parseEther("0.1");
    const { tx } = prepareLaunch(
      ctx,
      { creator, name: "Foo", symbol: "FOO", metadata, deadline, firstBuyWei },
      attribution,
    );
    expect(tx.value).toBe(firstBuyWei);
    expect(inner(tx.data).map((c) => c.functionName)).toEqual([
      "createToken",
      "distributeToken",
      "distributeWithNative",
    ]);
  });

  it("the SDK exports no way to build a create or distribute on its own", () => {
    const exported = Object.keys(sdk);
    expect(exported.filter((k) => /create(Token)?Call|distribute/i.test(k))).toEqual([]);
    expect(exported).toContain("prepareLaunch");
  });

  describe("guard rejects every split shape", () => {
    const token = sdk.predictTokenAddress(ctx, { creator, name: "Foo", symbol: "FOO" });
    const cases: Record<string, `0x${string}`> = {
      "bare createToken": createToken(),
      "bare distributeToken": distributeToken(token),
      "multicall with createToken only": multicall([createToken()]),
      "createToken to a non-launcher recipient": multicall([createToken(creator), distributeToken(token)]),
      "distributes a different token": multicall([createToken(launcher, "Other"), distributeToken(token)]),
      "two tokens in one tx": multicall([
        createToken(),
        distributeToken(token),
        createToken(launcher, "Bar"),
      ]),
    };
    for (const [name, data] of Object.entries(cases)) {
      it(name, () =>
        expect(() => assertAtomicLaunch(ctx, { to: launcher, data }, creator)).toThrow(/unsafe launch/),
      );
    }
    it("accepts the safe shape", () => {
      expect(() =>
        assertAtomicLaunch(
          ctx,
          { to: launcher, data: multicall([createToken(), distributeToken(token)]) },
          creator,
        ),
      ).not.toThrow();
    });
  });

  it("validates name and ticker", () => {
    const bad = [
      { name: "", symbol: "FOO" },
      { name: " Foo", symbol: "FOO" },
      { name: "Foo", symbol: "foo" },
      { name: "Foo", symbol: "TOOLONGTICKER" },
    ];
    for (const b of bad)
      expect(() => prepareLaunch(ctx, { creator, metadata, deadline, ...b }, attribution)).toThrow();
  });
});

describe("amounts are integer math", () => {
  it("applySlippage rounds down and rejects out-of-range bps", () => {
    expect(applySlippage(1_000n, 500n)).toBe(950n);
    expect(applySlippage(999n, 500n)).toBe(949n);
    expect(applySlippage(10n ** 30n, 0n)).toBe(10n ** 30n);
    expect(() => applySlippage(1n, 10_000n)).toThrow();
    expect(() => applySlippage(1n, -1n)).toThrow();
  });
});
