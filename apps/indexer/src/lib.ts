import { BPS, CREATOR_BPS, poolManagerAbi, uerc20FactoryAbi } from "@launchpad/sdk";
import type { Address, Hex, Log } from "viem";
import { decodeEventLog, erc721Abi, getAddress, isAddressEqual, zeroAddress } from "viem";

const Q192 = 1n << 192n;
const ONE_TOKEN = 10n ** 18n;

/** Wei per 1 whole token from a v4 sqrtPriceX96 (currency0 = ETH, currency1 = token, both 18 decimals). */
export function priceWeiFromSqrt(sqrtPriceX96: bigint): bigint {
  if (sqrtPriceX96 === 0n) return 0n;
  return (Q192 * ONE_TOKEN) / (sqrtPriceX96 * sqrtPriceX96);
}

/** Creator share of a FeeSplitter distribution, using the contract's floor division. */
export const creatorShare = (amount: bigint) => (amount * CREATOR_BPS) / BPS;
export const platformShare = (amount: bigint) => (amount * (BPS - CREATOR_BPS)) / BPS;

export const CANDLE_INTERVALS = [60, 300, 3600, 86400] as const;
export const bucketOf = (timestamp: number, interval: number) => timestamp - (timestamp % interval);
export const dayOf = (timestamp: number) => Math.floor(timestamp / 86400);

type ReceiptLog = Pick<Log, "address" | "data" | "topics" | "logIndex">;

export type LaunchDetails = {
  creator: Address;
  positionId: bigint;
  metadata: { description: string; website: string; image: string; extraData: Hex };
};

/**
 * From a launch receipt: the factory's TokenCreated (metadata) and the vault's beneficiary NFT mint
 * (creator = fee beneficiary, id = launch position id). Using the mint, not tx.from, keeps the creator
 * correct for smart wallets whose tx.from is a bundler.
 */
export function parseLaunchReceipt(
  logs: readonly ReceiptLog[],
  p: { token: Address; tokenFactory: Address; beneficiaryVault: Address },
): LaunchDetails {
  let metadata: LaunchDetails["metadata"] | undefined;
  let mint: { to: Address; id: bigint } | undefined;
  for (const log of logs) {
    if (isAddressEqual(log.address, p.tokenFactory)) {
      try {
        const ev = decodeEventLog({ abi: uerc20FactoryAbi, data: log.data, topics: log.topics as never });
        if (ev.eventName === "TokenCreated" && isAddressEqual(ev.args.tokenAddress, p.token)) {
          metadata = { ...ev.args.metadata };
        }
      } catch {}
    } else if (isAddressEqual(log.address, p.beneficiaryVault)) {
      try {
        const ev = decodeEventLog({ abi: erc721Abi, data: log.data, topics: log.topics as never });
        if (ev.eventName === "Transfer" && isAddressEqual(ev.args.from, zeroAddress)) {
          mint = { to: getAddress(ev.args.to), id: ev.args.tokenId };
        }
      } catch {}
    }
  }
  if (!metadata) throw new Error(`launch receipt has no TokenCreated for ${p.token}`);
  if (!mint) throw new Error(`launch receipt has no beneficiary mint for ${p.token}`);
  return { creator: mint.to, positionId: mint.id, metadata };
}

export type ParsedSwap = {
  logIndex: number;
  side: "buy" | "sell";
  ethWei: bigint;
  tokenAmount: bigint;
  sqrtPriceX96: bigint;
  trader: Address;
};

/**
 * Swaps on our pool in one receipt. v4 Swap amounts are the swapper's deltas: on a buy the swapper pays
 * ETH (amount0 < 0) and receives tokens (amount1 > 0). The trader is the counterparty of the first token
 * transfer touching the PoolManager after the swap: the recipient on buys, the payer on sells. This is the
 * smart account for smart wallets, not the bundler.
 */
export function parseSwaps(
  logs: readonly ReceiptLog[],
  p: { token: Address; poolId: Hex; poolManager: Address },
): ParsedSwap[] {
  const swaps: ParsedSwap[] = [];
  const sorted = [...logs].sort((a, b) => Number(a.logIndex) - Number(b.logIndex));
  for (const [i, log] of sorted.entries()) {
    if (
      !isAddressEqual(log.address, p.poolManager) ||
      log.topics[1]?.toLowerCase() !== p.poolId.toLowerCase()
    ) {
      continue;
    }
    let ev: ReturnType<typeof decodeSwap>;
    try {
      ev = decodeSwap(log);
    } catch {
      continue;
    }
    const buy = ev.amount0 < 0n;
    const transfer = sorted.slice(i + 1).find((l) => {
      if (!isAddressEqual(l.address, p.token)) return false;
      const t = decodeTransfer(l);
      return (
        t !== undefined && (buy ? isAddressEqual(t.from, p.poolManager) : isAddressEqual(t.to, p.poolManager))
      );
    });
    const t = transfer ? decodeTransfer(transfer) : undefined;
    if (!t) continue;
    swaps.push({
      logIndex: Number(log.logIndex),
      side: buy ? "buy" : "sell",
      ethWei: abs(ev.amount0),
      tokenAmount: abs(ev.amount1),
      sqrtPriceX96: ev.sqrtPriceX96,
      trader: getAddress(buy ? t.to : t.from),
    });
  }
  return swaps;
}

const decodeSwap = (log: ReceiptLog) => {
  const ev = decodeEventLog({ abi: poolManagerAbi, data: log.data, topics: log.topics as never });
  if (ev.eventName !== "Swap") throw new Error("not a swap");
  return ev.args;
};

function decodeTransfer(log: ReceiptLog): { from: Address; to: Address; value: bigint } | undefined {
  try {
    const ev = decodeEventLog({ abi: transferAbi, data: log.data, topics: log.topics as never });
    return ev.eventName === "Transfer"
      ? { from: ev.args.from, to: ev.args.to, value: ev.args.value }
      : undefined;
  } catch {
    return undefined;
  }
}

const transferAbi = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;

const abs = (x: bigint) => (x < 0n ? -x : x);
