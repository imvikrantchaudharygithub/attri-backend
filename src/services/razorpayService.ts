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
				amount: Math.round(params.amount), // ensure integer paise
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
            // Validate input parameters
            if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
                throw new Error('Missing payment verification parameters');
            }

            // Generate expected signature
            const body = `${razorpayOrderId}|${razorpayPaymentId}`;
            const expectedSignature = crypto
                .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'c6Z7JC19C6ullu2Fb1aD10hM')
                .update(body)
                .digest('hex');

            // Compare signatures safely
            const isValid = crypto.timingSafeEqual(
                Buffer.from(expectedSignature),
                Buffer.from(razorpaySignature)
            );

            if (!isValid) {
                throw new Error('Invalid payment signature');
            }

            // Verify payment status with Razorpay API
            const payment = await this.instance.payments.fetch(razorpayPaymentId);
            
            if (payment.status !== 'captured') {
                throw new Error(`Payment not captured - Status: ${payment.status}`);
            }

            return payment;

        } catch (error: any) {
            console.error('Payment Verification Error:', {
                orderId: razorpayOrderId,
                paymentId: razorpayPaymentId,
                error: error.message
            });
            
            throw new Error(`Payment verification failed: ${error.message}`);
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