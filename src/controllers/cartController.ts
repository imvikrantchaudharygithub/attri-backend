import { Request, Response } from 'express';
import Cart from '../models/cart.model';
import Product from '../models/product.model';
import mongoose from 'mongoose';
import User from '../models/user.model';
import { IAddress } from '../models/address.model';

interface AuthenticatedRequest extends Request {
    userId?: string;
}

export const addToCart = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const userId = req.userId;
        const { productId, quantity } = req.body;

        // Validate input
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            res.status(401).json({ message: "Invalid user authentication" });
            return;
        }

        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
            res.status(400).json({ message: "Invalid product ID" });
            return;
        }

        const numericQuantity = Number(quantity) || 1;

        // Verify product exists
        const product = await Product.findById(productId);
        if (!product) {
            res.status(404).json({ message: "Product not found" });
            return;
        }

        // Find or create cart
        let cart = await Cart.findOne({ userId });

        if (!cart) {
            cart = await Cart.create({ userId, items: [] });
        }

        // Check for existing item using atomic update
        const existingItemIndex = cart.items.findIndex(item => 
            item.product.toString() === productId
        );

        if (existingItemIndex > -1) {
            // Increment existing quantity
            cart.items[existingItemIndex].quantity += numericQuantity;
        } else {
            // Add new item
            cart.items.push({
                product: new mongoose.Types.ObjectId(productId),
                quantity: numericQuantity,
                price: product.price
            });
        }

        // Save and return updated cart
        const updatedCart = await cart.save();
        await updatedCart.populate('items.product', 'name price images');

        res.status(200).json({
            message: "Cart updated successfully",
            cart: updatedCart
        });

    } catch (error: any) {
        console.error("Cart error:", error);
        res.status(500).json({
            message: "Failed to update cart",
            error: error.message
        });
    }
};

export const getCart = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const userId = req.params.userId;
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            res.status(401).json({ message: "Invalid user authentication" });
            return;
        }

        const cart = await Cart.findOne({ userId }).populate('items.product', 'name price images discount mrp');
        
        // Get user's default address with proper population
        const user = await User.findById(userId)
            .select('addresses')
            .populate({
                path: 'addresses',
                match: { isDefault: true }
            });

        // Find the first (and only) default address from populated array
        const defaultAddress = (user?.addresses as IAddress[] | undefined)?.find(addr => addr.isDefault===true) || null;
        const userDetails = await User.findById(userId).select('name phone cashback referral_code');
        res.status(200).json({
            message: "Cart retrieved successfully",
            cart,
            defaultAddress,
            userDetails
        });
    } catch (error: any) {
        console.error("Cart error:", error);
        res.status(500).json({
            message: "Failed to retrieve cart",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

export const deleteCartItem = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const userId = req.userId;
        const { productId } = req.body;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            res.status(401).json({ message: "Invalid user authentication" });
            return;
        }

        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
            res.status(400).json({ message: "Invalid product ID" });
            return;
        }

        const cart = await Cart.findOneAndUpdate(
            { userId },
            { $pull: { items: { product: productId } } },
            { new: true }
        ).populate('items.product', 'name price images');

        if (!cart) {
            res.status(404).json({ message: "Cart not found" });
            return;
        }

        res.status(200).json({
            message: "Product removed from cart",
            cart
        });

    } catch (error: any) {
        console.error("Cart error:", error);
        res.status(500).json({
            message: "Failed to remove product from cart",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

export const updateCartItem = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const userId = req.userId;
        const { productId, quantity } = req.body;


        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            res.status(401).json({ message: "Invalid user authentication" });
            return;
        }

        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
            res.status(400).json({ message: "Invalid product ID" });
            return;
        }

        const numericQuantity = Number(quantity) || 1;

        const cart = await Cart.findOneAndUpdate(
            { userId, 'items.product': productId },
            { $set: { 'items.$.quantity': numericQuantity } },
            { new: true }
        ).populate('items.product', 'name price images');

        if (!cart) {
            res.status(404).json({ message: "Cart not found" });
            return;
        }

        res.status(200).json({
            message: "Cart item updated successfully",
            cart
        });

    } catch (error: any) {
        console.error("Cart error:", error);
        res.status(500).json({
            message: "Failed to update cart item",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};
export const addBulkCartItems = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const userId = req.userId;
        const { items } = req.body;

        // Validate user
        if (!userId || !mongoose.Types.ObjectId.isValid(userId.toString())) {
            res.status(401).json({ message: "Invalid user authentication" });
            return;
        }

        // Validate items array
        if (!Array.isArray(items) || items.length === 0) {
            res.status(400).json({ message: "Invalid or empty items array" });
            return;
        }

        // Add debugging to see what's coming in
        console.log("Received items:", JSON.stringify(items));

        // More flexible validation that handles both string and numeric values
        const validatedItems = [];
        const invalidItems = [];

        for (const item of items) {
            const validationErrors = [];
            
            if (!item.productId) validationErrors.push("Missing productId");
            else if (!mongoose.Types.ObjectId.isValid(String(item.productId))) 
                validationErrors.push("Invalid productId format");
            
            const quantity = Number(item.quantity);
            if (isNaN(quantity) || quantity <= 0) 
                validationErrors.push("Invalid quantity (must be positive number)");
            
            if (validationErrors.length === 0) {
                validatedItems.push({
                    productId: String(item.productId),
                    quantity: quantity,
                });
            } else {
                invalidItems.push({
                    item,
                    errors: validationErrors
                });
            }
        }

        // Verify products exist and get prices
        const productIds = validatedItems.map(item => item.productId);
        const products = await Product.find({ _id: { $in: productIds } });
        
        const validItemsWithPrices = [];
        for (const item of validatedItems) {
            const product = products.find(p => (p as any)._id.toString() === item.productId);
            if (!product) {
                invalidItems.push({
                    item,
                    errors: ["Product not found"]
                });
            } else {
                validItemsWithPrices.push({
                    ...item,
                    price: product.price
                });
            }
        }

        if (validItemsWithPrices.length === 0) {
            res.status(400).json({ 
                message: "All items have invalid structure", 
                invalidItems: invalidItems
            });
            return;
        }

        // Continue with your existing code, but use validatedItems instead
        // First, ensure cart exists
        await Cart.findOneAndUpdate(
            { userId },
            { $setOnInsert: { userId, items: [] } },
            { upsert: true }
        );

        // Prepare bulk operations for updating existing items
        const bulkOps = [];
        
        // Update quantities for existing items
        for (const item of validItemsWithPrices) {
            bulkOps.push({
                updateOne: {
                    filter: { 
                        userId: userId,
                        "items.product": new mongoose.Types.ObjectId(item.productId) 
                    },
                    update: {
                        $set: { 
                            "items.$.quantity": item.quantity,
                            "items.$.price": item.price 
                        }
                    }
                }
            });
        }

        // For new items, we'll add them separately
        const cart = await Cart.findOne({ userId });
        const existingProductIds = cart?.items.map(item => item.product.toString()) || [];
        
        const newItems = validItemsWithPrices.filter(item => 
            !existingProductIds.includes(item.productId)
        );

        if (newItems.length > 0) {
            bulkOps.push({
                updateOne: {
                    filter: { userId },
                    update: {
                        $push: {
                            items: {
                                $each: newItems.map(item => ({
                                    product: new mongoose.Types.ObjectId(item.productId),
                                    quantity: item.quantity,
                                    price: item.price
                                }))
                            }
                        }
                    }
                }
            });
        }

        // Execute bulk operations if there are any
        if (bulkOps.length > 0) {
            await Cart.bulkWrite(bulkOps);
        }

        // Get updated cart
        const updatedCart = await Cart.findOne({ userId })
            .populate('items.product', 'name price images');

        // If we had some invalid items but some valid ones too, report partial success
        if (invalidItems.length > 0) {
            res.status(207).json({
                message: "Some items processed successfully, but others had invalid structure",
                cart: updatedCart || { items: [] },
                invalidItems: invalidItems
            });
        } else {
            res.status(200).json({
                message: "Bulk cart items processed successfully",
                cart: updatedCart || { items: [] }
            });
        }

    } catch (error: any) {
        console.error("Bulk cart error:", error);
        res.status(500).json({
            message: "Failed to process bulk cart items",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

export const increaseCartItemQuantity = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const userId = req.userId;
        const { productId } = req.body;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            res.status(401).json({ message: "Invalid user authentication" });
            return;
        }

        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
            res.status(400).json({ message: "Invalid product ID" });
            return;
        }

        const cart = await Cart.findOneAndUpdate(
            { userId, 'items.product': productId },
            { $inc: { 'items.$.quantity': 1 } },
            { new: true }
        ).populate('items.product', 'name price images');

        if (!cart) {
            res.status(404).json({ message: "Cart or product not found" });
            return;
        }

        res.status(200).json({
            message: "Quantity increased successfully",
            cart
        });

    } catch (error: any) {
        console.error("Cart error:", error);
        res.status(500).json({
            message: "Failed to increase quantity",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

export const decreaseCartItemQuantity = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const userId = req.userId;
        const { productId } = req.body;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            res.status(401).json({ message: "Invalid user authentication" });
            return;
        }

        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
            res.status(400).json({ message: "Invalid product ID" });
            return;
        }

        // First check current quantity
        const currentCart = await Cart.findOne({ 
            userId, 
            'items.product': productId 
        });
        
        if (!currentCart) {
            res.status(404).json({ message: "Cart or product not found" });
            return;
        }
        
        const item = currentCart.items.find(item => 
            item.product.toString() === productId
        );
        
        if (!item) {
            res.status(404).json({ message: "Product not in cart" });
            return;
        }
        
        // If quantity is 1, remove the item
        if (item.quantity <= 1) {
            await Cart.findOneAndUpdate(
                { userId },
                { $pull: { items: { product: productId } } },
                { new: true }
            );
            
            const updatedCart = await Cart.findOne({ userId })
                .populate('items.product', 'name price images');
                
            res.status(200).json({
                message: "Item removed from cart",
                cart: updatedCart
            });
            return;
        }
        
        // Otherwise decrease quantity by 1
        const cart = await Cart.findOneAndUpdate(
            { userId, 'items.product': productId },
            { $inc: { 'items.$.quantity': -1 } },
            { new: true }
        ).populate('items.product', 'name price images');

        res.status(200).json({
            message: "Quantity decreased successfully",
            cart
        });

    } catch (error: any) {
        console.error("Cart error:", error);
        res.status(500).json({
            message: "Failed to decrease quantity",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

export const emptyCart = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const userId = req.userId;

        // Validate user authentication
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            res.status(401).json({ message: "Invalid user authentication" });
            return;
        }

        // Find and clear the cart using atomic update
        const clearedCart = await Cart.findOneAndUpdate(
            { userId },
            { $set: { items: [] } },
            { new: true, runValidators: true }
        ).populate('items.product', 'name price images');

        if (!clearedCart) {
            res.status(404).json({ message: "Cart not found" });
            return;
        }

        res.status(200).json({
            message: "Cart emptied successfully",
            cart: clearedCart
        });

    } catch (error: any) {
        console.error("Cart clearance error:", error);
        res.status(500).json({
            message: "Failed to empty cart",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};
