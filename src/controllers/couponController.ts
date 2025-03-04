import { Request, Response } from 'express';
import Coupon from '../models/coupon.model';

// Create a new coupon
export const createCoupon = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      code,
      discountType,
      discountValue,
      minPurchaseAmount,
      maxDiscountAmount,
      validFrom,
      validTo,
      products,
      usageLimit,
      status,
    } = req.body;

    const coupon = new Coupon({
      code,
      discountType,
      discountValue,
      minPurchaseAmount,
      maxDiscountAmount,
      validFrom,
      validTo,
      products,
      usageLimit,
      status,
    });

    const savedCoupon = await coupon.save();
    res.status(201).json({
      success: true,
      coupon: savedCoupon,
    });
  } catch (error) {
    console.error('Error creating coupon:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create coupon',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Get all coupons with populated products
export const getCoupons = async (req: Request, res: Response): Promise<void> => {
  try {
    const coupons = await Coupon.find().populate('products');
    res.status(200).json({
      success: true,
      count: coupons.length,
      coupons,
    });
  } catch (error) {
    console.error('Error fetching coupons:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch coupons',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Get a single coupon by code
export const getCouponByCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code } = req.params;
    const coupon = await Coupon.findOne({ 
      code: code.toUpperCase(),
      status: 'active',
      validFrom: { $lte: new Date() },
      validTo: { $gte: new Date() },
    }).populate('products');

    if (!coupon) {
      res.status(404).json({
        success: false,
        message: 'Coupon not found or expired',
      });
      return;
    }

    res.status(200).json({
      success: true,
      coupon,
    });
  } catch (error) {
    console.error('Error fetching coupon:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch coupon',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Apply coupon to calculate discount
export const applyCoupon = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, cartItems, cartTotal } = req.body;

    if (!code || !cartItems || cartTotal === undefined) {
      res.status(400).json({
        success: false,
        message: 'Coupon code, cart items, and cart total are required',
      });
      return;
    }

    // Find the active coupon
    const coupon = await Coupon.findOne({
      code: code.toUpperCase(),
      status: 'active',
      validFrom: { $lte: new Date() },
      validTo: { $gte: new Date() },
    }).populate('products');

    if (!coupon) {
      res.status(404).json({
        success: false,
        message: 'Coupon not found or expired',
      });
      return;
    }

    // Check usage limit
    if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
      res.status(400).json({
        success: false,
        message: 'Coupon usage limit exceeded',
      });
      return;
    }

    // Check minimum purchase amount
    if (coupon.minPurchaseAmount > 0 && cartTotal < coupon.minPurchaseAmount) {
      res.status(400).json({
        success: false,
        message: `Minimum purchase amount of ${coupon.minPurchaseAmount} required`,
      });
      return;
    }

    // Calculate discount
    let discountAmount = 0;
    
    // If the coupon is applicable to specific products
    if (coupon.products && coupon.products.length > 0) {
      // Filter cart items that have products eligible for the coupon
      const eligibleProductIds = coupon.products.map(p => p._id.toString());
      const eligibleCartItems = cartItems.filter((item: any) => 
        eligibleProductIds.includes(item.productId.toString())
      );
      
      // Calculate discount for eligible items
      const eligibleTotal = eligibleCartItems.reduce((total: number, item: any) => 
        total + (item.price * item.quantity), 0);
      
      if (coupon.discountType === 'percentage') {
        discountAmount = (eligibleTotal * coupon.discountValue) / 100;
      } else {
        discountAmount = coupon.discountValue;
      }
    } else {
      // Apply discount to the entire cart
      if (coupon.discountType === 'percentage') {
        discountAmount = (cartTotal * coupon.discountValue) / 100;
      } else {
        discountAmount = coupon.discountValue;
      }
    }

    // Apply maximum discount constraint if set
    if (coupon.maxDiscountAmount > 0 && discountAmount > coupon.maxDiscountAmount) {
      discountAmount = coupon.maxDiscountAmount;
    }

    // Round to 2 decimal places
    discountAmount = Math.round(discountAmount * 100) / 100;
    const finalAmount = cartTotal - discountAmount;

    res.status(200).json({
      success: true,
      message: 'Coupon applied successfully',
      coupon: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
      },
      discount: discountAmount,
      total: finalAmount,
    });
  } catch (error) {
    console.error('Error applying coupon:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to apply coupon',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Update a coupon
export const updateCoupon = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updatedCoupon = await Coupon.findByIdAndUpdate(
      id,
      req.body,
      { new: true }
    ).populate('products');
    
    if (!updatedCoupon) {
      res.status(404).json({
        success: false,
        message: 'Coupon not found',
      });
      return;
    }
    
    res.status(200).json({
      success: true,
      message: 'Coupon updated successfully',
      coupon: updatedCoupon,
    });
  } catch (error) {
    console.error('Error updating coupon:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update coupon',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Delete a coupon
export const deleteCoupon = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const deletedCoupon = await Coupon.findByIdAndDelete(id);
    
    if (!deletedCoupon) {
      res.status(404).json({
        success: false,
        message: 'Coupon not found',
      });
      return;
    }
    
    res.status(200).json({
      success: true,
      message: 'Coupon deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting coupon:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete coupon',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
