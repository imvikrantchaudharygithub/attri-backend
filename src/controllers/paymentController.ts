import { Request, Response } from 'express';
import { razorpayService } from '../services/razorpayService';
import Order from '../models/order.model';
import Cart from '../models/cart.model';
import crypto from 'crypto';
import User from '../models/user.model';
import { distributeCommissions } from '../services/priceDistribution';
// import { createSingleOrderShipment } from '../controllers/deliveryController';
import { createShiprocketOrder } from '../controllers/shiprocketController';
import mongoose from 'mongoose';

export const createRazorpayOrder = async (req: Request, res: Response): Promise<void> => {
    try {
        const { orderId } = req.body;
        
        // Validate order ID
        if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
            res.status(400).json({ message: 'Invalid order ID' });
            return;
        }

        // Fetch order details
        const order = await Order.findById(orderId);
        if (!order) {
            res.status(404).json({ message: 'Order not found' });
            return;
        }
        const shippingAmount = order.totalAmount > 699 ? 0 : 55;
		// Ensure integer paise
		const amountInPaise = Math.round((Number(order.totalAmount) + Number(shippingAmount)) * 100);

		// Create Razorpay order
		const razorpayOrder = await razorpayService.createOrder({
			amount: amountInPaise, // integer paise
			currency: 'INR',
			receipt: order._id.toString(),
			notes: {
				internalOrderId: order._id.toString()
			}
		});

        res.status(200).json({
            id: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
            key: process.env.RAZORPAY_KEY_ID
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
        // Update order status
        const updatedOrder = await Order.findByIdAndUpdate(
            orderId,
            {
                'payment.status': 'completed',
                'payment.transactionId': razorpay_payment_id,
                'payment.verifiedAt': new Date(),
                status: 'processing'
            },
            { new: true }
        );

        if (!updatedOrder) {
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

        await distributeCommissions(user?.toObject(),updatedOrder.totalAmount);
    //    const shipmentData = await createSingleOrderShipment(updatedOrder._id.toString());
        const shipmentData = await createShiprocketOrder(updatedOrder._id.toString());
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

