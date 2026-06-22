// models/Order.js
import mongoose, { Schema, Document } from 'mongoose';

const orderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  address: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Address',
    required: true
  },
  tracking_number: {
    type: String,
    default: null
  },
  tracking_orderid: {
    type: String,
    default: null
  },
  manifest_url: {
    type: String,
    default: null
  },
  products: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    priceAtPurchase: {
      type: Number,
      required: true
    }
  }],
  cashback: {
    type: Number,
    default: 0
  },
  cashbackEarned: {
    type: Number,
    default: 0
  },
  coupon: {
    code: {
      type: String,
      default: null
    },
    discountAmount: {
      type: Number,
      default: 0
    },
    couponId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Coupon',
      default: null
    }
  },
  originalAmount: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'confirmed', 'shipped', 'delivered', 'cancelled'],
    default: 'pending'
  },
  // payment: {
  //   method: {
  //     type: String,
  //     enum: ['credit_card', 'paypal', 'cash_on_delivery', 'other'],
  //     required: true
  //   },
  //   status: {
  //     type: String,
  //     enum: ['pending', 'completed', 'failed', 'refunded'],
  //     default: 'pending'
  //   },
  //   transactionId: String
  // },
  totalAmount: {
    type: Number,
    required: true
  },
  distributionamountTotal: {
    type: Number,
    default: 0,
    min: 0
  },
  razorpay_order_id: {
    type: String,
    default: null,
    unique: true,
    sparse: true
  },
  notes: String
}, {
  timestamps: true
});

// Add indexes for common queries
orderSchema.index({ user: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ status: 1 });

// Virtual for formatted order date
orderSchema.virtual('formattedDate').get(function() {
  return this.createdAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
});

// Pre-save hook to validate product references
orderSchema.pre('save', async function(next) {
  try {
    // Validate user exists
    await mongoose.model('User').findById(this.user);
    // Validate address exists
    await mongoose.model('Address').findById(this.address);
    
    // Validate all products exist
    await Promise.all(this.products.map(async productItem => {
      const product = await mongoose.model('Product').findById(productItem.product);
      if (!product) {
        throw new Error(`Product ${productItem.product} not found`);
      }
    }));
    
    next();
  } catch (error:any) {
    next(error);
  }
});


const Order = mongoose.model('Order', orderSchema);

export default Order;


// const order = await Order.findById(orderId)
//   .populate('user', 'name email')
//   .populate('address')
//   .populate('products.product', 'name price');