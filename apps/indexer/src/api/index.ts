import { db } from "ponder:api";
import schema from "ponder:schema";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { and, count, countDistinct, desc, eq, gte, ilike, inArray, notInArray, or, sql, sum } from "ponder";
import { getAddress, isAddress } from "viem";
import { addresses } from "../addresses";

/**
 * Read API for the web app. Only indexed on-chain data; bigints are serialised as decimal strings.
 * Team / test wallets in EXCLUDED_WALLETS (comma separated) are left out of /stats.
 */
const app = new Hono();
app.use("*", cors());

const SUPPLY_TOKENS = 1_000_000_000n;
const HOUR = 3600;
const now = () => Math.floor(Date.now() / 1000);
const excluded = (process.env.EXCLUDED_WALLETS ?? "")
  .split(",")
  .map((a) => a.trim())
  .filter((a) => isAddress(a))
  .map((a) => getAddress(a));

const json = (value: unknown) =>
  new Response(
    JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
    {
      headers: { "content-type": "application/json" },
    },
  );

const limitOf = (raw: string | undefined, max = 100, fallback = 50) =>
  Math.min(Math.max(Number.parseInt(raw ?? "", 10) || fallback, 1), max);

/** Last trade price at or before `cutoff`, else the launch price. Used for "1h change". */
async function pricesAt(tokens: `0x${string}`[], cutoff: number) {
  if (tokens.length === 0) return new Map<string, bigint>();
  const rows = await db
    .selectDistinctOn([schema.trade.token], { token: schema.trade.token, priceWei: schema.trade.priceWei })
    .from(schema.trade)
    .where(and(inArray(schema.trade.token, tokens), sql`${schema.trade.timestamp} <= ${cutoff}`))
    .orderBy(schema.trade.token, desc(schema.trade.timestamp));
  return new Map(rows.map((r) => [r.token, r.priceWei]));
}

type TokenRow = typeof schema.token.$inferSelect;

async function listItems(rows: TokenRow[]) {
  const cutoff = now() - HOUR;
  const before = await pricesAt(
    rows.map((r) => r.address),
    cutoff,
  );
  return rows.map((t) => {
    // Price at the cutoff: the last trade before it, or the opening price if none traded yet.
    const base = before.get(t.address) ?? t.openPriceWei;
    return {
      address: t.address,
      name: t.name,
      symbol: t.symbol,
      image: t.image,
      creator: t.creator,
      launchedAt: t.launchedAt,
      priceWei: t.priceWei,
      marketCapWei: t.priceWei * SUPPLY_TOKENS,
      change1hBps: base === 0n ? 0n : ((t.priceWei - base) * 10_000n) / base,
      volumeWei: t.volumeWei,
      creatorFeesWei: t.creatorFeesWei,
    };
  });
}

app.get("/tokens", async (c) => {
  const tab = c.req.query("tab") ?? "new";
  const q = c.req.query("q")?.trim();
  const limit = limitOf(c.req.query("limit"));

  const search = q
    ? isAddress(q)
      ? eq(schema.token.address, getAddress(q))
      : or(ilike(schema.token.name, `%${q}%`), ilike(schema.token.symbol, `%${q.replace(/^\$/, "")}%`))
    : undefined;

  if (tab === "trending") {
    const since = now() - HOUR;
    const vol = db
      .select({ token: schema.trade.token, volume: sum(schema.trade.ethWei).as("volume") })
      .from(schema.trade)
      .where(gte(schema.trade.timestamp, since))
      .groupBy(schema.trade.token)
      .as("vol");
    const rows = await db
      .select({ token: schema.token, volume1hWei: vol.volume })
      .from(vol)
      .innerJoin(schema.token, eq(schema.token.address, vol.token))
      .where(search)
      .orderBy(desc(vol.volume))
      .limit(limit);
    const items = await listItems(rows.map((r) => r.token));
    return json({ items: items.map((it, i) => ({ ...it, volume1hWei: rows[i]?.volume1hWei ?? "0" })) });
  }

  const order = tab === "earners" ? desc(schema.token.creatorFeesWei) : desc(schema.token.launchedAt);
  const rows = await db.select().from(schema.token).where(search).orderBy(order).limit(limit);
  return json({ items: await listItems(rows) });
});

app.get("/tokens/:address", async (c) => {
  const address = c.req.param("address");
  if (!isAddress(address)) return c.json({ error: "invalid address" }, 400);
  const row = await db.query.token.findFirst({ where: eq(schema.token.address, getAddress(address)) });
  if (!row) return c.json({ error: "not found" }, 404);
  const [item] = await listItems([row]);
  const owner = await db.query.beneficiary.findFirst({
    where: eq(schema.beneficiary.positionId, row.positionId),
  });
  return json({
    ...item,
    poolId: row.poolId,
    positionId: row.positionId,
    description: row.description,
    website: row.website,
    extraData: row.extraData,
    launchTx: row.launchTx,
    launchBlock: row.launchBlock,
    tradeCount: row.tradeCount,
    creatorFeesToken: row.creatorFeesToken,
    beneficiary: owner?.owner ?? row.creator,
  });
});

app.get("/tokens/:address/trades", async (c) => {
  const address = c.req.param("address");
  if (!isAddress(address)) return c.json({ error: "invalid address" }, 400);
  const items = await db
    .select()
    .from(schema.trade)
    .where(eq(schema.trade.token, getAddress(address)))
    .orderBy(desc(schema.trade.timestamp))
    .limit(limitOf(c.req.query("limit")));
  return json({ items });
});

app.get("/tokens/:address/candles", async (c) => {
  const address = c.req.param("address");
  const interval = Number(c.req.query("interval") ?? 300);
  if (!isAddress(address) || ![60, 300, 3600, 86400].includes(interval))
    return c.json({ error: "bad request" }, 400);
  const items = await db
    .select()
    .from(schema.candle)
    .where(and(eq(schema.candle.token, getAddress(address)), eq(schema.candle.interval, interval)))
    .orderBy(desc(schema.candle.bucket))
    .limit(limitOf(c.req.query("limit"), 1000, 300));
  return json({ items: items.reverse() });
});

app.get("/tokens/:address/holders", async (c) => {
  const address = c.req.param("address");
  if (!isAddress(address)) return c.json({ error: "invalid address" }, 400);
  const rows = await db
    .select()
    .from(schema.holder)
    .where(and(eq(schema.holder.token, getAddress(address)), sql`${schema.holder.balance} > 0`))
    .orderBy(desc(schema.holder.balance))
    .limit(20);
  // The PoolManager holds the pool's liquidity; label it rather than hide it.
  return json({
    items: rows.map((h) => ({
      account: h.account,
      balance: h.balance,
      isPool: h.account === addresses.poolManager,
    })),
  });
});

app.get("/creators/:address", async (c) => {
  const address = c.req.param("address");
  if (!isAddress(address)) return c.json({ error: "invalid address" }, 400);
  const who = getAddress(address);
  const created = await db
    .select()
    .from(schema.token)
    .where(eq(schema.token.creator, who))
    .orderBy(desc(schema.token.launchedAt));
  const owned = await db.select().from(schema.beneficiary).where(eq(schema.beneficiary.owner, who));
  const claims = await db
    .select()
    .from(schema.claim)
    .where(eq(schema.claim.claimer, who))
    .orderBy(desc(schema.claim.timestamp));
  const holdings = await db
    .select({ token: schema.token, balance: schema.holder.balance })
    .from(schema.holder)
    .innerJoin(schema.token, eq(schema.token.address, schema.holder.token))
    .where(and(eq(schema.holder.account, who), sql`${schema.holder.balance} > 0`))
    .orderBy(desc(schema.holder.balance));
  return json({
    created: await listItems(created),
    // Positions whose beneficiary NFT this address owns now; the web app reads claimable amounts on-chain.
    positions: owned.map((o) => o.positionId),
    claims,
    holdings: (await listItems(holdings.map((h) => h.token))).map((it, i) => ({
      ...it,
      balance: holdings[i]?.balance,
    })),
  });
});

/** Live ticker: latest launches and trades, newest first. */
app.get("/events", async (c) => {
  const limit = limitOf(c.req.query("limit"), 50, 20);
  const launches = await db.select().from(schema.token).orderBy(desc(schema.token.launchedAt)).limit(limit);
  const trades = await db
    .select({ trade: schema.trade, symbol: schema.token.symbol })
    .from(schema.trade)
    .innerJoin(schema.token, eq(schema.token.address, schema.trade.token))
    .orderBy(desc(schema.trade.timestamp))
    .limit(limit);
  const items = [
    ...launches.map((t) => ({ kind: "launch", token: t.address, symbol: t.symbol, timestamp: t.launchedAt })),
    ...trades.map((r) => ({
      kind: r.trade.side,
      token: r.trade.token,
      symbol: r.symbol,
      ethWei: r.trade.ethWei,
      timestamp: r.trade.timestamp,
    })),
  ]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
  const launchedLastMinute = launches.filter((t) => t.launchedAt > now() - 60).length;
  return json({ items, launchedLastMinute });
});

/** Grant metrics (docs/grant-metrics.md). Same definitions as the Dune queries. */
app.get("/stats", async () => {
  const today = Math.floor(now() / 86400);
  const notExcluded = (col: AnyPgColumn) => (excluded.length ? notInArray(col, excluded) : undefined);

  const [[users], [dau], [wau], [volume], [volume30d], [launches], [claimers], [paid]] = await Promise.all([
    db.select({ n: count() }).from(schema.account).where(notExcluded(schema.account.address)),
    db
      .select({ n: countDistinct(schema.accountDay.address) })
      .from(schema.accountDay)
      .where(and(eq(schema.accountDay.day, today), notExcluded(schema.accountDay.address))),
    db
      .select({ n: countDistinct(schema.accountDay.address) })
      .from(schema.accountDay)
      .where(and(gte(schema.accountDay.day, today - 6), notExcluded(schema.accountDay.address))),
    db
      .select({ wei: sum(schema.trade.ethWei) })
      .from(schema.trade)
      .where(notExcluded(schema.trade.trader)),
    db
      .select({ wei: sum(schema.trade.ethWei) })
      .from(schema.trade)
      .where(and(gte(schema.trade.timestamp, now() - 30 * 86400), notExcluded(schema.trade.trader))),
    db.select({ n: count() }).from(schema.token).where(notExcluded(schema.token.creator)),
    db
      .select({ n: countDistinct(schema.claim.claimer) })
      .from(schema.claim)
      .where(notExcluded(schema.claim.claimer)),
    db
      .select({ wei: sum(schema.claim.nativeWei) })
      .from(schema.claim)
      .where(notExcluded(schema.claim.claimer)),
  ]);
  return json({
    uniqueUsers: users?.n ?? 0,
    dau: dau?.n ?? 0,
    wau: wau?.n ?? 0,
    volumeWei: volume?.wei ?? "0",
    volume30dWei: volume30d?.wei ?? "0",
    launches: launches?.n ?? 0,
    creatorsClaimed: claimers?.n ?? 0,
    ethPaidToCreatorsWei: paid?.wei ?? "0",
    excludedWallets: excluded.length,
  });
});

export default app;
