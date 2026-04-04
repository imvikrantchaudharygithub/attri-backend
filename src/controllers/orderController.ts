// controllers/orderController.ts
import { Request, Response } from 'express';
import Order from '../models/order.model';
import User from '../models/user.model';
import Product from '../models/product.model';
import Address from '../models/address.model';
import Coupon from '../models/coupon.model';
import mongoose from 'mongoose';

interface IOrderProduct {
  product: string;
  quantity: number;
  priceAtPurchase: number;
}

// interface IPayment {
//   method: string;
//   status: string;
//   transactionId?: string;
// }

// Create new order
export const createOrder = async (req: Request, res: Response) => {
  try {
    const { user, address, products, notes, cashback, couponCode } = req.body;

    // Validate required fields
    if (!user || !address || !products ) {
      res.status(400).json({ message: 'Missing required fields' });
      return 
    }

    // Check if user exists
    const userExists = await User.findById(user);
    if (!userExists) {
      res.status(404).json({ message: 'User not found' });
      return 
    }
    if(cashback>0){
    if(Number(userExists.cashback) < Number(cashback)){
      res.status(400).json({ message: `Cashback is not enough ${userExists.cashback} - ${cashback}` });
      return 
    }
  }
    // Check if address exists
    const addressExists = await Address.findById(address);
    if (!addressExists) {
      res.status(404).json({ message: 'Address not found' });
      return 
    }

    // Validate products
    let totalAmount = 0;
    let distributionamountTotal = 0;
    const productItems: IOrderProduct[] = [];

    for (const item of products as IOrderProduct[]) {
      const product:any = await Product.findById(item.product);
      if (!product) {
        res.status(404).json({ message: `Product ${item.product} not found` });
        return 
      }
      
      productItems.push({
        product: item.product,
        quantity: item.quantity,
        priceAtPurchase: Number(product.price)
      });

      totalAmount += Number((product.price * item.quantity).toFixed(2));
      distributionamountTotal += Number(product.distributionamount || 0) * Number(item.quantity || 0);
    }

    // Store original amount before any discounts
    const originalAmount = totalAmount;
    
    // Debug: Log productItems to see what we have
    // console.log("ProductItems array:", JSON.stringify(productItems, null, 2));

    // Handle coupon validation and discount calculation
    let couponDiscount = 0;
    let appliedCoupon = null;

    if (couponCode) {
      try {
        // Find the active coupon
        const coupon = await Coupon.findOne({
          code: couponCode,
          status: 'active',
          validFrom: { $lte: new Date() },
          validTo: { $gte: new Date() },
        }).populate('products');
        // console.log( "coupon" ,coupon );
        if (!coupon) {
          res.status(400).json({ 
            success: false,
            message: 'Invalid or expired coupon code' 
          });
          return;
        }

        // Check usage limit
        if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
          res.status(400).json({ 
            success: false,
            message: 'Coupon usage limit exceeded' 
          });
          return;
        }

        // Check minimum purchase amount
        if (coupon.minPurchaseAmount > 0 && totalAmount < coupon.minPurchaseAmount) {
          res.status(400).json({ 
            success: false,
            message: `Minimum purchase amount of ₹${coupon.minPurchaseAmount} required for this coupon` 
          });
          return;
        }

        // Calculate discount based on coupon type
        let calculatedDiscount = 0;
        
        // Handle B1G1 (Buy One Get One) discount type
        if (coupon.discountType === 'b1g1') {
          // Calculate total items in cart (sum of all quantities)
          const totalItems = productItems.reduce((total: number, item: any) => 
            total + item.quantity, 0);
          
          // B1G1 requires at least 2 items in cart
          if (totalItems < 2) {
            res.status(400).json({ 
              success: false,
              message: 'B1G1 offer requires at least 2 items in cart' 
            });
            return;
          }
          
          // Find the lowest priced single item in cart
          const lowestPricedItem = productItems.reduce((min: any, item: any) => 
            item.priceAtPurchase < min.priceAtPurchase ? item : min
          );
          
          // Set discount amount to the lowest priced item
          calculatedDiscount = lowestPricedItem.priceAtPurchase;
          
        } else if (coupon.products && coupon.products.length > 0) {
          // Coupon applies to specific products only
          const eligibleProductIds = coupon.products.map((p: any) => p._id.toString());
          // console.log("Eligible product IDs:", eligibleProductIds);
          // console.log("Cart product IDs:", productItems.map(item => item?.product));
          
          const eligibleCartItems = productItems.filter((item: any) => {
            const itemProductId = item.product._id.toString();
            return eligibleProductIds.includes(itemProductId);
          });
          // console.log("Eligible cart items:", eligibleCartItems);
          if (eligibleCartItems.length === 0) {
            res.status(400).json({ 
              success: false,
              message: 'This coupon is not applicable to any products in your cart' 
            });
            return;
          }
          
          // Calculate discount for eligible items only
          const eligibleTotal = eligibleCartItems.reduce((total: number, item: any) => 
            total + (item.priceAtPurchase * item.quantity), 0);
          
          if (coupon.discountType === 'percentage') {
            calculatedDiscount = (eligibleTotal * coupon.discountValue) / 100;
          } else {
            calculatedDiscount = coupon.discountValue;
          }
        } else {
          // Coupon applies to entire cart
          if (coupon.discountType === 'percentage') {
            calculatedDiscount = (totalAmount * coupon.discountValue) / 100;
          } else {
            calculatedDiscount = coupon.discountValue;
          }
        }

        // Apply maximum discount constraint
        if (coupon.maxDiscountAmount > 0 && calculatedDiscount > coupon.maxDiscountAmount) {
          calculatedDiscount = coupon.maxDiscountAmount;
        }

        // Ensure discount doesn't exceed total amount
        couponDiscount = Math.min(calculatedDiscount, totalAmount);
        appliedCoupon = coupon;

        // Update coupon usage count
        await Coupon.findByIdAndUpdate(coupon._id, {
          $inc: { usedCount: 1 }
        });

      } catch (error) {
        console.error('Coupon validation error:', error);
        res.status(500).json({ 
          success: false,
          message: 'Error validating coupon' 
        });
        return;
      }
    }

    // Calculate final amount after discounts (round to 2 decimals to avoid floating-point drift)
    const finalAmount = Number(Math.max(0, totalAmount - couponDiscount - (cashback || 0)).toFixed(2));
// console.log("finalAmount",finalAmount);
    // Create order
    const newOrder = new Order({
      user,
      address,
      products: productItems,
      totalAmount: Number(finalAmount.toFixed(2)),
      originalAmount: Number(originalAmount.toFixed(2)),
      distributionamountTotal: Number(distributionamountTotal.toFixed(2)),
      notes: notes || '',
      status: 'pending',
      cashback: Number(cashback || 0),
      coupon: {
        code: appliedCoupon ? appliedCoupon.code : null,
        discountAmount: Number(couponDiscount.toFixed(2)),
        couponId: appliedCoupon ? appliedCoupon._id : null
      }
    });

    const savedOrder = await newOrder.save();
    
    // Return order with coupon details
    res.status(200).json({
      success: true,
      order: savedOrder,
      couponApplied: appliedCoupon ? {
        code: appliedCoupon.code,
        discountAmount: couponDiscount,
        discountType: appliedCoupon.discountType,
        discountValue: appliedCoupon.discountValue
      } : null,
      pricing: {
        originalAmount: originalAmount,
        couponDiscount: couponDiscount,
        cashbackUsed: cashback || 0,
        finalAmount: finalAmount
      }
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all orders
export const getAllOrders = async (req: Request, res: Response) => {
  try {
    const orders = await Order.find()
      .populate('user', 'username phone')
      .populate('address')
      .populate('products.product', 'name price images sku');
      
    res.json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get order by ID
export const getOrderById = async (req: Request, res: Response) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'name phone referral_code')
      .populate('address')
      .populate('products.product');

    if (!order) {
      res.status(404).json({ message: 'Order not found' });
      return 
    }
    
    res.json(order);
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update order status
export const updateOrderStatus = async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];

    if (!status || !validStatuses.includes(status)) {
      res.status(400).json({ message: 'Invalid status value' });
      return 
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );

    if (!order) {
      res.status(404).json({ message: 'Order not found' });
      return 
    }

    res.json(order);
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete order
export const deleteOrder = async (req: Request, res: Response) => {
  const {orderId} = req.body;
  try {
    const order = await Order.findByIdAndDelete(orderId);

    if (!order) {
        res.status(404).json({ message: 'Order not found' });
      return 
    }

    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getUserOrders = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    const result = await Order.deleteMany({
      user: userId,
      status: 'pending'
    });
    
    const orders = await Order.find({ user: userId })
      .populate('user', 'name email')
      .populate('address')
      .populate('products.product', 'name price images mrp discount');


      
    res.json(orders);
  } catch (error) {
    console.error('Error fetching user orders:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getUserRecentOrders = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const result = await Order.deleteMany({
      user: userId,
      status: 'pending'
    });
    // Validate user ID format
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      res.status(400).json({ message: 'Invalid user ID format' });
      return;
    }

    // Calculate date 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    // Convert userId to ObjectId for aggregation
    const userIdObject = new mongoose.Types.ObjectId(userId);

    // Get orders from last 30 days
    const orders = await Order.find({
      user: userIdObject,
      createdAt: { $gte: thirtyDaysAgo }
    })
      .populate('user', 'name email')
      .populate('address')
      .populate('products.product', 'name price images');

    // Calculate total amount of recent orders
    const totalResult = await Order.aggregate([
      {
        $match: {
          user: userIdObject,
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$totalAmount" }
        }
      }
    ]);

    const totalAmount = totalResult[0]?.totalAmount || 0;

    res.json({
      orders,
      totalAmount
    });
    
  } catch (error) {
    console.error('Error fetching recent orders:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Mark order as delivered
export const markOrderDelivered = async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderId } = req.body;

    // Validate order ID
    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      res.status(400).json({ 
        success: false,
        message: 'Invalid order ID' 
      });
      return;
    }

    // Find the order
    const order = await Order.findById(orderId)
      .populate('user', 'name phone email')
      .populate('address')
      .populate('products.product', 'name price images');

    if (!order) {
      res.status(404).json({ 
        success: false,
        message: 'Order not found' 
      });
      return;
    }

    // Check if order can be marked as delivered
    if (order.status === 'cancelled') {
      res.status(400).json({ 
        success: false,
        message: 'Cannot mark a cancelled order as delivered' 
      });
      return;
    }

    if (order.status === 'delivered') {
      res.status(400).json({ 
        success: false,
        message: 'Order is already marked as delivered' 
      });
      return;
    }

    // Update order status to delivered
    order.status = 'delivered';
    await order.save();

    res.status(200).json({
      success: true,
      message: 'Order marked as delivered successfully',
      order: order
    });

  } catch (error) {
    console.error('Error marking order as delivered:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error while marking order as delivered' 
    });
  }
};

// Cancel order
export const cancelOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderId, reason } = req.body;

    // Validate order ID
    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      res.status(400).json({ 
        success: false,
        message: 'Invalid order ID' 
      });
      return;
    }

    // Find the order
    const order = await Order.findById(orderId)
      .populate('user', 'name phone email cashback')
      .populate('address')
      .populate('products.product', 'name price images');

    if (!order) {
      res.status(404).json({ 
        success: false,
        message: 'Order not found' 
      });
      return;
    }

    // Check if order can be cancelled
    if (order.status === 'delivered') {
      res.status(400).json({ 
        success: false,
        message: 'Cannot cancel a delivered order' 
      });
      return;
    }

    if (order.status === 'cancelled') {
      res.status(400).json({ 
        success: false,
        message: 'Order is already cancelled' 
      });
      return;
    }

    // Refund cashback to user if it was used
    if (order.cashback > 0) {
      const user = await User.findById(order.user._id);
      if (user) {
        user.cashback = Number(user.cashback) + Number(order.cashback);
        await user.save();
      }
    }

    // Decrement coupon usage count if a coupon was used
    if (order.coupon && order.coupon.couponId) {
      await Coupon.findByIdAndUpdate(order.coupon.couponId, {
        $inc: { usedCount: -1 }
      });
    }

    // Update order status to cancelled
    order.status = 'cancelled';
    if (reason) {
      order.notes = `${order.notes ? order.notes + ' | ' : ''}Cancellation reason: ${reason}`;
    }
    await order.save();

    res.status(200).json({
      success: true,
      message: 'Order cancelled successfully',
      order: order,
      refundedCashback: order.cashback > 0 ? order.cashback : 0
    });

  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error while cancelling order' 
    });
  }
};

// Get order status history (optional but useful)
export const updateOrderStatusWithTracking = async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderId, status, note } = req.body;

    // Validate order ID
    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      res.status(400).json({ 
        success: false,
        message: 'Invalid order ID' 
      });
      return;
    }

    const validStatuses = ['pending', 'processing', 'confirmed', 'shipped', 'delivered', 'cancelled'];
    
    if (!status || !validStatuses.includes(status)) {
      res.status(400).json({ 
        success: false,
        message: 'Invalid status. Valid statuses: ' + validStatuses.join(', ')
      });
      return;
    }

    const order = await Order.findById(orderId);
    
    if (!order) {
      res.status(404).json({ 
        success: false,
        message: 'Order not found' 
      });
      return;
    }

    // Update status
    order.status = status;
    if (note) {
      order.notes = `${order.notes ? order.notes + ' | ' : ''}${note}`;
    }
    
    await order.save();

    res.status(200).json({
      success: true,
      message: `Order status updated to ${status}`,
      order: order
    });

  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error while updating order status' 
    });
  }
};