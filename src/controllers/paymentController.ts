import { Request, Response } from 'express';
import { razorpayService } from '../services/razorpayService';
import Order from '../models/order.model';
import Cart from '../models/cart.model';
import crypto from 'crypto';
import User from '../models/user.model';
import { distributeCommissions } from '../services/priceDistribution';
// import { createSingleOrderShipment } from '../controllers/deliveryController';
import { createShiprocketOrder } from '../controllers/shiprocketController';
export const createRazorpayOrder = async (req: Request, res: Response) => {
    try {
        const { orderId } = req.body;
        
        // Validate order exists
        const order = await Order.findById(orderId)
            .populate('user', 'email name')
            .populate('products.product');
        
        if (!order) {
            res.status(404).json({ message: 'Order not found' });
            return 
        }

        // Create Razorpay order
        const shippingAmount = order.totalAmount > 699 ? 0 : 55;
        const razorpayOrder = await razorpayService.createOrder(
            order.totalAmount + shippingAmount,
            'INR',
            `order_${order._id}`
        );

        res.status(200).json({
            message: 'Razorpay order created',
            order: razorpayOrder,
            key: process.env.RAZORPAY_KEY_ID
        });

    } catch (error: any) {
        console.error('Payment error:', error);
        res.status(500).json({
            message: 'Failed to create payment order',
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
            orderId  // Your database order ID
        } = req.body;
        
        if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
            res.status(400).json({ 
                message: 'Missing required payment verification parameters' 
            });
            return;
        }
        
        // Verify payment signature
        const payment = await razorpayService.verifyPayment(
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        );
        
        // Update order status using your MongoDB orderId
        const updatedOrder = await Order.findByIdAndUpdate(
            orderId,
            {
                'payment.status': 'completed',
                'payment.transactionId': razorpay_payment_id,
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
        console.error('Payment verification error:', error);
        res.status(400).json({
            message: 'Payment verification failed',
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

