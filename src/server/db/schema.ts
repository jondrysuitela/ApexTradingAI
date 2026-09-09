import { boolean, jsonb, numeric, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, index } from "drizzle-orm/pg-core";

export const marketStatusEnum = pgEnum("market_status", ["LIVE", "DELAYED", "STALE", "OFFLINE"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  displayName: text("display_name"),
  timezone: text("timezone").notNull().default("UTC"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  defaultSymbol: text("default_symbol").notNull().default("BTCUSDT"),
  defaultTimeframe: text("default_timeframe").notNull().default("1h"),
  riskPercent: numeric("risk_percent", { precision: 6, scale: 2 }).notNull().default("1.00"),
  maxDailyLoss: numeric("max_daily_loss", { precision: 18, scale: 2 }).notNull().default("0"),
  maxExposure: numeric("max_exposure", { precision: 18, scale: 2 }).notNull().default("0"),
  maxPositionSize: numeric("max_position_size", { precision: 18, scale: 2 }).notNull().default("0"),
  maxLeverage: numeric("max_leverage", { precision: 18, scale: 2 }).notNull().default("1"),
  openPositionsLimit: numeric("open_positions_limit", { precision: 18, scale: 2 }).notNull().default("0"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const assets = pgTable("assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  symbol: text("symbol").notNull().unique(),
  baseAsset: text("base_asset").notNull(),
  quoteAsset: text("quote_asset").notNull(),
  assetClass: text("asset_class").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const markets = pgTable("markets", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  venue: text("venue").notNull(),
  status: marketStatusEnum("status").notNull().default("OFFLINE"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const candles = pgTable(
  "candles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
    marketId: uuid("market_id").notNull().references(() => markets.id, { onDelete: "cascade" }),
    timeframe: text("timeframe").notNull(),
    provider: text("provider").notNull(),
    source: text("source").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    open: numeric("open", { precision: 24, scale: 10 }).notNull(),
    high: numeric("high", { precision: 24, scale: 10 }).notNull(),
    low: numeric("low", { precision: 24, scale: 10 }).notNull(),
    close: numeric("close", { precision: 24, scale: 10 }).notNull(),
    volume: numeric("volume", { precision: 28, scale: 10 }).notNull(),
    freshness: text("freshness").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    assetTimeframeTsIdx: index("candles_asset_timeframe_ts_idx").on(table.assetId, table.timeframe, table.timestamp),
    uniqueCandle: uniqueIndex("candles_unique_idx").on(table.assetId, table.marketId, table.timeframe, table.timestamp),
  }),
);

export const watchlists = pgTable("watchlists", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const watchlistAssets = pgTable(
  "watchlist_assets",
  {
    watchlistId: uuid("watchlist_id").notNull().references(() => watchlists.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.watchlistId, table.assetId] }),
  }),
);

export const alertTypeEnum = pgEnum("alert_type", ["price", "percentage_change", "breakout", "breakdown", "indicator", "setup_score", "volatility", "market_regime"]);
export const alertChannelEnum = pgEnum("alert_channel", ["browser", "email", "telegram", "discord"]);
export const alertStatusEnum = pgEnum("alert_status", ["active", "paused", "triggered", "disabled"]);

export const alerts = pgTable("alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  alertType: alertTypeEnum("alert_type").notNull(),
  channel: alertChannelEnum("channel").notNull(),
  threshold: numeric("threshold", { precision: 24, scale: 10 }),
  timeframe: text("timeframe"),
  status: alertStatusEnum("status").notNull().default("active"),
  lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
  lastTriggeredValue: numeric("last_triggered_value", { precision: 24, scale: 10 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const alertNotifications = pgTable("alert_notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  alertId: uuid("alert_id").references(() => alerts.id, { onDelete: "set null" }),
  symbol: text("symbol").notNull(),
  alertType: alertTypeEnum("alert_type").notNull(),
  channel: alertChannelEnum("channel").notNull(),
  triggerValue: numeric("trigger_value", { precision: 24, scale: 10 }).notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const portfolioStatuses = pgEnum("portfolio_status", ["active", "archived"]);

export const portfolios = pgTable("portfolios", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  baseCurrency: text("base_currency").notNull().default("USD"),
  status: portfolioStatuses("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const portfolioPositions = pgTable(
  "portfolio_positions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    portfolioId: uuid("portfolio_id").notNull().references(() => portfolios.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
    quantity: numeric("quantity", { precision: 28, scale: 10 }).notNull().default("0"),
    averagePrice: numeric("average_price", { precision: 24, scale: 10 }).notNull().default("0"),
    marketValue: numeric("market_value", { precision: 24, scale: 10 }).notNull().default("0"),
    unrealizedPnl: numeric("unrealized_pnl", { precision: 24, scale: 10 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    portfolioAssetUnique: uniqueIndex("portfolio_positions_unique_idx").on(table.portfolioId, table.assetId),
  }),
);

export const journalEntries = pgTable("journal_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
  symbol: text("symbol").notNull(),
  direction: text("direction").notNull(),
  entryPrice: numeric("entry_price", { precision: 24, scale: 10 }),
  stopPrice: numeric("stop_price", { precision: 24, scale: 10 }),
  targetPrice: numeric("target_price", { precision: 24, scale: 10 }),
  strategy: text("strategy"),
  reason: text("reason"),
  screenshotUrl: text("screenshot_url"),
  result: text("result"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const paperOrderTypeEnum = pgEnum("paper_order_type", ["market", "limit", "stop"]);
export const paperOrderSideEnum = pgEnum("paper_order_side", ["buy", "sell"]);
export const paperOrderStatusEnum = pgEnum("paper_order_status", ["open", "filled", "cancelled", "rejected"]);

export const paperAccounts = pgTable("paper_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  baseCurrency: text("base_currency").notNull().default("USD"),
  balance: numeric("balance", { precision: 24, scale: 10 }).notNull().default("100000"),
  equity: numeric("equity", { precision: 24, scale: 10 }).notNull().default("100000"),
  realizedPnl: numeric("realized_pnl", { precision: 24, scale: 10 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const paperOrders = pgTable("paper_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => paperAccounts.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  side: paperOrderSideEnum("side").notNull(),
  orderType: paperOrderTypeEnum("order_type").notNull(),
  quantity: numeric("quantity", { precision: 28, scale: 10 }).notNull(),
  limitPrice: numeric("limit_price", { precision: 24, scale: 10 }),
  stopPrice: numeric("stop_price", { precision: 24, scale: 10 }),
  status: paperOrderStatusEnum("status").notNull().default("open"),
  filledPrice: numeric("filled_price", { precision: 24, scale: 10 }),
  realizedPnl: numeric("realized_pnl", { precision: 24, scale: 10 }),
  filledAt: timestamp("filled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const paperPositions = pgTable(
  "paper_positions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").notNull().references(() => paperAccounts.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    quantity: numeric("quantity", { precision: 28, scale: 10 }).notNull().default("0"),
    averagePrice: numeric("average_price", { precision: 24, scale: 10 }).notNull().default("0"),
    markPrice: numeric("mark_price", { precision: 24, scale: 10 }),
    unrealizedPnl: numeric("unrealized_pnl", { precision: 24, scale: 10 }).notNull().default("0"),
    markedAt: timestamp("marked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    accountSymbolUnique: uniqueIndex("paper_positions_account_symbol_idx").on(table.accountId, table.symbol),
  }),
);

export const systemEvents = pgTable("system_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  service: text("service").notNull(),
  level: text("level").notNull(),
  message: text("message").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
