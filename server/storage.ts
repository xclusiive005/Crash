import { 
  type User, type InsertUser, type Game, type InsertGame, type UpdateProfile,
  type AdminUser, type InsertAdmin, type VaultTransaction, type InsertVaultTransaction,
  type VaultBalance, type ProvablyFairRound, type InsertProvablyFairRound, type AdminSession
} from "@shared/schema";
import { db } from "../db/index";
import { users, games, adminUsers, vaultTransactions, vaultBalance, provablyFairRounds, adminSessions, deposits, withdrawalRequests } from "@shared/schema";
import { eq, desc, and, gt, sql } from "drizzle-orm";

export const DEFAULT_AVATARS = [
  '/avatars/IMG_5318_1764900785906.jpeg',
  '/avatars/IMG_5319_1764900785906.jpeg',
  '/avatars/IMG_5320_1764900785906.jpeg',
  '/avatars/IMG_5321_1764900785906.jpeg',
  '/avatars/IMG_5322_1764900785906.jpeg',
  '/avatars/IMG_5323_1764900785906.jpeg',
  '/avatars/IMG_5324_1764900785906.jpeg',
  '/avatars/IMG_5325_1764900785906.jpeg',
  '/avatars/IMG_5326_1764900785906.jpeg',
  '/avatars/IMG_5327_1764900785906.jpeg',
  '/avatars/IMG_5328_1764900785906.jpeg',
  '/avatars/IMG_5329_1764900785906.jpeg',
  '/avatars/IMG_5330_1764900785906.jpeg',
  '/avatars/IMG_5331_1764900785906.jpeg',
  '/avatars/IMG_5332_1764900785906.jpeg',
  '/avatars/IMG_5333_1764900785906.jpeg',
];

function getRandomAvatar(): string {
  return DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)];
}

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByWallet(walletAddress: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserBalance(userId: string, balance: string): Promise<void>;
  updateUserRealBalance(userId: string, balance: string): Promise<void>;
  updateUserGameMode(userId: string, gameMode: 'demo' | 'real'): Promise<void>;
  updateUserConfig(userId: string, config: { baseBet: string, stopLoss: string, autoBetEnabled: boolean }): Promise<void>;
  updateUserProfile(userId: string, profile: UpdateProfile): Promise<User>;
  
  // Deposit methods
  createDeposit(userId: string, signature: string, amountLamports: number, amountSol: string, fromAddress?: string): Promise<any>;
  getDepositBySignature(signature: string): Promise<any>;
  getUserDeposits(userId: string, limit?: number): Promise<any[]>;
  
  // Game methods
  createGame(game: InsertGame): Promise<Game>;
  getUserGames(userId: string, limit?: number): Promise<Game[]>;
  getGameStats(userId: string): Promise<{ totalGames: number, wins: number, losses: number }>;
  
  // Admin methods
  getAdminByEmail(email: string): Promise<AdminUser | undefined>;
  getAdminById(id: string): Promise<AdminUser | undefined>;
  createAdmin(admin: InsertAdmin): Promise<AdminUser>;
  updateAdminTwoFactor(adminId: string, secret: string, backupCodes: string): Promise<void>;
  enableAdminTwoFactor(adminId: string): Promise<void>;
  updateAdminLastLogin(adminId: string): Promise<void>;
  
  // Admin session methods
  createAdminSession(adminId: string, token: string, expiresAt: Date): Promise<AdminSession>;
  getAdminSession(token: string): Promise<AdminSession | undefined>;
  deleteAdminSession(token: string): Promise<void>;
  
  // Vault methods
  getVaultBalance(): Promise<VaultBalance | undefined>;
  initializeVaultBalance(): Promise<VaultBalance>;
  updateVaultBalance(amount: number, type: 'deposit' | 'withdrawal' | 'house_edge'): Promise<VaultBalance>;
  updateVaultHouseEdge(amount: number): Promise<VaultBalance>;
  createVaultTransaction(transaction: InsertVaultTransaction): Promise<VaultTransaction>;
  getVaultTransactions(limit?: number): Promise<VaultTransaction[]>;
  
  // Withdrawal request methods
  createWithdrawalRequest(request: { userId: string, amountSol: string, walletAddress: string }): Promise<any>;
  getUserWithdrawalRequests(userId: string): Promise<any[]>;
  getAllPendingWithdrawalRequests(): Promise<any[]>;
  processWithdrawalRequest(id: number, status: 'approved' | 'denied' | 'completed', adminNotes?: string, solSignature?: string): Promise<any>;
  
  // Provably fair methods
  createProvablyFairRound(round: InsertProvablyFairRound): Promise<ProvablyFairRound>;
  getProvablyFairRound(id: string): Promise<ProvablyFairRound | undefined>;
  revealProvablyFairRound(id: string, serverSeed: string, crashMultiplier: string): Promise<ProvablyFairRound>;
  getRecentProvablyFairRounds(limit?: number): Promise<ProvablyFairRound[]>;
}

export class DbStorage implements IStorage {
  // User methods
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values({
      ...insertUser,
      avatarUrl: getRandomAvatar()
    }).returning();
    return user;
  }

  async updateUserBalance(userId: string, balance: string): Promise<void> {
    await db.update(users).set({ balance }).where(eq(users.id, userId));
  }

  async updateUserRealBalance(userId: string, realBalance: string): Promise<void> {
    await db.update(users).set({ realBalance }).where(eq(users.id, userId));
  }

  async updateUserGameMode(userId: string, gameMode: 'demo' | 'real'): Promise<void> {
    await db.update(users).set({ gameMode }).where(eq(users.id, userId));
  }

  async updateUserConfig(userId: string, config: { baseBet: string, stopLoss: string, autoBetEnabled: boolean }): Promise<void> {
    await db.update(users).set(config).where(eq(users.id, userId));
  }

  // Deposit methods
  async createDeposit(userId: string, signature: string, amountLamports: number, amountSol: string, fromAddress?: string): Promise<any> {
    const [deposit] = await db.insert(deposits).values({
      userId,
      signature,
      amountLamports,
      amountSol,
      fromAddress: fromAddress || null,
      status: 'confirmed'
    }).returning();
    return deposit;
  }

  async getDepositBySignature(signature: string): Promise<any> {
    const [deposit] = await db.select().from(deposits).where(eq(deposits.signature, signature));
    return deposit;
  }

  async getUserDeposits(userId: string, limit: number = 20): Promise<any[]> {
    return await db.select().from(deposits).where(eq(deposits.userId, userId)).orderBy(desc(deposits.createdAt)).limit(limit);
  }

  async getUserByWallet(walletAddress: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.walletAddress, walletAddress));
    return user;
  }

  async updateUserProfile(userId: string, profile: UpdateProfile): Promise<User> {
    const [updated] = await db.update(users).set(profile).where(eq(users.id, userId)).returning();
    return updated;
  }

  // Game methods
  async createGame(insertGame: InsertGame): Promise<Game> {
    const [game] = await db.insert(games).values(insertGame).returning();
    return game;
  }

  async getUserGames(userId: string, limit: number = 50): Promise<Game[]> {
    return await db.select().from(games).where(eq(games.userId, userId)).orderBy(desc(games.createdAt)).limit(limit);
  }

  async getGameStats(userId: string): Promise<{ totalGames: number, wins: number, losses: number }> {
    const allGames = await db.select().from(games).where(eq(games.userId, userId));
    const totalGames = allGames.length;
    const wins = allGames.filter((g: Game) => g.result === 'Won').length;
    const losses = allGames.filter((g: Game) => g.result === 'Lost').length;
    return { totalGames, wins, losses };
  }

  // Admin methods
  async getAdminByEmail(email: string): Promise<AdminUser | undefined> {
    const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.email, email));
    return admin;
  }

  async getAdminById(id: string): Promise<AdminUser | undefined> {
    const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.id, id));
    return admin;
  }

  async createAdmin(admin: InsertAdmin): Promise<AdminUser> {
    const [created] = await db.insert(adminUsers).values(admin).returning();
    return created;
  }

  async updateAdminTwoFactor(adminId: string, secret: string, backupCodes: string): Promise<void> {
    await db.update(adminUsers).set({ 
      twoFactorSecret: secret,
      backupCodes: backupCodes
    }).where(eq(adminUsers.id, adminId));
  }

  async enableAdminTwoFactor(adminId: string): Promise<void> {
    await db.update(adminUsers).set({ twoFactorEnabled: true }).where(eq(adminUsers.id, adminId));
  }

  async updateAdminLastLogin(adminId: string): Promise<void> {
    await db.update(adminUsers).set({ lastLoginAt: new Date() }).where(eq(adminUsers.id, adminId));
  }

  // Admin session methods
  async createAdminSession(adminId: string, token: string, expiresAt: Date): Promise<AdminSession> {
    const [session] = await db.insert(adminSessions).values({
      adminId,
      token,
      expiresAt
    }).returning();
    return session;
  }

  async getAdminSession(token: string): Promise<AdminSession | undefined> {
    const [session] = await db.select().from(adminSessions)
      .where(and(eq(adminSessions.token, token), gt(adminSessions.expiresAt, new Date())));
    return session;
  }

  async deleteAdminSession(token: string): Promise<void> {
    await db.delete(adminSessions).where(eq(adminSessions.token, token));
  }

  // Vault methods
  async getVaultBalance(): Promise<VaultBalance | undefined> {
    const [balance] = await db.select().from(vaultBalance).limit(1);
    return balance;
  }

  async initializeVaultBalance(): Promise<VaultBalance> {
    const existing = await this.getVaultBalance();
    if (existing) return existing;
    
    const [balance] = await db.insert(vaultBalance).values({
      totalLamports: 0,
      pendingWithdrawals: 0,
      houseEdgeAccumulated: 0
    }).returning();
    return balance;
  }

  async updateVaultBalance(amount: number, type: 'deposit' | 'withdrawal' | 'house_edge'): Promise<VaultBalance> {
    let existing = await this.getVaultBalance();
    if (!existing) {
      existing = await this.initializeVaultBalance();
    }

    let updates: Partial<VaultBalance> = { updatedAt: new Date() };
    
    if (type === 'deposit') {
      updates.totalLamports = existing.totalLamports + amount;
    } else if (type === 'withdrawal') {
      updates.totalLamports = existing.totalLamports - amount;
    } else if (type === 'house_edge') {
      updates.totalLamports = existing.totalLamports + amount;
      updates.houseEdgeAccumulated = existing.houseEdgeAccumulated + amount;
    }

    const [updated] = await db.update(vaultBalance)
      .set(updates)
      .where(eq(vaultBalance.id, existing.id))
      .returning();
    return updated;
  }

  async updateVaultHouseEdge(amount: number): Promise<VaultBalance> {
    return this.updateVaultBalance(amount, 'house_edge');
  }

  async createVaultTransaction(transaction: InsertVaultTransaction): Promise<VaultTransaction> {
    const [created] = await db.insert(vaultTransactions).values(transaction).returning();
    return created;
  }

  async getVaultTransactions(limit: number = 100): Promise<VaultTransaction[]> {
    return await db.select().from(vaultTransactions)
      .orderBy(desc(vaultTransactions.createdAt))
      .limit(limit);
  }

  // Provably fair methods
  async createProvablyFairRound(round: InsertProvablyFairRound): Promise<ProvablyFairRound> {
    const [created] = await db.insert(provablyFairRounds).values(round).returning();
    return created;
  }

  async getProvablyFairRound(id: string): Promise<ProvablyFairRound | undefined> {
    const [round] = await db.select().from(provablyFairRounds).where(eq(provablyFairRounds.id, id));
    return round;
  }

  async revealProvablyFairRound(id: string, serverSeed: string, crashMultiplier: string): Promise<ProvablyFairRound> {
    const [updated] = await db.update(provablyFairRounds).set({
      serverSeed,
      crashMultiplier,
      revealed: true,
      revealedAt: new Date()
    }).where(eq(provablyFairRounds.id, id)).returning();
    return updated;
  }

  async getRecentProvablyFairRounds(limit: number = 20): Promise<ProvablyFairRound[]> {
    return await db.select().from(provablyFairRounds)
      .where(eq(provablyFairRounds.revealed, true))
      .orderBy(desc(provablyFairRounds.createdAt))
      .limit(limit);
  }

  // Withdrawal request methods
  async createWithdrawalRequest(request: { userId: string, amountSol: string, walletAddress: string }): Promise<any> {
    const [created] = await db.insert(withdrawalRequests).values({
      userId: request.userId,
      amountSol: request.amountSol,
      walletAddress: request.walletAddress,
      status: 'pending'
    }).returning();
    return created;
  }

  async getUserWithdrawalRequests(userId: string): Promise<any[]> {
    return await db.select().from(withdrawalRequests)
      .where(eq(withdrawalRequests.userId, userId))
      .orderBy(desc(withdrawalRequests.createdAt));
  }

  async getAllPendingWithdrawalRequests(): Promise<any[]> {
    return await db.select().from(withdrawalRequests)
      .where(eq(withdrawalRequests.status, 'pending'))
      .orderBy(desc(withdrawalRequests.createdAt));
  }

  async processWithdrawalRequest(id: number, status: 'approved' | 'denied' | 'completed', adminNotes?: string, solSignature?: string): Promise<any> {
    const [updated] = await db.update(withdrawalRequests).set({
      status,
      adminNotes,
      solSignature,
      processedAt: new Date()
    }).where(eq(withdrawalRequests.id, id)).returning();
    return updated;
  }
}

export const storage = new DbStorage();
