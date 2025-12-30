import { Game } from '@shared/schema';

export type UserStats = {
  balance: string;
  realBalance: string;
  gameMode: 'demo' | 'real';
  baseBet: string;
  stopLoss: string;
  autoBetEnabled: boolean;
  totalGames: number;
  wins: number;
  losses: number;
};

export type CreateGameRequest = {
  bet: string;
  targetMultiplier: string;
  mode: 'Manual' | 'Auto';
  clientSeed?: string;
};

export type GameResult = Game & {
  provablyFair?: {
    roundId: string;
    serverSeedHash: string;
    clientSeed: string;
    nonce: number;
    crashPoint: number;
  };
};

export async function getUserStats(): Promise<UserStats> {
  const res = await fetch('/api/user/stats');
  if (!res.ok) throw new Error('Failed to fetch user stats');
  return res.json();
}

export async function updateUserConfig(config: { baseBet: string, stopLoss: string, autoBetEnabled: boolean }) {
  const res = await fetch('/api/user/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  });
  if (!res.ok) throw new Error('Failed to update config');
  return res.json();
}

export async function createGame(game: CreateGameRequest): Promise<GameResult> {
  const res = await fetch('/api/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(game)
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to create game');
  }
  return res.json();
}

export async function getGameHistory(limit: number = 50): Promise<Game[]> {
  const res = await fetch(`/api/games?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch game history');
  return res.json();
}

export type UserProfile = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  walletAddress: string | null;
  xHandle: string | null;
  tiktokHandle: string | null;
  telegramHandle: string | null;
  email: string | null;
  discordHandle: string | null;
};

export type UpdateProfileRequest = {
  displayName?: string;
  avatarUrl?: string;
  walletAddress?: string;
  xHandle?: string;
  tiktokHandle?: string;
  telegramHandle?: string;
  email?: string;
  discordHandle?: string;
};

export async function getUserProfile(): Promise<UserProfile> {
  const res = await fetch('/api/user/profile');
  if (!res.ok) throw new Error('Failed to fetch profile');
  return res.json();
}

export async function updateUserProfile(profile: UpdateProfileRequest): Promise<UserProfile> {
  const res = await fetch('/api/user/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile)
  });
  if (!res.ok) throw new Error('Failed to update profile');
  return res.json();
}

export async function getDefaultAvatars(): Promise<string[]> {
  const res = await fetch('/api/avatars/default');
  if (!res.ok) throw new Error('Failed to fetch default avatars');
  const data = await res.json();
  return data.avatars;
}

export type WithdrawalRequest = {
  id: number;
  userId: string;
  amountSol: string;
  walletAddress: string;
  status: 'pending' | 'approved' | 'denied' | 'completed';
  adminNotes: string | null;
  solSignature: string | null;
  createdAt: string;
  processedAt: string | null;
};

export async function submitWithdrawal(amount: number, walletAddress: string): Promise<{ success: boolean; message: string; requestId: number }> {
  const res = await fetch('/api/withdraw', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, walletAddress })
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Withdrawal request failed');
  }
  return res.json();
}

export async function getWithdrawalRequests(): Promise<WithdrawalRequest[]> {
  const res = await fetch('/api/withdrawals');
  if (!res.ok) throw new Error('Failed to fetch withdrawal requests');
  return res.json();
}
