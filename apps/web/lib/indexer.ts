import type { Address, Hex } from "viem";

/** Shapes returned by apps/indexer (bigints arrive as decimal strings). */
export type TokenListItem = {
  address: Address;
  name: string;
  symbol: string;
  image: string;
  creator: Address;
  launchedAt: number;
  priceWei: string;
  marketCapWei: string;
  change1hBps: string;
  volumeWei: string;
  creatorFeesWei: string;
  volume1hWei?: string;
};

export type TokenDetail = TokenListItem & {
  poolId: Hex;
  positionId: string;
  description: string;
  website: string;
  extraData: Hex;
  launchTx: Hex;
  launchBlock: string;
  tradeCount: number;
  creatorFeesToken: string;
  beneficiary: Address;
};

export type Trade = {
  id: string;
  token: Address;
  trader: Address;
  side: "buy" | "sell";
  ethWei: string;
  tokenAmount: string;
  priceWei: string;
  timestamp: number;
  txHash: Hex;
};

export type Candle = {
  bucket: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volumeWei: string;
  trades: number;
};

export type Holder = { account: Address; balance: string; isPool: boolean };

export type Creator = {
  created: TokenListItem[];
  positions: string[];
  claims: {
    positionId: string;
    token: Address;
    nativeWei: string;
    tokenAmount: string;
    timestamp: number;
    txHash: Hex;
  }[];
  holdings: (TokenListItem & { balance: string })[];
};

export type TickerEvent = {
  kind: "launch" | "buy" | "sell";
  token: Address;
  symbol: string;
  ethWei?: string;
  timestamp: number;
};

export type Stats = {
  uniqueUsers: number;
  dau: number;
  wau: number;
  volumeWei: string;
  volume30dWei: string;
  launches: number;
  creatorsClaimed: number;
  ethPaidToCreatorsWei: string;
};

/**
 * Fetch from the indexer. On the server it calls INDEXER_URL directly; in the browser it goes through
 * the /api/indexer proxy so the indexer URL can stay private. Returns null when the indexer is down,
 * so pages can hide data instead of showing anything made up.
 */
export async function indexer<T>(path: string, init?: { revalidate?: number }): Promise<T | null> {
  const isServer = typeof window === "undefined";
  const base = isServer ? process.env.INDEXER_URL : "/api/indexer";
  if (!base) return null;
  try {
    const res = await fetch(
      `${base}${path}`,
      isServer ? { next: { revalidate: init?.revalidate ?? 5 } } : {},
    );
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
