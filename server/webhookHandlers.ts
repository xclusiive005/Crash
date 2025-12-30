import { getStripeSync, getUncachableStripeClient } from './stripeClient';
import { storage } from './storage';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);
  }

  static async handleCheckoutCompleted(session: any): Promise<void> {
    const userId = session.metadata?.userId;
    const coinAmount = parseInt(session.metadata?.coinAmount || '0');
    
    if (userId && coinAmount > 0) {
      const user = await storage.getUser(userId);
      if (user) {
        const currentBalance = parseFloat(user.balance || '0');
        const newBalance = (currentBalance + coinAmount).toFixed(9);
        await storage.updateUserBalance(userId, newBalance);
        console.log(`[COIN PACK] Credited ${coinAmount} Soliix Coins to user ${userId}`);
      }
    }
  }
}
