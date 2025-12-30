import crypto from 'crypto';

const HOUSE_EDGE = 0.025; // 2.5% house edge

export function generateServerSeed(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashServerSeed(serverSeed: string): string {
  return crypto.createHash('sha256').update(serverSeed).digest('hex');
}

export function generateClientSeed(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function calculateCrashPoint(serverSeed: string, clientSeed: string, nonce: number): number {
  const hash = crypto.createHmac('sha256', serverSeed)
    .update(`${clientSeed}:${nonce}`)
    .digest('hex');
  
  // Use first 8 hex chars (32 bits) for proper JS number handling
  const h = parseInt(hash.slice(0, 8), 16);
  
  // ~3% instant crash chance (house edge mechanism)
  // If divisible by 33, instant crash at 1.00x
  if (h % 33 === 0) {
    return 1.00;
  }
  
  // Standard crash formula: result = 99 / (1 - r) where r is 0-1
  // This creates proper distribution: ~50% under 2x, ~33% under 1.5x, etc.
  const e = Math.pow(2, 32); // 2^32 for 32-bit hash
  const r = h / e; // Random value 0-1
  
  // Calculate multiplier with house edge
  // Formula gives: 1x at r=0, infinity as r->1, with proper distribution
  const rawMultiplier = (1 - HOUSE_EDGE) / (1 - r);
  
  // Cap at reasonable max and floor to 2 decimal places
  const cappedMultiplier = Math.min(rawMultiplier, 1000);
  
  return Math.max(1.00, Math.floor(cappedMultiplier * 100) / 100);
}

export function verifyCrashPoint(serverSeed: string, clientSeed: string, nonce: number, claimedCrashPoint: number): boolean {
  const calculatedCrashPoint = calculateCrashPoint(serverSeed, clientSeed, nonce);
  return Math.abs(calculatedCrashPoint - claimedCrashPoint) < 0.01;
}

export interface ProvablyFairGame {
  serverSeedHash: string;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  crashPoint: number;
}

export function createNewRound(clientSeed?: string): ProvablyFairGame {
  const serverSeed = generateServerSeed();
  const serverSeedHash = hashServerSeed(serverSeed);
  const actualClientSeed = clientSeed || generateClientSeed();
  const nonce = Date.now();
  const crashPoint = calculateCrashPoint(serverSeed, actualClientSeed, nonce);
  
  return {
    serverSeedHash,
    serverSeed,
    clientSeed: actualClientSeed,
    nonce,
    crashPoint,
  };
}

export function getVerificationData(round: ProvablyFairGame) {
  return {
    serverSeedHash: round.serverSeedHash,
    serverSeed: round.serverSeed,
    clientSeed: round.clientSeed,
    nonce: round.nonce,
    crashPoint: round.crashPoint,
    formula: 'HMAC-SHA256(serverSeed, clientSeed:nonce) with 2.5% house edge',
  };
}
