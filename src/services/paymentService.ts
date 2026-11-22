import { db } from '../lib/firebase';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { PaymentGateway } from '../types';

const DEFAULT_GATEWAY: PaymentGateway = {
  id: 'zapupi',
  name: 'ZapUPI Instant Gateway',
  isActive: true,
  upiId: 'aptournament@upi',
  createdAt: new Date().toISOString()
} as any;

class PaymentService {
  private activeGateway: PaymentGateway | null = DEFAULT_GATEWAY;
  private unsubscriber: (() => void) | null = null;

  constructor() {
    this.init();
  }

  private init() {
    const q = query(collection(db, 'paymentSettings'), where('isActive', '==', true));
    
    this.unsubscriber = onSnapshot(
      q,
      (snapshot) => {
        if (!snapshot.empty) {
          const data = snapshot.docs[0].data() as PaymentGateway;
          this.activeGateway = { ...data, id: snapshot.docs[0].id };
          console.log(`[PaymentService] Active Gateway: ${this.activeGateway.name}`);
        } else {
          this.activeGateway = DEFAULT_GATEWAY;
          console.log('[PaymentService] Using default ZapUPI gateway');
        }
      },
      (error) => {
        console.warn('[PaymentService] Notice listening to payment settings:', error);
        this.activeGateway = DEFAULT_GATEWAY;
      }
    );
  }

  public getActiveGateway(): PaymentGateway {
    return this.activeGateway || DEFAULT_GATEWAY;
  }

  public async getActiveGatewayAsync(): Promise<PaymentGateway> {
    if (this.activeGateway) return this.activeGateway;
    
    try {
      const q = query(collection(db, 'paymentSettings'), where('isActive', '==', true));
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        const data = snap.docs[0].data() as PaymentGateway;
        this.activeGateway = { ...data, id: snap.docs[0].id };
        return this.activeGateway;
      }
    } catch (error) {
      console.warn('[PaymentService] Error fetching gateway settings, using default:', error);
    }
    
    this.activeGateway = DEFAULT_GATEWAY;
    return DEFAULT_GATEWAY;
  }

  // Unified payment initiation method
  public async initiateDeposit(amount: number, userId: string) {
    const gateway = await this.getActiveGatewayAsync();

    // Logic for different gateways
    switch (gateway.id) {
      case 'razorpay':
        return this.initRazorpay(amount, userId, gateway);
      case 'cashfree':
        return this.initCashfree(amount, userId, gateway);
      case 'transupi':
      case 'zapupi':
        return this.initUPIGateway(amount, userId, gateway);
      default:
        return this.initUPIGateway(amount, userId, gateway);
    }
  }

  private async initRazorpay(amount: number, userId: string, config: PaymentGateway) {
    console.log('Initiating Razorpay payment...', { amount, userId, key: config.apiKey });
    return { type: 'razorpay', amount, config };
  }

  private async initCashfree(amount: number, userId: string, config: PaymentGateway) {
    try {
      console.log('Initiating Cashfree payment...', { amount, userId });
      
      const res = await fetch('/api/cashfree/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, userId })
      });

      if (!res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const error = await res.json();
          throw new Error(error.error || error.message || 'Payment gateway initialization failed');
        } else {
          const text = await res.text();
          console.error('[PaymentService] Non-JSON error response:', text);
          throw new Error(`Server error (${res.status}): ${text.slice(0, 100)}...`);
        }
      }

      const order = await res.json();
      
      const cashfree = (window as any).Cashfree({
        mode: config.id === 'cashfree' && (config.apiKey?.includes('TEST') || !config.apiKey) ? 'sandbox' : 'production'
      });

      return cashfree.checkout({
        paymentSessionId: order.payment_session_id,
        redirectTarget: "_self" 
      });
    } catch (error) {
      console.error('Cashfree Error:', error);
      throw error;
    }
  }

  private async initUPIGateway(amount: number, userId: string, config: PaymentGateway) {
    if (config.id === 'zapupi') {
      try {
        console.log('Initiating ZapUPI payment...', { amount, userId });
        
        const res = await fetch('/api/zapupi/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount, userId })
        });

        if (!res.ok) {
          const contentType = res.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const error = await res.json();
            throw new Error(error.error || error.message || 'ZapUPI initialization failed');
          } else {
            const text = await res.text();
            console.error('[PaymentService] ZapUPI non-JSON error response:', text);
            throw new Error(`Server error (${res.status}): ${text.slice(0, 100)}...`);
          }
        }

        const data = await res.json();
        return { type: 'zapupi', amount, config, ...data };
      } catch (error) {
        console.warn('ZapUPI API Notice:', error);
        return { type: 'upi', amount, config, directFallback: true };
      }
    }
    
    console.log(`Initiating ${config.name} payment...`, { amount, userId, upi: config.upiId });
    return { type: 'upi', amount, config };
  }

  private async initCustomGateway(amount: number, userId: string, config: PaymentGateway) {
    console.log('Initiating Custom Gateway payment...', { amount, userId });
    return { type: 'custom', amount, config };
  }

  public dispose() {
    if (this.unsubscriber) {
      this.unsubscriber();
    }
  }
}

export const paymentService = new PaymentService();
