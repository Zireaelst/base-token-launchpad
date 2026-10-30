import { type Context, ponder } from "ponder:registry";
import schema from "ponder:schema";
import { instantLaunchStrategyAbi, uerc20Abi } from "@launchpad/sdk";
import type { Address, Hex } from "viem";
import { getAddress, isAddressEqual, zeroAddress } from "viem";
import { addresses } from "./addresses";
import {
  bucketOf,
  CANDLE_INTERVALS,
  creatorShare,
  dayOf,
  type ParsedSwap,
  parseLaunchReceipt,
  parseSwaps,
  platformShare,
  priceWeiFromSqrt,
} from "./lib";

type Db = Context["db"];

ponder.on("InstantLaunchStrategy:TokenLaunched", async ({ event, context }) => {
  const token = getAddress(event.args.token);
  const receipt = await context.client.getTransactionReceipt({ hash: event.transaction.hash });
  const details = parseLaunchReceipt(receipt.logs, {
    token,
    tokenFactory: addresses.tokenFactory,
    beneficiaryVault: addresses.beneficiaryVault,
  });
  const [name, symbol] = await Promise.all([
    context.client.readContract({ address: token, abi: uerc20Abi, functionName: "name" }),
    context.client.readContract({ address: token, abi: uerc20Abi, functionName: "symbol" }),
  ]);
  // Opening price: the strategy's immutable initial tick (read once, cached by Ponder).
  const sqrtPriceX96 = await context.client.readContract({
    address: addresses.instantLaunchStrategy,
    abi: instantLaunchStrategyAbi,
    functionName: "initialSqrtPriceX96",
  });
  const timestamp = Number(event.block.timestamp);

  await context.db
    .insert(schema.token)
    .values({
      address: token,
      poolId: event.args.poolId,
      positionId: details.positionId,
      name,
      symbol,
      creator: details.creator,
      description: details.metadata.description,
      website: details.metadata.website,
      image: details.metadata.image,
      extraData: details.metadata.extraData,
      launchedAt: timestamp,
      launchBlock: event.block.number,
      launchTx: event.transaction.hash,
      openPriceWei: priceWeiFromSqrt(sqrtPriceX96),
      priceWei: priceWeiFromSqrt(sqrtPriceX96),
      sqrtPriceX96,
      volumeWei: 0n,
      tradeCount: 0,
      creatorFeesWei: 0n,
      creatorFeesToken: 0n,
    })
    .onConflictDoNothing();
  await context.db
    .insert(schema.beneficiary)
    .values({ positionId: details.positionId, owner: details.creator })
    .onConflictDoNothing();
  await touchAccount(context.db, details.creator, timestamp);

  // Trades in the launch tx itself (creator first buy) are picked up by the token's Transfer handler.
});

ponder.on("LaunchedToken:Transfer", async ({ event, context }) => {
  const token = getAddress(event.log.address);
  const { from, to, amount } = event.args;

  // Holder balances (the zero address is mint/burn).
  if (!isAddressEqual(from, zeroAddress)) await addBalance(context.db, token, from, -amount);
  if (!isAddressEqual(to, zeroAddress)) await addBalance(context.db, token, to, amount);

  // Trades: only transfers touching the PoolManager can be swaps on our pool.
  const pm = addresses.poolManager;
  if (!isAddressEqual(from, pm) && !isAddressEqual(to, pm)) return;
  const row = await context.db.find(schema.token, { address: token });
  if (!row) return;
  const receipt = await context.client.getTransactionReceipt({ hash: event.transaction.hash });
  const swaps = parseSwaps(receipt.logs, { token, poolId: row.poolId, poolManager: pm });
  for (const swap of swaps) await recordTrade(context.db, row, swap, event);
});

async function recordTrade(
  db: Db,
  row: typeof schema.token.$inferSelect,
  swap: ParsedSwap,
  event: { block: { number: bigint; timestamp: bigint }; transaction: { hash: Hex } },
) {
  const id = `${event.transaction.hash}:${swap.logIndex}`;
  // Several transfers in one tx can point at the same swap; record it once.
  if (await db.find(schema.trade, { id })) return;

  const timestamp = Number(event.block.timestamp);
  const priceWei = priceWeiFromSqrt(swap.sqrtPriceX96);
  await db.insert(schema.trade).values({
    id,
    token: row.address,
    trader: swap.trader,
    side: swap.side,
    ethWei: swap.ethWei,
    tokenAmount: swap.tokenAmount,
    priceWei,
    timestamp,
    blockNumber: event.block.number,
    txHash: event.transaction.hash,
  });
  await db.update(schema.token, { address: row.address }).set((t) => ({
    priceWei,
    sqrtPriceX96: swap.sqrtPriceX96,
    volumeWei: t.volumeWei + swap.ethWei,
    tradeCount: t.tradeCount + 1,
    lastTradeAt: timestamp,
  }));
  for (const interval of CANDLE_INTERVALS) {
    const bucket = bucketOf(timestamp, interval);
    await db
      .insert(schema.candle)
      .values({
        token: row.address,
        interval,
        bucket,
        open: priceWei,
        high: priceWei,
        low: priceWei,
        close: priceWei,
        volumeWei: swap.ethWei,
        trades: 1,
      })
      .onConflictDoUpdate((c) => ({
        high: priceWei > c.high ? priceWei : c.high,
        low: priceWei < c.low ? priceWei : c.low,
        close: priceWei,
        volumeWei: c.volumeWei + swap.ethWei,
        trades: c.trades + 1,
      }));
  }
  await touchAccount(db, swap.trader, timestamp);
}

async function addBalance(db: Db, token: Address, account: Address, delta: bigint) {
  await db
    .insert(schema.holder)
    .values({ token, account, balance: delta })
    .onConflictDoUpdate((h) => ({ balance: h.balance + delta }));
}

async function touchAccount(db: Db, address: Address, timestamp: number) {
  await db.insert(schema.account).values({ address, firstSeen: timestamp }).onConflictDoNothing();
  await db
    .insert(schema.accountDay)
    .values({ address, day: dayOf(timestamp) })
    .onConflictDoNothing();
}

ponder.on("FeeSplitter:FeesCollected", async ({ event, context }) => {
  const token = getAddress(event.args.token);
  const row = await context.db.find(schema.token, { address: token });
  // The splitter is permissionless: positions not launched through our strategy are ignored.
  if (!row || row.positionId !== event.args.tokenId) return;
  const { nativeAmount, tokenAmount } = event.args;
  await context.db.insert(schema.feeCollection).values({
    id: `${event.transaction.hash}:${event.log.logIndex}`,
    positionId: event.args.tokenId,
    token,
    nativeWei: nativeAmount,
    tokenAmount,
    creatorWei: creatorShare(nativeAmount),
    platformWei: platformShare(nativeAmount),
    timestamp: Number(event.block.timestamp),
    txHash: event.transaction.hash,
  });
  await context.db.update(schema.token, { address: token }).set((t) => ({
    creatorFeesWei: t.creatorFeesWei + creatorShare(nativeAmount),
    creatorFeesToken: t.creatorFeesToken + creatorShare(tokenAmount),
  }));
});

ponder.on("BeneficiaryVault:Transfer", async ({ event, context }) => {
  const { to, id } = event.args;
  await context.db
    .insert(schema.beneficiary)
    .values({ positionId: id, owner: getAddress(to) })
    .onConflictDoUpdate({ owner: getAddress(to) });
});

ponder.on("BeneficiaryVault:Claimed", async ({ event, context }) => {
  const { tokenId, currency0Amount, currency1Amount, poolKey } = event.args;
  // Only the beneficiary NFT owner can claim, so the claimer is the owner at this point.
  const owner = await context.db.find(schema.beneficiary, { positionId: tokenId });
  await context.db.insert(schema.claim).values({
    id: `${event.transaction.hash}:${event.log.logIndex}`,
    positionId: tokenId,
    token: getAddress(poolKey.currency1),
    claimer: owner?.owner ?? getAddress(event.transaction.from),
    nativeWei: currency0Amount,
    tokenAmount: currency1Amount,
    timestamp: Number(event.block.timestamp),
    txHash: event.transaction.hash,
  });
});
