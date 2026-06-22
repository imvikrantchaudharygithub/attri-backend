import { Request, Response } from 'express';
import { razorpayService } from '../services/razorpayService';
import Order from '../models/order.model';
import Cart from '../models/cart.model';
import crypto from 'crypto';
import User from '../models/user.model';
import Product from '../models/product.model';
import { distributeCommissions } from '../services/priceDistribution';
// import { createSingleOrderShipment } from '../controllers/deliveryController';
import { createShiprocketOrder } from '../controllers/shiprocketController';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

export const createRazorpayOrder = async (req: Request, res: Response): Promise<void> => {
    try {
        const { orderId } = req.body;
        
        // Validate order ID
        if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
            res.status(400).json({ message: 'Invalid order ID' });
            return;
        }

        // Fetch order details with coupon information
        const order = await Order.findById(orderId).populate('coupon.couponId');
        if (!order) {
            res.status(404).json({ message: 'Order not found' });
            return;
        }
        
        const shippingAmount = order.totalAmount > 699 ? 0 : 55;
        // Use toFixed(2) before converting to paise to avoid floating-point drift
        // e.g. 99.5 → "99.50" → 9950 (instead of 99.5 * 100 which could give 9949.999...)
        const payable = Math.max(0, Number(order.totalAmount) + Number(shippingAmount));
        const amountInPaise = Math.round(Number(payable.toFixed(2)) * 100);
        console.log("payable",payable);
        console.log("order",order);
		// Create Razorpay order
		const razorpayOrder = await razorpayService.createOrder({
			amount: amountInPaise, // integer paise
			currency: 'INR',
			receipt: order._id.toString(),
			notes: {
				internalOrderId: order._id.toString()
			}
		});
      

        // Store razorpay_order_id on the order for webhook lookup
        await Order.findByIdAndUpdate(orderId, {
            razorpay_order_id: razorpayOrder.id
        });

        res.status(200).json({
            id: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
            key: process.env.RAZORPAY_KEY_ID,
            orderDetails: {
                originalAmount: order.originalAmount,
                couponDiscount: order.coupon?.discountAmount || 0,
                cashbackUsed: order.cashback,
                finalAmount: order.totalAmount,
                shippingAmount: shippingAmount,
                payableAmount: payable
            },
            couponApplied: order.coupon?.code ? {
                code: order.coupon.code,
                discountAmount: order.coupon.discountAmount
            } : null
        });

    } catch (error: any) {
        res.status(400).json({
            message: 'Payment initiation failed',
            error: error.message
        });
    }
};

export const verifyPayment = async (req: Request, res: Response): Promise<void> => {
    
    try {
        const { 
            razorpay_payment_id, 
            razorpay_order_id, 
            razorpay_signature,
            orderId
        } = req.body;
        console.log('=== DEBUG INFO ===');
        console.log('Order ID:', razorpay_order_id);
        console.log('Payment ID:', razorpay_payment_id);
        console.log('Received Signature:', razorpay_signature);
        console.log('Key Secret:', process.env.RAZORPAY_KEY_SECRET ? 'Present' : 'Missing');
        console.log('Key ID:', process.env.RAZORPAY_KEY_ID ? 'Present' : 'Missing');
        // Validate all required parameters
        const missingParams = [];
        if (!razorpay_payment_id) missingParams.push('razorpay_payment_id');
        if (!razorpay_order_id) missingParams.push('razorpay_order_id');
        if (!razorpay_signature) missingParams.push('razorpay_signature');
        if (!orderId) missingParams.push('orderId');

        if (missingParams.length > 0) {
            res.status(400).json({
                message: 'Missing required parameters',
                missing: missingParams
            });
            return;
        }

        // Verify payment signature
        const payment = await razorpayService.verifyPayment(
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        );
console.log("payment",payment);
        // Atomic check-and-update: only process if order is still "pending"
        // This prevents double-processing if webhook fires simultaneously
        const updatedOrder = await Order.findOneAndUpdate(
            { _id: orderId, status: 'pending' },
            {
                'payment.status': 'completed',
                'payment.transactionId': razorpay_payment_id,
                'payment.verifiedAt': new Date(),
                status: 'processing'
            },
            { new: true }
        );

        if (!updatedOrder) {
            // Either order not found OR already processed (by webhook) - both are OK
            const existingOrder = await Order.findById(orderId);
            if (existingOrder && existingOrder.status !== 'pending') {
                // Already processed by webhook - return success to frontend
                res.status(200).json({ message: 'Payment already verified', order: existingOrder });
                return;
            }
            res.status(404).json({ message: 'Order not found' });
            return;
        }

        // Clear user's cart
        await Cart.findOneAndUpdate(
            { userId: updatedOrder.user },
            { $set: { items: [] } }
        );
        const user:any = await User.findById(updatedOrder.user._id).populate({
            path: "referral_by",
            populate: {
              path: "referral_by",
              populate: {
                path: "referral_by",
                populate: {
                  path: "referral_by",
                  populate: {
                    path: "referral_by",
                    populate: {
                      path: "referral_by",
                      populate: {
                        path: "referral_by",
                      },
                    },
                  },
                  
                },
              },
            },
          });
          console.log( "verify payment user",user);

        // await distributeCommissions(user?.toObject(),updatedOrder.distributionamountTotal || 0);
        await distributeCommissions(user?.toObject(),updatedOrder.distributionamountTotal || 0);
    //    const shipmentData = await createSingleOrderShipment(updatedOrder._id.toString());
        const shipmentData = await createShiprocketOrder(updatedOrder._id.toString());
        // const user:any = await User.findById(updatedOrder.user);
        // Deduct spent cashback and credit earned 10% cashback (runs once — atomic status flip guards it)
        const cashbackNet = Number(updatedOrder.cashbackEarned || 0) - Number(updatedOrder.cashback || 0);
        if (cashbackNet !== 0) {
            user.cashback = Math.max(0, Number(user.cashback) + cashbackNet);
            await user.save();
        }
        res.status(200).json({
            message: 'Payment verified successfully',
            order: updatedOrder,
            shipmentData: shipmentData
        });

    } catch (error: any) {
        console.error('Payment Verification Error:', error);
        res.status(400).json({
            message: error.message.startsWith('Payment verification') 
                ? error.message 
                : 'Payment verification failed',
            error: error.message
        });
    }
}; 


/** 7-level referral_by populate chain (same shape as verifyPayment / distributeCommissionsManual) */
const populateReferralChain = {
    path: 'referral_by' as const,
    populate: {
        path: 'referral_by',
        populate: {
            path: 'referral_by',
            populate: {
                path: 'referral_by',
                populate: {
                    path: 'referral_by',
                    populate: {
                        path: 'referral_by',
                        populate: {
                            path: 'referral_by',
                        },
                    },
                },
            },
        },
    },
};

/**
 * Admin: distribute commissions as if the user bought the selected products
 * (sum of distributionamount × quantity per line, same rule as createOrder).
 * Body: { userId, items: [{ productId, quantity }] } or legacy { userId, productIds } (qty 1 each).
 */
export const distributeProductCommission = async (req: Request, res: Response): Promise<void> => {
    try {
        const body = req.body as {
            userId?: string;
            items?: Array<{ productId?: string; quantity?: unknown }>;
            productIds?: unknown;
        };
        const { userId } = body;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            res.status(400).json({ message: 'Valid userId is required' });
            return;
        }

        const qtyByProductId = new Map<string, number>();

        if (Array.isArray(body.items) && body.items.length > 0) {
            for (const row of body.items) {
                const pid = String(row.productId ?? '').trim();
                if (!mongoose.Types.ObjectId.isValid(pid)) {
                    res.status(400).json({ message: `Invalid productId: ${pid || '(empty)'}` });
                    return;
                }
                const q = Math.floor(Number(row.quantity));
                if (!Number.isFinite(q) || q < 1 || q > 9999) {
                    res.status(400).json({
                        message: 'Each quantity must be a whole number from 1 to 9999',
                    });
                    return;
                }
                qtyByProductId.set(pid, (qtyByProductId.get(pid) || 0) + q);
            }
        } else if (Array.isArray(body.productIds) && body.productIds.length > 0) {
            const ids = [
                ...new Set(
                    body.productIds
                        .map((id) => String(id))
                        .filter((id) => mongoose.Types.ObjectId.isValid(id))
                ),
            ];
            for (const id of ids) {
                qtyByProductId.set(id, 1);
            }
        } else {
            res.status(400).json({
                message: 'Provide items [{ productId, quantity }] or legacy productIds[]',
            });
            return;
        }

        const uniqueIds = [...qtyByProductId.keys()];
        if (uniqueIds.length === 0) {
            res.status(400).json({ message: 'No valid product IDs provided' });
            return;
        }

        const products = await Product.find({ _id: { $in: uniqueIds } });
        if (products.length === 0) {
            res.status(404).json({ message: 'No valid products found' });
            return;
        }

        if (products.length !== uniqueIds.length) {
            res.status(400).json({
                message: 'Some product IDs were not found',
                requested: uniqueIds.length,
                found: products.length,
            });
            return;
        }

        const totalAmount = products.reduce((sum, p) => {
            const qty = qtyByProductId.get(String(p._id)) || 0;
            return sum + Number(p.distributionamount || 0) * qty;
        }, 0);

        if (totalAmount <= 0) {
            res.status(400).json({
                message: 'Total distribution amount for selected lines is zero',
            });
            return;
        }

        const user: any = await User.findById(userId).populate(populateReferralChain);
        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        await distributeCommissions(user.toObject(), totalAmount);

        const totalUnits = [...qtyByProductId.values()].reduce((a, b) => a + b, 0);

        res.status(200).json({
            message: 'Distribution successful',
            totalAmount,
            productCount: products.length,
            totalUnits,
        });
    } catch (error: any) {
        console.error('distributeProductCommission error:', error);
        res.status(400).json({
            message: 'Distribution failed',
            error: error.message,
        });
    }
};

export const distributeCommissionsManual = async (req: Request, res: Response): Promise<void> => {
    try {
        const { userId, amount } = req.body;

        // Validate user and amount
        const user:any = await User.findById(userId).populate({
            path: "referral_by",
            populate: {
              path: "referral_by",
              populate: {
                path: "referral_by",
                populate: {
                  path: "referral_by",
                  populate: {
                    path: "referral_by",
                    populate: {
                      path: "referral_by",
                      populate: {
                        path: "referral_by",
                      },
                    },
                  },
                  
                },
              },
            },
          });
          console.log( "payment distribute user",user); 

        await distributeCommissions(user?.toObject(),amount);
        res.status(200).json({
            message: 'Payment verified successfully',
            user: user
        });
    } catch (error: any) {
        console.error('Payment verification error:', error);
        res.status(400).json({
            message: 'Payment verification failed',
            error: error.message
        });
    }
};




export const deductUserBalance = async (req: Request, res: Response): Promise<void> => {
    try {
        const { userId, amount } = req.body;

        if (!userId || !amount) {
            res.status(400).json({ message: 'User ID and amount are required' });
            return;
        }

        const user:any = await User.findById(userId);
        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        if (user.balance < amount) {
            res.status(400).json({ message: 'Insufficient balance' });
            return;
        }

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $inc: { balance: -amount } },
            { new: true }
        );

        res.status(200).json({
            message: 'Balance updated successfully',
            user: updatedUser
        });
    } catch (error: any) {
        console.error('Balance deduction error:', error);
        res.status(500).json({
            message: 'Failed to deduct balance',
            error: error.message
        });
    }
};


// Razorpay Webhook - Safety net for payments where frontend callback fails
export const razorpayWebhook = async (req: Request, res: Response): Promise<void> => {
    try {
        // Verify webhook signature
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
        if (!webhookSecret || webhookSecret.trim() === '') {
            console.error('RAZORPAY_WEBHOOK_SECRET not configured');
            res.status(500).json({ message: 'Webhook secret not configured' });
            return;
        }

        const receivedSignature = req.headers['x-razorpay-signature'] as string;
        if (!receivedSignature) {
            res.status(400).json({ message: 'Missing webhook signature' });
            return;
        }

        // Use raw body buffer for signature verification (preserved by express.json verify callback)
        const rawBody = (req as any).rawBody;
        const expectedSignature = crypto
            .createHmac('sha256', webhookSecret)
            .update(rawBody || JSON.stringify(req.body))
            .digest('hex');

        const isValid = crypto.timingSafeEqual(
            Buffer.from(expectedSignature),
            Buffer.from(receivedSignature)
        );

        if (!isValid) {
            console.error('Razorpay webhook signature verification failed');
            res.status(400).json({ message: 'Invalid webhook signature' });
            return;
        }

        const event = req.body.event;
        const payload = req.body.payload;

        if (event === 'payment.captured') {
            const razorpayPaymentId = payload.payment.entity.id;
            const razorpayOrderId = payload.payment.entity.order_id;

            // Atomic claim: only one processor wins when status is still pending (same as verifyPayment)
            const updatedOrder = await Order.findOneAndUpdate(
                { razorpay_order_id: razorpayOrderId, status: 'pending' },
                {
                    'payment.status': 'completed',
                    'payment.transactionId': razorpayPaymentId,
                    'payment.verifiedAt': new Date(),
                    status: 'processing'
                },
                { new: true }
            );

            if (!updatedOrder) {
                console.log(
                    `Webhook: Order already processed or not found for razorpay_order_id: ${razorpayOrderId}`
                );
                res.status(200).json({ message: 'Already processed or not found' });
                return;
            }

            console.log(`Webhook: Processing payment for order ${updatedOrder._id}`);

            // Clear user's cart
            await Cart.findOneAndUpdate(
                { userId: updatedOrder.user },
                { $set: { items: [] } }
            );

            // Distribute commissions (background - don't block webhook response)
            const user: any = await User.findById(updatedOrder.user).populate({
                path: "referral_by",
                populate: {
                    path: "referral_by",
                    populate: {
                        path: "referral_by",
                        populate: {
                            path: "referral_by",
                            populate: {
                                path: "referral_by",
                                populate: {
                                    path: "referral_by",
                                    populate: {
                                        path: "referral_by",
                                    },
                                },
                            },
                        },
                    },
                },
            });

            if (user) {
                await distributeCommissions(user.toObject(), updatedOrder.distributionamountTotal || 0);
                await createShiprocketOrder(updatedOrder._id.toString());

                const cashbackNet = Number(updatedOrder.cashbackEarned || 0) - Number(updatedOrder.cashback || 0);
                if (cashbackNet !== 0) {
                    user.cashback = Math.max(0, Number(user.cashback) + cashbackNet);
                    await user.save();
                }
            }

            console.log(`Webhook: Successfully processed order ${updatedOrder._id}`);
        }

        // Always respond 200 to acknowledge receipt (Razorpay retries on non-2xx)
        res.status(200).json({ message: 'Webhook processed' });

    } catch (error: any) {
        console.error('Razorpay Webhook Error:', error);
        // Still respond 200 to prevent infinite retries for unrecoverable errors
        res.status(200).json({ message: 'Webhook error acknowledged' });
    }
};

