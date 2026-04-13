import Razorpay from 'razorpay';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

class RazorpayService {
    private instance: Razorpay | null = null;

    private getClient(): Razorpay {
        const keyId = process.env.RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;
        if (!keyId || !keySecret) {
            throw new Error(
                'Razorpay credentials not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env'
            );
        }
        if (!this.instance) {
            this.instance = new Razorpay({
                key_id: keyId,
                key_secret: keySecret
            });
        }
        return this.instance;
    }

    async createOrder(params: {
        amount: number;
        currency: string;
        receipt: string;
        notes?: Record<string, string>;
        payment_capture?: number;
    }) {
        try {
            return await this.getClient().orders.create({
                amount: Math.round(params.amount),
                currency: params.currency,
                receipt: params.receipt,
                notes: params.notes,
                payment_capture: true
            });
        } catch (error: any) {
            console.error('Razorpay API Error:', error.error);
            throw new Error(`Payment failed: ${error.error?.description ?? error.message}`);
        }
    }

    async verifyPayment(razorpayOrderId: string, razorpayPaymentId: string, razorpaySignature: string) {
        try {
            if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
                throw new Error('Missing payment verification parameters');
            }

            const keySecret = process.env.RAZORPAY_KEY_SECRET;
            if (!keySecret) {
                throw new Error('Razorpay credentials not configured');
            }

            const body = `${razorpayOrderId}|${razorpayPaymentId}`;
            const expectedSignature = crypto
                .createHmac('sha256', keySecret)
                .update(body)
                .digest('hex');

            const isValid = crypto.timingSafeEqual(
                Buffer.from(expectedSignature),
                Buffer.from(razorpaySignature)
            );

            if (!isValid) {
                throw new Error('Invalid payment signature');
            }

            const payment = await this.getClient().payments.fetch(razorpayPaymentId);

            if (payment.status !== 'captured' && payment.status !== 'authorized') {
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
            return await this.getClient().payments.capture(
                paymentId,
                amount * 100,
                'INR'
            );
        } catch (error) {
            throw new Error(`Payment capture failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    inrToPaise(amount: number) {
        return amount * 100;
    }
}

export const razorpayService = new RazorpayService();
