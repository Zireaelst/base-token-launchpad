import { BASE_EXTERNAL, poolIdFor, poolKeyFor, poolManagerAbi } from "@launchpad/sdk";
import type { Address, Hex } from "viem";
import { encodeAbiParameters, encodeEventTopics, getAddress, pad } from "viem";
import { describe, expect, it } from "vitest";
import { bucketOf, creatorShare, parseSwaps, platformShare, priceWeiFromSqrt } from "../src/lib";

const token = getAddress("0x1111111111111111111111111111111111111111");
const poolId = poolIdFor(poolKeyFor(token));
const pm = BASE_EXTERNAL.poolManager;
const user = getAddress("0x2222222222222222222222222222222222222222");
const router = getAddress("0x3333333333333333333333333333333333333333");
const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const swapLog = (logIndex: number, amount0: bigint, amount1: bigint, sqrtPriceX96: bigint) => ({
  address: pm,
  logIndex,
  topics: encodeEventTopics({
    abi: poolManagerAbi,
    eventName: "Swap",
    args: { id: poolId, sender: router },
  }) as [Hex, ...Hex[]],
  data: encodeAbiParameters(
    [
      { type: "int128" },
      { type: "int128" },
      { type: "uint160" },
      { type: "uint128" },
      { type: "int24" },
      { type: "uint24" },
    ],
    [amount0, amount1, sqrtPriceX96, 1n, 0, 2500],
  ),
});

const transferLog = (logIndex: number, from: Address, to: Address, value: bigint) => ({
  address: token,
  logIndex,
  topics: [transferTopic, pad(from), pad(to)] as [Hex, ...Hex[]],
  data: encodeAbiParameters([{ type: "uint256" }], [value]),
});

describe("prices are integers", () => {
  it("sqrtPrice at tick 0 is 1 ETH per token", () => {
    expect(priceWeiFromSqrt(1n << 96n)).toBe(10n ** 18n);
  });
  it("price falls as tokens per ETH rise", () => {
    expect(priceWeiFromSqrt(2n << 96n)).toBe(10n ** 18n / 4n);
  });
  it("buckets align to the interval", () => {
    expect(bucketOf(3_725, 3600)).toBe(3600);
    expect(bucketOf(59, 60)).toBe(0);
  });
});

describe("fee shares match FeeSplitter floor math", () => {
  it("60/40 with floor", () => {
    expect(creatorShare(2_499_000_000_000_001n)).toBe(1_499_400_000_000_000n);
    expect(platformShare(2_499_000_000_000_001n)).toBe(999_600_000_000_000n);
  });
});

describe("parseSwaps", () => {
  it("buy: user paid ETH, trader is the token recipient", () => {
    const logs = [
      swapLog(3, -(10n ** 17n), 38n * 10n ** 24n, 7n << 96n),
      transferLog(5, pm, user, 38n * 10n ** 24n),
    ];
    expect(parseSwaps(logs, { token, poolId, poolManager: pm })).toEqual([
      {
        logIndex: 3,
        side: "buy",
        ethWei: 10n ** 17n,
        tokenAmount: 38n * 10n ** 24n,
        sqrtPriceX96: 7n << 96n,
        trader: user,
      },
    ]);
  });

  it("sell: trader is the token payer", () => {
    const logs = [
      transferLog(9, user, pm, 10n ** 21n),
      swapLog(8, 5n * 10n ** 15n, -(10n ** 21n), 6n << 96n),
    ];
    const [swap] = parseSwaps(logs, { token, poolId, poolManager: pm });
    expect(swap?.side).toBe("sell");
    expect(swap?.trader).toBe(user);
    expect(swap?.ethWei).toBe(5n * 10n ** 15n);
  });

  it("ignores swaps on other pools", () => {
    const other = poolIdFor(poolKeyFor(getAddress("0x4444444444444444444444444444444444444444")));
    const log = swapLog(1, -1n, 1n, 1n << 96n);
    log.topics[1] = other;
    expect(parseSwaps([log, transferLog(2, pm, user, 1n)], { token, poolId, poolManager: pm })).toEqual([]);
  });
});
