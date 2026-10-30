import { index, onchainTable, primaryKey, relations } from "ponder";

/**
 * Only real on-chain data. Amounts are bigint (wei / token base units). Prices are integers:
 * `priceWei` = wei per 1 whole token (1e18 base units).
 */

export const token = onchainTable(
  "token",
  (t) => ({
    address: t.hex().primaryKey(),
    poolId: t.hex().notNull(),
    positionId: t.bigint().notNull(),
    name: t.text().notNull(),
    symbol: t.text().notNull(),
    creator: t.hex().notNull(),
    description: t.text().notNull(),
    website: t.text().notNull(),
    image: t.text().notNull(),
    extraData: t.hex().notNull(),
    launchedAt: t.integer().notNull(),
    launchBlock: t.bigint().notNull(),
    launchTx: t.hex().notNull(),
    openPriceWei: t.bigint().notNull(),
    priceWei: t.bigint().notNull(),
    sqrtPriceX96: t.bigint().notNull(),
    volumeWei: t.bigint().notNull(),
    tradeCount: t.integer().notNull(),
    lastTradeAt: t.integer(),
    creatorFeesWei: t.bigint().notNull(),
    creatorFeesToken: t.bigint().notNull(),
  }),
  (table) => ({
    creatorIdx: index().on(table.creator),
    launchedAtIdx: index().on(table.launchedAt),
    poolIdx: index().on(table.poolId),
  }),
);

export const trade = onchainTable(
  "trade",
  (t) => ({
    id: t.text().primaryKey(), // txHash:swapLogIndex
    token: t.hex().notNull(),
    trader: t.hex().notNull(),
    side: t.text().notNull(), // "buy" | "sell"
    ethWei: t.bigint().notNull(),
    tokenAmount: t.bigint().notNull(),
    priceWei: t.bigint().notNull(),
    timestamp: t.integer().notNull(),
    blockNumber: t.bigint().notNull(),
    txHash: t.hex().notNull(),
  }),
  (table) => ({
    tokenTimeIdx: index().on(table.token, table.timestamp),
    traderIdx: index().on(table.trader),
    timeIdx: index().on(table.timestamp),
  }),
);

/** OHLC built only from real swaps. `interval` in seconds: 60, 300, 3600, 86400. */
export const candle = onchainTable(
  "candle",
  (t) => ({
    token: t.hex().notNull(),
    interval: t.integer().notNull(),
    bucket: t.integer().notNull(),
    open: t.bigint().notNull(),
    high: t.bigint().notNull(),
    low: t.bigint().notNull(),
    close: t.bigint().notNull(),
    volumeWei: t.bigint().notNull(),
    trades: t.integer().notNull(),
  }),
  (table) => ({ pk: primaryKey({ columns: [table.token, table.interval, table.bucket] }) }),
);

export const holder = onchainTable(
  "holder",
  (t) => ({
    token: t.hex().notNull(),
    account: t.hex().notNull(),
    balance: t.bigint().notNull(),
  }),
  (table) => ({
    pk: primaryKey({ columns: [table.token, table.account] }),
    balanceIdx: index().on(table.token, table.balance),
    accountIdx: index().on(table.account),
  }),
);

/** One row per FeeSplitter.collectFees per position. Creator / platform shares use the contract's floor math. */
export const feeCollection = onchainTable(
  "fee_collection",
  (t) => ({
    id: t.text().primaryKey(),
    positionId: t.bigint().notNull(),
    token: t.hex().notNull(),
    nativeWei: t.bigint().notNull(),
    tokenAmount: t.bigint().notNull(),
    creatorWei: t.bigint().notNull(),
    platformWei: t.bigint().notNull(),
    timestamp: t.integer().notNull(),
    txHash: t.hex().notNull(),
  }),
  (table) => ({ tokenIdx: index().on(table.token) }),
);

/** Current owner of each beneficiary NFT (id = launch position id). Transferable. */
export const beneficiary = onchainTable(
  "beneficiary",
  (t) => ({
    positionId: t.bigint().primaryKey(),
    owner: t.hex().notNull(),
  }),
  (table) => ({ ownerIdx: index().on(table.owner) }),
);

export const claim = onchainTable(
  "claim",
  (t) => ({
    id: t.text().primaryKey(),
    positionId: t.bigint().notNull(),
    token: t.hex().notNull(),
    claimer: t.hex().notNull(),
    nativeWei: t.bigint().notNull(),
    tokenAmount: t.bigint().notNull(),
    timestamp: t.integer().notNull(),
    txHash: t.hex().notNull(),
  }),
  (table) => ({ claimerIdx: index().on(table.claimer), tokenIdx: index().on(table.token) }),
);

/** First-seen time per account and per account-day, for unique users / DAU / WAU. */
export const account = onchainTable("account", (t) => ({
  address: t.hex().primaryKey(),
  firstSeen: t.integer().notNull(),
}));

export const accountDay = onchainTable(
  "account_day",
  (t) => ({
    address: t.hex().notNull(),
    day: t.integer().notNull(), // unix day number
  }),
  (table) => ({ pk: primaryKey({ columns: [table.address, table.day] }), dayIdx: index().on(table.day) }),
);

export const tokenRelations = relations(token, ({ many }) => ({ trades: many(trade) }));
export const tradeRelations = relations(trade, ({ one }) => ({
  token: one(token, { fields: [trade.token], references: [token.address] }),
}));
