import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage, DEFAULT_AVATARS } from "./storage";
import { insertGameSchema, updateProfileSchema } from "@shared/schema";
import { z } from "zod";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { authenticator } from "otplib";
import * as QRCode from "qrcode";
import { createNewRound, hashServerSeed, calculateCrashPoint, getVerificationData } from "./provably-fair";
import { getVaultAddress, getVaultBalance, sendPayout, isVaultConfigured } from "./vault";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";

const HOUSE_EDGE = 0.025;
const LAMPORTS_PER_SOL = 1_000_000_000;

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // For now, we'll use a single demo user (no auth)
  // In production, you'd use proper session-based auth
  
  // Helper to get demo user
  const getDemoUser = async () => {
    let user = await storage.getUserByUsername("demo");
    if (!user) {
      user = await storage.createUser({
        username: "demo",
        password: "demo"
      });
    }
    return user;
  };

  // Get user stats
  app.get("/api/user/stats", async (req, res) => {
    try {
      const user = await getDemoUser();
      const stats = await storage.getGameStats(user.id);
      
      res.json({
        balance: user.balance,
        realBalance: user.realBalance,
        soliixCoins: user.balance,
        gameMode: user.gameMode,
        baseBet: user.baseBet,
        stopLoss: user.stopLoss,
        autoBetEnabled: user.autoBetEnabled,
        ...stats
      });
    } catch (error) {
      console.error("Error fetching user stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Update user config
  app.post("/api/user/config", async (req, res) => {
    try {
      const user = await getDemoUser();
      const configSchema = z.object({
        baseBet: z.string(),
        stopLoss: z.string(),
        autoBetEnabled: z.boolean()
      });
      
      const config = configSchema.parse(req.body);
      await storage.updateUserConfig(user.id, config);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating config:", error);
      res.status(500).json({ error: "Failed to update config" });
    }
  });

  // Create a new game - server-side provably fair resolution
  app.post("/api/games", async (req, res) => {
    try {
      const user = await getDemoUser();
      
      const inputSchema = z.object({
        bet: z.string(),
        targetMultiplier: z.string(),
        mode: z.enum(['Manual', 'Auto']),
        clientSeed: z.string().optional()
      });
      
      const { bet, targetMultiplier, mode, clientSeed } = inputSchema.parse(req.body);
      const betAmount = parseFloat(bet);
      const target = parseFloat(targetMultiplier);
      
      const isRealMode = user.gameMode === 'real';
      const currentBalance = isRealMode ? parseFloat(user.realBalance || '0') : parseFloat(user.balance);
      
      const MIN_BET = 0.0001;
      if (betAmount < MIN_BET || betAmount > currentBalance || isNaN(betAmount)) {
        return res.status(400).json({ error: `Invalid bet amount. Minimum bet is ${MIN_BET} SOL` });
      }
      
      const round = createNewRound(clientSeed);
      
      const savedRound = await storage.createProvablyFairRound({
        serverSeedHash: round.serverSeedHash,
        serverSeed: round.serverSeed,
        clientSeed: round.clientSeed,
        crashMultiplier: round.crashPoint.toFixed(2),
        revealed: false
      });
      
      const crashPoint = round.crashPoint;
      const won = target <= crashPoint;
      
      let profit: number;
      let newBalance: number;
      
      if (won) {
        // Apply 2.5% house edge to winnings
        const grossProfit = betAmount * (target - 1);
        const houseEdgeCut = grossProfit * HOUSE_EDGE;
        profit = grossProfit - houseEdgeCut;
        newBalance = currentBalance + profit;
      } else {
        profit = -betAmount;
        newBalance = currentBalance - betAmount;
      }
      
      // House edge is calculated on the gross profit for wins
      const houseEdgeAmount = won 
        ? Math.floor(betAmount * (target - 1) * HOUSE_EDGE * LAMPORTS_PER_SOL)
        : 0;
      
      const gameData = {
        userId: user.id,
        crash: crashPoint.toFixed(2),
        result: won ? 'Won' : 'Lost',
        profit: profit.toFixed(9),
        bet: betAmount.toFixed(9),
        balance: newBalance.toFixed(9),
        mode,
        gameMode: isRealMode ? 'real' : 'demo',
        targetMultiplier: target.toFixed(2)
      };
      
      const game = await storage.createGame(gameData);
      
      if (isRealMode) {
        await storage.updateUserRealBalance(user.id, newBalance.toFixed(9));
      } else {
        await storage.updateUserBalance(user.id, newBalance.toFixed(9));
      }
      
      await storage.revealProvablyFairRound(savedRound.id, round.serverSeed, crashPoint.toFixed(2));
      
      try {
        let vaultBalance = await storage.getVaultBalance();
        if (!vaultBalance) {
          vaultBalance = await storage.initializeVaultBalance();
        }
        
        if (!won) {
          await storage.createVaultTransaction({
            type: 'player_loss',
            amountLamports: Math.floor(betAmount * LAMPORTS_PER_SOL),
            status: 'completed',
            metadata: { gameId: game.id, crashPoint }
          });
          await storage.updateVaultBalance(Math.floor(betAmount * LAMPORTS_PER_SOL), 'deposit');
        } else {
          await storage.createVaultTransaction({
            type: 'player_win',
            amountLamports: Math.floor(profit * LAMPORTS_PER_SOL),
            status: 'completed',
            metadata: { gameId: game.id, crashPoint }
          });
          await storage.updateVaultBalance(Math.floor(profit * LAMPORTS_PER_SOL), 'withdrawal');
        }
        
        if (houseEdgeAmount > 0) {
          await storage.updateVaultHouseEdge(houseEdgeAmount);
        }
      } catch (vaultError) {
        console.error("Vault update error (non-fatal):", vaultError);
      }
      
      res.json({
        ...game,
        provablyFair: {
          roundId: savedRound.id,
          serverSeedHash: round.serverSeedHash,
          clientSeed: round.clientSeed,
          nonce: savedRound.nonce,
          crashPoint
        }
      });
    } catch (error) {
      console.error("Error creating game:", error);
      res.status(500).json({ error: "Failed to create game" });
    }
  });

  // Get game history
  app.get("/api/games", async (req, res) => {
    try {
      const user = await getDemoUser();
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const gameHistory = await storage.getUserGames(user.id, limit);
      res.json(gameHistory);
    } catch (error) {
      console.error("Error fetching games:", error);
      res.status(500).json({ error: "Failed to fetch games" });
    }
  });

  // Get user profile
  app.get("/api/user/profile", async (req, res) => {
    try {
      const user = await getDemoUser();
      res.json({
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        walletAddress: user.walletAddress,
        xHandle: user.xHandle,
        tiktokHandle: user.tiktokHandle,
        telegramHandle: user.telegramHandle,
        email: user.email,
        discordHandle: user.discordHandle,
      });
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  // Get default avatars list
  app.get("/api/avatars/default", (req, res) => {
    res.json({ avatars: DEFAULT_AVATARS });
  });

  // Update user profile
  app.post("/api/user/profile", async (req, res) => {
    try {
      const user = await getDemoUser();
      const profileData = updateProfileSchema.parse(req.body);
      const updated = await storage.updateUserProfile(user.id, profileData);
      res.json({
        id: updated.id,
        username: updated.username,
        displayName: updated.displayName,
        avatarUrl: updated.avatarUrl,
        walletAddress: updated.walletAddress,
        xHandle: updated.xHandle,
        tiktokHandle: updated.tiktokHandle,
        telegramHandle: updated.telegramHandle,
        email: updated.email,
        discordHandle: updated.discordHandle,
      });
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  // ============================================
  // GAME MODE & DEPOSIT ROUTES
  // ============================================

  // Use dynamic vault address from env, or fallback to new vault
  const VAULT_ADDRESS = getVaultAddress() || 'H9ecbrX7Wawm1URVCWvvmUZFrWBnv5Zx1PnDzjb7DYbW';

  // Toggle game mode (demo/real)
  app.post("/api/user/game-mode", async (req, res) => {
    try {
      const user = await getDemoUser();
      const schema = z.object({
        gameMode: z.enum(['demo', 'real'])
      });
      
      const { gameMode } = schema.parse(req.body);
      
      if (gameMode === 'real') {
        const realBalance = parseFloat(user.realBalance || '0');
        if (realBalance <= 0) {
          return res.status(400).json({ 
            error: "No real SOL balance. Deposit SOL to the vault to play in real mode.",
            vaultAddress: VAULT_ADDRESS
          });
        }
      }
      
      await storage.updateUserGameMode(user.id, gameMode);
      
      // Get fresh user data after mode change
      const updatedUser = await storage.getUser(user.id);
      
      res.json({ 
        success: true, 
        gameMode,
        balance: gameMode === 'real' ? (updatedUser?.realBalance || '0') : (updatedUser?.balance || '0'),
        realBalance: updatedUser?.realBalance || '0',
        demoBalance: updatedUser?.balance || '0'
      });
    } catch (error) {
      console.error("Error updating game mode:", error);
      res.status(500).json({ error: "Failed to update game mode" });
    }
  });

  // Get vault deposit address and info
  app.get("/api/vault/address", async (req, res) => {
    const balance = await getVaultBalance();
    res.json({ 
      address: VAULT_ADDRESS,
      balance,
      configured: !!process.env.VAULT_PRIVATE_KEY
    });
  });

  // Submit withdrawal request (ticket system)
  app.post("/api/withdraw", async (req, res) => {
    try {
      const user = await getDemoUser();
      const schema = z.object({
        amount: z.number().positive(),
        walletAddress: z.string()
      });
      
      const { amount, walletAddress } = schema.parse(req.body);
      
      // Verify user has this wallet linked
      if (user.walletAddress !== walletAddress) {
        return res.status(400).json({ error: "Wallet address does not match linked wallet" });
      }
      
      // Check user has enough real SOL balance (only real deposited SOL can be withdrawn)
      // Soliix Coins (demo balance) cannot be withdrawn
      const realBalance = parseFloat(user.realBalance || '0');
      
      if (amount > realBalance) {
        if (realBalance <= 0) {
          return res.status(400).json({ 
            error: "No SOL to withdraw. Deposit real SOL first to play and win." 
          });
        }
        return res.status(400).json({ 
          error: `Insufficient balance. You can withdraw up to ${realBalance.toFixed(4)} SOL.` 
        });
      }
      
      // Create withdrawal request (ticket)
      const request = await storage.createWithdrawalRequest({
        userId: user.id,
        amountSol: amount.toFixed(9),
        walletAddress
      });
      
      // Deduct from user's real balance (held pending)
      const newBalance = (realBalance - amount).toFixed(9);
      await storage.updateUserRealBalance(user.id, newBalance);
      
      res.json({
        success: true,
        message: "Withdrawal request submitted. Awaiting admin approval.",
        requestId: request.id,
        amount,
        newBalance
      });
    } catch (error: any) {
      console.error("Withdrawal request error:", error);
      res.status(500).json({ error: error.message || "Withdrawal request failed" });
    }
  });

  // Get user's withdrawal requests
  app.get("/api/withdrawals", async (req, res) => {
    try {
      const user = await getDemoUser();
      const requests = await storage.getUserWithdrawalRequests(user.id);
      res.json(requests);
    } catch (error: any) {
      console.error("Error fetching withdrawals:", error);
      res.status(500).json({ error: "Failed to fetch withdrawal requests" });
    }
  });

  // Check for deposits and credit user balance
  app.post("/api/deposits/check", async (req, res) => {
    try {
      const user = await getDemoUser();
      const schema = z.object({
        walletAddress: z.string()
      });
      
      const { walletAddress } = schema.parse(req.body);
      
      // Verify user has this wallet linked
      if (user.walletAddress !== walletAddress) {
        // Link the wallet if not already linked
        await storage.updateUserProfile(user.id, { walletAddress });
      }
      
      const RPC_ENDPOINTS = [
        'https://api.mainnet-beta.solana.com',
        'https://rpc.ankr.com/solana',
        'https://solana-mainnet.g.alchemy.com/v2/demo'
      ];

      let signatures: any[] = [];
      
      console.log(`[DEPOSIT CHECK] Checking deposits for wallet ${walletAddress}`);
      
      for (const endpoint of RPC_ENDPOINTS) {
        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'getSignaturesForAddress',
              params: [VAULT_ADDRESS, { limit: 100, commitment: 'confirmed' }]
            })
          });
          
          const data = await response.json();
          if (data.result && data.result.length > 0) {
            signatures = data.result;
            console.log(`[DEPOSIT CHECK] Found ${signatures.length} vault transactions via ${endpoint}`);
            break;
          }
        } catch (e) {
          console.log(`[DEPOSIT CHECK] RPC ${endpoint} failed:`, e);
          continue;
        }
      }

      let newDeposits = 0;
      let totalNewSol = 0;

      for (const sig of signatures) {
        const existing = await storage.getDepositBySignature(sig.signature);
        if (existing) {
          continue;
        }
        
        console.log(`[DEPOSIT CHECK] Processing new signature: ${sig.signature.slice(0, 20)}...`);
        
        for (const endpoint of RPC_ENDPOINTS) {
          try {
            const txResponse = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getTransaction',
                params: [sig.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]
              })
            });
            
            const txData = await txResponse.json();
            if (!txData.result) {
              console.log(`[DEPOSIT CHECK] No result for ${sig.signature.slice(0, 20)}... from ${endpoint}`);
              continue;
            }
            
            const tx = txData.result;
            const instructions = tx.transaction?.message?.instructions || [];
            
            for (const ix of instructions) {
              // Verify this is a SOL transfer TO the vault FROM the user's wallet
              const isTransfer = ix.parsed?.type === 'transfer';
              const toVault = ix.parsed?.info?.destination === VAULT_ADDRESS;
              const fromUser = ix.parsed?.info?.source === walletAddress;
              
              console.log(`[DEPOSIT CHECK] Instruction: transfer=${isTransfer}, toVault=${toVault}, fromUser=${fromUser}, source=${ix.parsed?.info?.source?.slice(0,8)}, dest=${ix.parsed?.info?.destination?.slice(0,8)}`);
              
              if (isTransfer && toVault && fromUser) {
                
                const lamports = ix.parsed.info.lamports;
                
                // Validate amount is positive and reasonable
                if (lamports <= 0 || lamports > 1000 * LAMPORTS_PER_SOL) continue;
                
                const solAmount = lamports / LAMPORTS_PER_SOL;
                
                // Get fresh user data for balance update
                const freshUser = await storage.getUser(user.id);
                if (!freshUser) continue;
                
                await storage.createDeposit(
                  user.id,
                  sig.signature,
                  lamports,
                  solAmount.toFixed(9),
                  walletAddress
                );
                
                const currentRealBalance = parseFloat(freshUser.realBalance || '0');
                const newRealBalance = currentRealBalance + solAmount;
                await storage.updateUserRealBalance(user.id, newRealBalance.toFixed(9));
                
                newDeposits++;
                totalNewSol += solAmount;
                
                await storage.createVaultTransaction({
                  type: 'deposit',
                  amountLamports: lamports,
                  status: 'completed',
                  metadata: { 
                    signature: sig.signature, 
                    fromAddress: walletAddress,
                    userId: user.id
                  }
                });
                
                let vaultBalance = await storage.getVaultBalance();
                if (!vaultBalance) {
                  vaultBalance = await storage.initializeVaultBalance();
                }
                await storage.updateVaultBalance(lamports, 'deposit');
              }
            }
            
            break;
          } catch (e) {
            continue;
          }
        }
      }

      // Get fresh user data with updated balance
      const updatedUser = await storage.getUser(user.id);
      
      res.json({
        success: true,
        newDeposits,
        totalNewSol,
        realBalance: updatedUser?.realBalance || '0',
        message: newDeposits > 0 
          ? `Found ${newDeposits} new deposit(s) totaling ${totalNewSol.toFixed(4)} SOL`
          : 'No new deposits found'
      });
    } catch (error) {
      console.error("Error checking deposits:", error);
      res.status(500).json({ error: "Failed to check deposits" });
    }
  });

  // Get user deposits history
  app.get("/api/deposits", async (req, res) => {
    try {
      const user = await getDemoUser();
      const deposits = await storage.getUserDeposits(user.id);
      res.json(deposits);
    } catch (error) {
      console.error("Error fetching deposits:", error);
      res.status(500).json({ error: "Failed to fetch deposits" });
    }
  });

  // Credit a direct deposit (user-initiated from frontend)
  app.post("/api/deposits/credit", async (req, res) => {
    try {
      const user = await getDemoUser();
      const schema = z.object({
        walletAddress: z.string(),
        signature: z.string(),
        amount: z.string(),
        lamports: z.number()
      });
      
      const { walletAddress, signature, amount, lamports } = schema.parse(req.body);
      
      console.log(`[DIRECT DEPOSIT] Processing: ${amount} SOL from ${walletAddress.slice(0, 8)}...`);
      
      // Check if this signature was already processed
      const existing = await storage.getDepositBySignature(signature);
      if (existing) {
        return res.status(400).json({ error: 'This deposit was already credited' });
      }
      
      // Verify the transaction on-chain
      const RPC_ENDPOINTS = [
        'https://api.mainnet-beta.solana.com',
        'https://rpc.ankr.com/solana'
      ];
      
      let verified = false;
      for (const endpoint of RPC_ENDPOINTS) {
        try {
          const txResponse = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'getTransaction',
              params: [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]
            })
          });
          
          const txData = await txResponse.json();
          if (txData.result) {
            const instructions = txData.result.transaction?.message?.instructions || [];
            for (const ix of instructions) {
              if (ix.parsed?.type === 'transfer' &&
                  ix.parsed.info?.destination === VAULT_ADDRESS &&
                  ix.parsed.info?.source === walletAddress &&
                  ix.parsed.info?.lamports === lamports) {
                verified = true;
                break;
              }
            }
          }
          if (verified) break;
        } catch (e) {
          continue;
        }
      }
      
      if (!verified) {
        console.log(`[DIRECT DEPOSIT] Verification failed for ${signature}`);
        return res.status(400).json({ error: 'Could not verify transaction. Please use "Check for Deposits" to manually verify.' });
      }
      
      // Link wallet if needed
      if (user.walletAddress !== walletAddress) {
        await storage.updateUserProfile(user.id, { walletAddress });
      }
      
      const solAmount = parseFloat(amount);
      
      // Create deposit record
      await storage.createDeposit(
        user.id,
        signature,
        lamports,
        solAmount.toFixed(9),
        walletAddress
      );
      
      // Update user balance
      const currentRealBalance = parseFloat(user.realBalance || '0');
      const newRealBalance = currentRealBalance + solAmount;
      await storage.updateUserRealBalance(user.id, newRealBalance.toFixed(9));
      
      // Record vault transaction
      await storage.createVaultTransaction({
        type: 'deposit',
        amountLamports: lamports,
        status: 'completed',
        metadata: { 
          signature,
          fromAddress: walletAddress,
          userId: user.id,
          direct: true
        }
      });
      
      // Update vault balance
      let vaultBalance = await storage.getVaultBalance();
      if (!vaultBalance) {
        vaultBalance = await storage.initializeVaultBalance();
      }
      await storage.updateVaultBalance(lamports, 'deposit');
      
      console.log(`[DIRECT DEPOSIT] Success! ${solAmount} SOL credited to user`);
      
      res.json({
        success: true,
        realBalance: newRealBalance.toFixed(9),
        message: `Successfully deposited ${solAmount.toFixed(4)} SOL`
      });
    } catch (error) {
      console.error("Error crediting deposit:", error);
      res.status(500).json({ error: "Failed to credit deposit" });
    }
  });

  // ============================================
  // ADMIN AUTHENTICATION ROUTES
  // ============================================
  
  const adminAuthMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const session = await storage.getAdminSession(token);
    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }
    
    const admin = await storage.getAdminById(session.adminId);
    if (!admin) {
      return res.status(401).json({ error: 'Admin not found' });
    }
    
    (req as any).admin = admin;
    next();
  };

  // Admin registration (first admin only, or requires existing admin)
  app.post("/api/admin/register", async (req, res) => {
    try {
      const schema = z.object({
        email: z.string().email(),
        password: z.string().min(8),
        role: z.enum(['owner', 'operator']).default('operator')
      });
      
      const { email, password, role } = schema.parse(req.body);
      
      const existing = await storage.getAdminByEmail(email);
      if (existing) {
        return res.status(400).json({ error: 'Admin already exists' });
      }
      
      const passwordHash = await bcrypt.hash(password, 12);
      const admin = await storage.createAdmin({
        email,
        passwordHash,
        role
      });
      
      res.json({ success: true, adminId: admin.id });
    } catch (error) {
      console.error("Error registering admin:", error);
      res.status(500).json({ error: "Failed to register admin" });
    }
  });

  // Admin login
  app.post("/api/admin/login", async (req, res) => {
    try {
      const schema = z.object({
        email: z.string().email(),
        password: z.string(),
        totpCode: z.string().optional()
      });
      
      const { email, password, totpCode } = schema.parse(req.body);
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      const validPassword = await bcrypt.compare(password, admin.passwordHash);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      if (admin.twoFactorEnabled) {
        if (!totpCode) {
          return res.status(200).json({ requiresTwoFactor: true });
        }
        
        if (!admin.twoFactorSecret) {
          return res.status(500).json({ error: '2FA not properly configured' });
        }
        
        const validTotp = authenticator.verify({ token: totpCode, secret: admin.twoFactorSecret });
        if (!validTotp) {
          return res.status(401).json({ error: 'Invalid 2FA code' });
        }
      }
      
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      
      await storage.createAdminSession(admin.id, token, expiresAt);
      await storage.updateAdminLastLogin(admin.id);
      
      res.json({
        token,
        admin: {
          id: admin.id,
          email: admin.email,
          role: admin.role,
          twoFactorEnabled: admin.twoFactorEnabled
        }
      });
    } catch (error) {
      console.error("Error logging in admin:", error);
      res.status(500).json({ error: "Failed to login" });
    }
  });

  // Admin logout
  app.post("/api/admin/logout", adminAuthMiddleware, async (req, res) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (token) {
        await storage.deleteAdminSession(token);
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to logout" });
    }
  });

  // Setup 2FA
  app.post("/api/admin/2fa/setup", adminAuthMiddleware, async (req, res) => {
    try {
      const admin = (req as any).admin;
      
      const secret = authenticator.generateSecret();
      const backupCodes = Array.from({ length: 8 }, () => 
        crypto.randomBytes(4).toString('hex').toUpperCase()
      );
      
      const otpauthUrl = authenticator.keyuri(admin.email, 'SOLSTAx Admin', secret);
      const qrCode = await QRCode.toDataURL(otpauthUrl);
      
      await storage.updateAdminTwoFactor(admin.id, secret, JSON.stringify(backupCodes));
      
      res.json({
        secret,
        qrCode,
        backupCodes
      });
    } catch (error) {
      console.error("Error setting up 2FA:", error);
      res.status(500).json({ error: "Failed to setup 2FA" });
    }
  });

  // Verify and enable 2FA
  app.post("/api/admin/2fa/verify", adminAuthMiddleware, async (req, res) => {
    try {
      const admin = (req as any).admin;
      const { code } = z.object({ code: z.string() }).parse(req.body);
      
      if (!admin.twoFactorSecret) {
        return res.status(400).json({ error: '2FA not setup' });
      }
      
      const valid = authenticator.verify({ token: code, secret: admin.twoFactorSecret });
      if (!valid) {
        return res.status(400).json({ error: 'Invalid code' });
      }
      
      await storage.enableAdminTwoFactor(admin.id);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error verifying 2FA:", error);
      res.status(500).json({ error: "Failed to verify 2FA" });
    }
  });

  // Get admin profile
  app.get("/api/admin/profile", adminAuthMiddleware, async (req, res) => {
    const admin = (req as any).admin;
    res.json({
      id: admin.id,
      email: admin.email,
      role: admin.role,
      twoFactorEnabled: admin.twoFactorEnabled,
      lastLoginAt: admin.lastLoginAt
    });
  });

  // ============================================
  // VAULT ROUTES
  // ============================================

  // Get vault balance
  app.get("/api/admin/vault/balance", adminAuthMiddleware, async (req, res) => {
    try {
      let balance = await storage.getVaultBalance();
      if (!balance) {
        balance = await storage.initializeVaultBalance();
      }
      
      res.json({
        walletAddress: balance.walletAddress,
        totalSol: balance.totalLamports / LAMPORTS_PER_SOL,
        totalLamports: balance.totalLamports,
        pendingWithdrawals: balance.pendingWithdrawals / LAMPORTS_PER_SOL,
        houseEdgeAccumulated: balance.houseEdgeAccumulated / LAMPORTS_PER_SOL,
        updatedAt: balance.updatedAt
      });
    } catch (error) {
      console.error("Error fetching vault balance:", error);
      res.status(500).json({ error: "Failed to fetch vault balance" });
    }
  });

  // Get vault transactions
  app.get("/api/admin/vault/transactions", adminAuthMiddleware, async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const transactions = await storage.getVaultTransactions(limit);
      
      res.json(transactions.map(t => ({
        ...t,
        amountSol: t.amountLamports / LAMPORTS_PER_SOL
      })));
    } catch (error) {
      console.error("Error fetching vault transactions:", error);
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  // Manual deposit to vault (admin loads funds)
  app.post("/api/admin/vault/deposit", adminAuthMiddleware, async (req, res) => {
    try {
      const admin = (req as any).admin;
      const { amountSol, solSignature } = z.object({
        amountSol: z.number().positive(),
        solSignature: z.string().optional()
      }).parse(req.body);
      
      const amountLamports = Math.floor(amountSol * LAMPORTS_PER_SOL);
      
      await storage.createVaultTransaction({
        adminId: admin.id,
        type: 'deposit',
        amountLamports,
        solSignature: solSignature || null,
        status: 'completed',
        metadata: { source: 'manual_deposit' }
      });
      
      const balance = await storage.updateVaultBalance(amountLamports, 'deposit');
      
      res.json({
        success: true,
        newBalance: balance.totalLamports / LAMPORTS_PER_SOL
      });
    } catch (error) {
      console.error("Error depositing to vault:", error);
      res.status(500).json({ error: "Failed to deposit" });
    }
  });

  // Withdraw from vault (requires 2FA)
  app.post("/api/admin/vault/withdraw", adminAuthMiddleware, async (req, res) => {
    try {
      const admin = (req as any).admin;
      
      if (!admin.twoFactorEnabled) {
        return res.status(400).json({ error: '2FA must be enabled to withdraw' });
      }
      
      const { amountSol, totpCode, destinationWallet } = z.object({
        amountSol: z.number().positive(),
        totpCode: z.string(),
        destinationWallet: z.string()
      }).parse(req.body);
      
      const valid = authenticator.verify({ token: totpCode, secret: admin.twoFactorSecret! });
      if (!valid) {
        return res.status(401).json({ error: 'Invalid 2FA code' });
      }
      
      const amountLamports = Math.floor(amountSol * LAMPORTS_PER_SOL);
      
      const vaultBal = await storage.getVaultBalance();
      if (!vaultBal || vaultBal.totalLamports < amountLamports) {
        return res.status(400).json({ error: 'Insufficient vault balance' });
      }
      
      await storage.createVaultTransaction({
        adminId: admin.id,
        type: 'withdrawal',
        amountLamports,
        status: 'pending',
        metadata: { destinationWallet }
      });
      
      const balance = await storage.updateVaultBalance(amountLamports, 'withdrawal');
      
      res.json({
        success: true,
        message: 'Withdrawal initiated',
        newBalance: balance.totalLamports / LAMPORTS_PER_SOL
      });
    } catch (error) {
      console.error("Error withdrawing from vault:", error);
      res.status(500).json({ error: "Failed to withdraw" });
    }
  });

  // ============================================
  // PROVABLY FAIR ROUTES
  // ============================================

  // Get current round info (hash only, seed hidden)
  app.get("/api/provably-fair/current", async (req, res) => {
    try {
      const round = createNewRound();
      
      const savedRound = await storage.createProvablyFairRound({
        serverSeedHash: round.serverSeedHash,
        serverSeed: round.serverSeed,
        clientSeed: round.clientSeed,
        crashMultiplier: round.crashPoint.toString(),
        revealed: false
      });
      
      res.json({
        roundId: savedRound.id,
        serverSeedHash: savedRound.serverSeedHash,
        clientSeed: savedRound.clientSeed,
        nonce: savedRound.nonce
      });
    } catch (error) {
      console.error("Error creating round:", error);
      res.status(500).json({ error: "Failed to create round" });
    }
  });

  // Reveal round (after crash)
  app.post("/api/provably-fair/reveal/:roundId", async (req, res) => {
    try {
      const { roundId } = req.params;
      const round = await storage.getProvablyFairRound(roundId);
      
      if (!round) {
        return res.status(404).json({ error: 'Round not found' });
      }
      
      if (round.revealed) {
        return res.json({
          serverSeed: round.serverSeed,
          serverSeedHash: round.serverSeedHash,
          clientSeed: round.clientSeed,
          nonce: round.nonce,
          crashMultiplier: round.crashMultiplier,
          revealed: true
        });
      }
      
      const revealed = await storage.revealProvablyFairRound(
        roundId, 
        round.serverSeed!, 
        round.crashMultiplier!
      );
      
      res.json({
        serverSeed: revealed.serverSeed,
        serverSeedHash: revealed.serverSeedHash,
        clientSeed: revealed.clientSeed,
        nonce: revealed.nonce,
        crashMultiplier: revealed.crashMultiplier,
        revealed: true
      });
    } catch (error) {
      console.error("Error revealing round:", error);
      res.status(500).json({ error: "Failed to reveal round" });
    }
  });

  // Verify a round
  app.post("/api/provably-fair/verify", async (req, res) => {
    try {
      const { serverSeed, clientSeed, nonce } = z.object({
        serverSeed: z.string(),
        clientSeed: z.string(),
        nonce: z.number()
      }).parse(req.body);
      
      const hash = hashServerSeed(serverSeed);
      const crashPoint = calculateCrashPoint(serverSeed, clientSeed, nonce);
      
      res.json({
        serverSeedHash: hash,
        crashPoint,
        verified: true
      });
    } catch (error) {
      console.error("Error verifying round:", error);
      res.status(500).json({ error: "Failed to verify round" });
    }
  });

  // Get recent revealed rounds
  app.get("/api/provably-fair/history", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const rounds = await storage.getRecentProvablyFairRounds(limit);
      
      res.json(rounds.map(r => ({
        id: r.id,
        serverSeedHash: r.serverSeedHash,
        serverSeed: r.serverSeed,
        clientSeed: r.clientSeed,
        nonce: r.nonce,
        crashMultiplier: r.crashMultiplier,
        revealedAt: r.revealedAt
      })));
    } catch (error) {
      console.error("Error fetching history:", error);
      res.status(500).json({ error: "Failed to fetch history" });
    }
  });

  // Fetch Solana wallet balance via server-side RPC call
  app.get("/api/wallet/:address/balance", async (req, res) => {
    try {
      const { address } = req.params;
      
      // Validate address format (basic check for Solana base58 addresses)
      if (!address || address.length < 32 || address.length > 44) {
        return res.status(400).json({ error: "Invalid wallet address" });
      }
      
      // Try multiple RPC endpoints from server-side (avoids browser CORS issues)
      // Using reliable public endpoints with rate limits
      const rpcEndpoints = [
        'https://api.mainnet-beta.solana.com',
        'https://solana-api.projectserum.com',
        'https://rpc.ankr.com/solana',
        'https://solana.public-rpc.com',
      ];
      
      let balance: number | null = null;
      let lastError: string = '';
      
      for (const endpoint of rpcEndpoints) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
          
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'getBalance',
              params: [address]
            }),
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          if (response.ok) {
            const data = await response.json();
            if (data.result && typeof data.result.value === 'number') {
              balance = data.result.value / LAMPORTS_PER_SOL;
              console.log(`[WALLET] Balance fetched for ${address.slice(0, 8)}...: ${balance} SOL via ${endpoint}`);
              break;
            } else if (data.error) {
              lastError = data.error.message || 'RPC error';
            }
          } else {
            lastError = `HTTP ${response.status}`;
          }
        } catch (e: any) {
          if (e.name === 'AbortError') {
            lastError = 'Request timeout';
          } else {
            lastError = e.message || 'Unknown error';
          }
          console.log(`[WALLET] RPC ${endpoint} failed: ${lastError}`);
        }
      }
      
      if (balance !== null) {
        res.json({ balance, address, success: true });
      } else {
        console.log(`[WALLET] All RPC endpoints failed for ${address}. Last error: ${lastError}`);
        res.status(503).json({ 
          error: "Unable to fetch balance from Solana network", 
          details: lastError,
          success: false 
        });
      }
    } catch (error: any) {
      console.error("[WALLET] Error fetching wallet balance:", error);
      res.status(500).json({ error: "Failed to fetch wallet balance", success: false });
    }
  });

  // Get recent blockhash for transactions (server-side to bypass CORS)
  app.get("/api/solana/blockhash", async (req, res) => {
    try {
      const rpcEndpoints = [
        'https://api.mainnet-beta.solana.com',
        'https://solana-api.projectserum.com',
        'https://rpc.ankr.com/solana',
      ];
      
      for (const endpoint of rpcEndpoints) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);
          
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'getLatestBlockhash',
              params: [{ commitment: 'confirmed' }]
            }),
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          if (response.ok) {
            const data = await response.json();
            if (data.result?.value) {
              console.log(`[SOLANA] Got blockhash from ${endpoint}`);
              return res.json({
                blockhash: data.result.value.blockhash,
                lastValidBlockHeight: data.result.value.lastValidBlockHeight,
                success: true
              });
            }
          }
        } catch (e: any) {
          console.log(`[SOLANA] RPC ${endpoint} failed: ${e.message}`);
        }
      }
      
      res.status(503).json({ error: "Unable to get blockhash", success: false });
    } catch (error: any) {
      console.error("[SOLANA] Error getting blockhash:", error);
      res.status(500).json({ error: "Failed to get blockhash", success: false });
    }
  });

  // ============================================
  // COIN PACKS - Buy Soliix Coins with USD
  // ============================================

  const COIN_PACKS = [
    { id: 'pack_starter', name: 'Starter Pack', coins: 10, price: 499, popular: false },
    { id: 'pack_value', name: 'Value Pack', coins: 50, price: 1999, popular: true },
    { id: 'pack_pro', name: 'Pro Pack', coins: 150, price: 4999, popular: false },
    { id: 'pack_whale', name: 'Whale Pack', coins: 500, price: 14999, popular: false },
  ];

  app.get("/api/coin-packs", async (req, res) => {
    res.json({ packs: COIN_PACKS });
  });

  app.post("/api/coin-packs/checkout", async (req, res) => {
    try {
      console.log("[CHECKOUT] Starting checkout process...");
      const user = await getDemoUser();
      const { packId } = z.object({ packId: z.string() }).parse(req.body);
      console.log("[CHECKOUT] Pack ID:", packId, "User ID:", user.id);
      
      const pack = COIN_PACKS.find(p => p.id === packId);
      if (!pack) {
        console.log("[CHECKOUT] Invalid pack ID");
        return res.status(400).json({ error: "Invalid pack" });
      }

      console.log("[CHECKOUT] Getting Stripe client...");
      const stripe = await getUncachableStripeClient();
      console.log("[CHECKOUT] Stripe client obtained, creating session...");
      
      const baseUrl = process.env.REPLIT_DOMAINS 
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : `${req.protocol}://${req.get('host')}`;
      
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${pack.name} - ${pack.coins} Soliix Coins`,
              description: `Get ${pack.coins} Soliix Coins to play SOLSTAx`,
            },
            unit_amount: pack.price,
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${baseUrl}/?coins_purchased=${pack.coins}`,
        cancel_url: `${baseUrl}/?coins_cancelled=true`,
        metadata: {
          userId: user.id,
          packId: pack.id,
          coinAmount: pack.coins.toString(),
        },
      });

      console.log("[CHECKOUT] Session created:", session.id, "URL:", session.url);
      res.json({ url: session.url });
    } catch (error: any) {
      console.error("[CHECKOUT] Error:", error.message);
      console.error("[CHECKOUT] Full error:", error);
      res.status(500).json({ error: "Failed to create checkout session: " + error.message });
    }
  });

  app.post("/api/coin-packs/credit", async (req, res) => {
    try {
      const user = await getDemoUser();
      const { coins } = z.object({ coins: z.number().positive() }).parse(req.body);
      
      const currentBalance = parseFloat(user.balance || '0');
      const newBalance = (currentBalance + coins).toFixed(9);
      await storage.updateUserBalance(user.id, newBalance);
      
      res.json({ 
        success: true, 
        newBalance,
        credited: coins 
      });
    } catch (error: any) {
      console.error("Credit coins error:", error);
      res.status(500).json({ error: "Failed to credit coins" });
    }
  });

  app.get("/api/stripe/publishable-key", async (req, res) => {
    try {
      const key = await getStripePublishableKey();
      res.json({ publishableKey: key });
    } catch (error: any) {
      console.error("Error getting Stripe key:", error);
      res.status(500).json({ error: "Stripe not configured" });
    }
  });

  return httpServer;
}
