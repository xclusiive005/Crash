import { Keypair, Connection, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';

const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';
const FALLBACK_VAULT_ADDRESS = 'H9ecbrX7Wawm1URVCWvvmUZFrWBnv5Zx1PnDzjb7DYbW';

// Get vault keypair from environment
export function getVaultKeypair(): Keypair | null {
  const secretKey = process.env.VAULT_PRIVATE_KEY;
  if (!secretKey) {
    return null;
  }
  
  try {
    // Support both base58 and JSON array formats
    if (secretKey.startsWith('[')) {
      const parsed = JSON.parse(secretKey);
      return Keypair.fromSecretKey(Uint8Array.from(parsed));
    } else {
      return Keypair.fromSecretKey(bs58.decode(secretKey));
    }
  } catch (error) {
    console.error('Failed to parse vault private key:', error);
    return null;
  }
}

// Get vault public address (always returns a valid address)
export function getVaultAddress(): string {
  const keypair = getVaultKeypair();
  if (!keypair) {
    // Return fallback address if no key configured
    return process.env.VAULT_ADDRESS || FALLBACK_VAULT_ADDRESS;
  }
  return keypair.publicKey.toString();
}

// Check if vault is fully configured (has private key for payouts)
export function isVaultConfigured(): boolean {
  return getVaultKeypair() !== null;
}

// Get vault balance
export async function getVaultBalance(): Promise<number> {
  const address = getVaultAddress();
  
  try {
    const connection = new Connection(SOLANA_RPC, 'confirmed');
    const balance = await connection.getBalance(new PublicKey(address));
    return balance / LAMPORTS_PER_SOL;
  } catch (error) {
    console.error('Failed to get vault balance:', error);
    return 0;
  }
}

// Send SOL payout from vault to winner
export async function sendPayout(recipientAddress: string, amountSol: number): Promise<{ success: boolean; signature?: string; error?: string }> {
  const keypair = getVaultKeypair();
  if (!keypair) {
    return { success: false, error: 'Vault private key not configured' };
  }
  
  try {
    const connection = new Connection(SOLANA_RPC, 'confirmed');
    const recipient = new PublicKey(recipientAddress);
    const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);
    
    // Check vault has enough balance
    const vaultBalance = await connection.getBalance(keypair.publicKey);
    if (vaultBalance < lamports + 5000) { // 5000 lamports for tx fee
      return { success: false, error: 'Insufficient vault balance' };
    }
    
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: recipient,
        lamports,
      })
    );
    
    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair]);
    
    return { success: true, signature };
  } catch (error: any) {
    console.error('Payout failed:', error);
    return { success: false, error: error.message };
  }
}

// Generate a new vault keypair (for setup)
export function generateNewVaultKeypair(): { publicKey: string; privateKey: string } {
  const keypair = Keypair.generate();
  return {
    publicKey: keypair.publicKey.toString(),
    privateKey: bs58.encode(keypair.secretKey)
  };
}
