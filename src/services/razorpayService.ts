import Razorpay from 'razorpay';
import dotenv from 'dotenv';
import crypto from 'crypto';

// Load environment variables first
dotenv.config();

interface RazorpayOrderParams {
    amount: number;
    currency: string;
    receipt: string;
    notes?: Record<string, string>;
    payment_capture?: number;
}

class RazorpayService {
    private instance: Razorpay;

    constructor() {
        // Validate environment variables
        // if (!process.env.RAZORPAY_KEY_ID  || !process.env.RAZORPAY_KEY_SECRET) {
        //     throw new Error('Razorpay credentials not configured');
        // }

        this.instance = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID || 'rzp_live_LGvyxYF9hEcSdM',
            key_secret: process.env.RAZORPAY_KEY_SECRET || 'Bl2FYYZMy4fNHSDd67eK0Iu6'
        });
    }

    async createOrder(params: {
        amount: number;
        currency: string;
        receipt: string;
        notes?: Record<string, string>;
        payment_capture?: number;
    }) {
        try {
            return await this.instance.orders.create({
                amount: params.amount,
                currency: params.currency,
                receipt: params.receipt,
                notes: params.notes,
                payment_capture: true // Auto-capture payments
            });
        } catch (error: any) {
            console.error('Razorpay API Error:', error.error);
            throw new Error(`Payment failed: ${error.error.description}`);
        }
    }

    async verifyPayment(razorpayOrderId: string, razorpayPaymentId: string, razorpaySignature: string) {
        try {
            // The exact format Razorpay expects: orderId + "|" + paymentId
            const body = razorpayOrderId + "|" + razorpayPaymentId;
            
            // Generate expected signature using the KEY_SECRET directly from env
            const expectedSignature = crypto
                .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'c6Z7JC19C6ullu2Fb1aD10hM')
                .update(body)
                .digest('hex');
            
            // Compare using timing-safe comparison
            const isValid = crypto.timingSafeEqual(
                Buffer.from(expectedSignature, 'hex'),
                Buffer.from(razorpaySignature, 'hex')
            );
            
            if (!isValid) {
                throw new Error('Invalid payment signature');
            }
            
            return await this.instance.payments.fetch(razorpayPaymentId);
        } catch (error) {
            if (error instanceof Error && error.message === 'Invalid payment signature') {
                throw error;
            }
            
            if (error instanceof Error && error.message.includes('Buffer')) {
                // Handle timing safe comparison errors (different length buffers)
                throw new Error('Invalid signature format');
            }
            
            throw new Error(`Payment verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async capturePayment(paymentId: string, amount: number) {
        try {
            return await this.instance.payments.capture(
                paymentId,
                amount * 100, // Convert to paise
                'INR'
            );
        } catch (error) {
            throw new Error(`Payment capture failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    // Helper method for currency conversion
    inrToPaise(amount: number) {
        return amount * 100;
    }
}

// Export singleton after ensuring env vars are loaded
export const razorpayService = new RazorpayService(); 