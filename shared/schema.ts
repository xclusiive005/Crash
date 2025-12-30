import { sql } from "drizzle-orm";
import { pgTable, text, varchar, decimal, timestamp, serial, boolean, bigint, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  balance: decimal("balance", { precision: 18, scale: 9 }).notNull().default("0.5"),
  realBalance: decimal("real_balance", { precision: 18, scale: 9 }).notNull().default("0"),
  gameMode: text("game_mode").notNull().default("demo"),
  baseBet: decimal("base_bet", { precision: 18, scale: 9 }).notNull().default("0.0001"),
  stopLoss: decimal("stop_loss", { precision: 18, scale: 9 }).notNull().default("1.00"),
  autoBetEnabled: boolean("auto_bet_enabled").notNull().default(false),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  walletAddress: text("wallet_address"),
  xHandle: text("x_handle"),
  tiktokHandle: text("tiktok_handle"),
  telegramHandle: text("telegram_handle"),
  email: text("email"),
  discordHandle: text("discord_handle"),
});

export const games = pgTable("games", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  crash: decimal("crash", { precision: 10, scale: 2 }).notNull(),
  result: text("result").notNull(),
  profit: decimal("profit", { precision: 18, scale: 9 }).notNull(),
  bet: decimal("bet", { precision: 18, scale: 9 }).notNull(),
  balance: decimal("balance", { precision: 18, scale: 9 }).notNull(),
  mode: text("mode").notNull(),
  gameMode: text("game_mode").notNull().default("demo"),
  targetMultiplier: decimal("target_multiplier", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const deposits = pgTable("deposits", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  signature: text("signature").notNull().unique(),
  amountLamports: bigint("amount_lamports", { mode: "number" }).notNull(),
  amountSol: decimal("amount_sol", { precision: 18, scale: 9 }).notNull(),
  status: text("status").notNull().default("confirmed"),
  fromAddress: text("from_address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const updateProfileSchema = z.object({
  displayName: z.string().optional(),
  avatarUrl: z.string().optional(),
  walletAddress: z.string().optional(),
  xHandle: z.string().optional(),
  tiktokHandle: z.string().optional(),
  telegramHandle: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  discordHandle: z.string().optional(),
});

export const insertGameSchema = createInsertSchema(games).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Game = typeof games.$inferSelect;
export type InsertGame = z.infer<typeof insertGameSchema>;
export type UpdateProfile = z.infer<typeof updateProfileSchema>;

// Admin users table
export const adminUsers = pgTable("admin_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("operator"),
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  twoFactorSecret: text("two_factor_secret"),
  backupCodes: text("backup_codes"),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Vault transactions table
export const vaultTransactions = pgTable("vault_transactions", {
  id: serial("id").primaryKey(),
  roundId: varchar("round_id"),
  userId: varchar("user_id").references(() => users.id),
  adminId: varchar("admin_id").references(() => adminUsers.id),
  type: text("type").notNull(),
  amountLamports: bigint("amount_lamports", { mode: "number" }).notNull(),
  solSignature: text("sol_signature"),
  status: text("status").notNull().default("pending"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Vault balance (single row table for aggregate)
export const vaultBalance = pgTable("vault_balance", {
  id: serial("id").primaryKey(),
  walletAddress: text("wallet_address").notNull().default("BSFwwkJXeYNzXDVnfdLvgkPLJMoth1cP3PvT2471Mvzg"),
  totalLamports: bigint("total_lamports", { mode: "number" }).notNull().default(0),
  pendingWithdrawals: bigint("pending_withdrawals", { mode: "number" }).notNull().default(0),
  houseEdgeAccumulated: bigint("house_edge_accumulated", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Provably fair rounds table
export const provablyFairRounds = pgTable("provably_fair_rounds", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverSeedHash: text("server_seed_hash").notNull(),
  serverSeed: text("server_seed"),
  clientSeed: text("client_seed"),
  nonce: serial("nonce"),
  crashMultiplier: decimal("crash_multiplier", { precision: 10, scale: 2 }),
  revealed: boolean("revealed").notNull().default(false),
  revealedAt: timestamp("revealed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Admin session tokens
export const adminSessions = pgTable("admin_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").notNull().references(() => adminUsers.id),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Withdrawal requests (tickets)
export const withdrawalRequests = pgTable("withdrawal_requests", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  amountSol: decimal("amount_sol", { precision: 18, scale: 9 }).notNull(),
  walletAddress: text("wallet_address").notNull(),
  status: text("status").notNull().default("pending"), // pending, approved, denied, completed
  adminNotes: text("admin_notes"),
  solSignature: text("sol_signature"), // filled when completed
  createdAt: timestamp("created_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
});

// Insert schemas
export const insertAdminSchema = createInsertSchema(adminUsers).pick({
  email: true,
  passwordHash: true,
  role: true,
});

export const insertVaultTransactionSchema = createInsertSchema(vaultTransactions).omit({
  id: true,
  createdAt: true,
});

export const insertProvablyFairRoundSchema = createInsertSchema(provablyFairRounds).omit({
  id: true,
  nonce: true,
  createdAt: true,
});

export const insertWithdrawalRequestSchema = createInsertSchema(withdrawalRequests).omit({
  id: true,
  createdAt: true,
  processedAt: true,
  adminNotes: true,
  solSignature: true,
}).extend({
  status: z.enum(['pending', 'approved', 'denied', 'completed']).default('pending'),
});

// Types
export type AdminUser = typeof adminUsers.$inferSelect;
export type InsertAdmin = z.infer<typeof insertAdminSchema>;
export type VaultTransaction = typeof vaultTransactions.$inferSelect;
export type InsertVaultTransaction = z.infer<typeof insertVaultTransactionSchema>;
export type VaultBalance = typeof vaultBalance.$inferSelect;
export type ProvablyFairRound = typeof provablyFairRounds.$inferSelect;
export type InsertProvablyFairRound = z.infer<typeof insertProvablyFairRoundSchema>;
export type AdminSession = typeof adminSessions.$inferSelect;
export type WithdrawalRequest = typeof withdrawalRequests.$inferSelect;
export type InsertWithdrawalRequest = z.infer<typeof insertWithdrawalRequestSchema>;
