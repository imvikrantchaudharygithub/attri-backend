// controllers/orderController.ts
import { Request, Response } from 'express';
import Order from '../models/order.model';
import User from '../models/user.model';
import Product from '../models/product.model';
import Address from '../models/address.model';

interface IOrderProduct {
  product: string;
  quantity: number;
  priceAtPurchase: number;
}

interface IPayment {
  method: string;
  status: string;
  transactionId?: string;
}

// Create new order
export const createOrder = async (req: Request, res: Response) => {
  try {
    const { user, address, products, payment, notes } = req.body;

    // Validate required fields
    if (!user || !address || !products || !payment?.method) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Check if user exists
    const userExists = await User.findById(user);
    if (!userExists) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if address exists
    const addressExists = await Address.findById(address);
    if (!addressExists) {
      return res.status(404).json({ message: 'Address not found' });
    }

    // Validate products
    let totalAmount = 0;
    const productItems: IOrderProduct[] = [];

    for (const item of products as IOrderProduct[]) {
      const product:any = await Product.findById(item.product);
      if (!product) {
        return res.status(404).json({ message: `Product ${item.product} not found` });
      }
      
      productItems.push({
        product: item.product,
        quantity: item.quantity,
        priceAtPurchase: product.price
      });

      totalAmount += product.price * item.quantity;
    }

    // Create order
    const newOrder = new Order({
      user,
      address,
      products: productItems,
      payment: {
        method: payment.method,
        status: payment.status || 'pending',
        transactionId: payment.transactionId
      },
      totalAmount,
      notes: notes || '',
      status: 'pending'
    });

    const savedOrder = await newOrder.save();
    
    res.status(201).json(savedOrder);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all orders
export const getAllOrders = async (req: Request, res: Response) => {
  try {
    const orders = await Order.find()
      .populate('user', 'name email')
      .populate('address')
      .populate('products.product', 'name price images');
      
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
      .populate('user', 'name email phone')
      .populate('address')
      .populate('products.product');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
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
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json(order);
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete order
export const deleteOrder = async (req: Request, res: Response) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ message: 'Server error' });
  }
};