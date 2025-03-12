import Razorpay from 'razorpay';
import dotenv from 'dotenv';
import crypto from 'crypto';
dotenv.config();

class RazorpayService {
    private razorpay: Razorpay;

    constructor() {
        // if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        //     throw new Error('Razorpay credentials not configured');
        // }

        this.razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_cuWPmyQArRt5OR',
            key_secret: process.env.RAZORPAY_KEY_SECRET || 'kAo0KQYcBccaYPIjd41ZxjHL'
        });
    }

    async createOrder(amount: number, currency: string = 'INR', receipt?: string) {
        try {
            const options = {
                amount: amount * 100, // Convert to paise
                currency,
                receipt: receipt || `receipt_${Date.now()}`,
                payment_capture: 1
            };

            return await this.razorpay.orders.create(options);
        } catch (error) {
            throw new Error(`Failed to create Razorpay order: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async verifyPayment(razorpayOrderId: string, razorpayPaymentId: string, razorpaySignature: string) {
        try {
            // The exact format Razorpay expects: orderId + "|" + paymentId
            const body = razorpayOrderId + "|" + razorpayPaymentId;
            
            // Generate expected signature using the KEY_SECRET directly from env
            const expectedSignature = crypto
                .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'kAo0KQYcBccaYPIjd41ZxjHL')
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
            
            return await this.razorpay.payments.fetch(razorpayPaymentId);
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
            return await this.razorpay.payments.capture(
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

// Export a singleton instance
export const razorpayService = new RazorpayService(); 