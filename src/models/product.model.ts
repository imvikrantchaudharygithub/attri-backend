import mongoose, { Schema, Document } from 'mongoose';
import slugify from "slugify";

const ProductSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, unique: true }, // Add slug field
    description: { type: String, default: '' },
    mrp: { type: Number, required: true }, // Original price
    price: { type: Number, required: true }, // Selling price
    discount: { type: Number, default: 0 }, // Discount percentage or fixed amount
    distributionamount: { type: Number, default: 0, min: 0 }, // Distribution amount for commission base
    stock: { type: Number, default: 0 }, // Stock count
    rating: { type: Number, default: 0 }, // Rating
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductCategory', required: true }, // Reference to ProductCategory
    images: { type: [String]}, // Image URL or path
    status: { type: String, enum: ['active', 'inactive'], default: 'active' }, // Status of the product
    isRecommended: { type: Boolean, default: false }, // Show in cart recommendations carousel
    tags: { type: [String], default: [] }, // Tags of the product
    gallery: [
        {
          image: { type: String, required: true }, // Separate Image URL
          title: { type: String, required: true },
          description: { type: String, required: true },
        },
      ],
      faqs: [
        {
          question: { type: String, required: true },
          answer: { type: String, required: true }
        }
      ],
      ingredients: [ {
        image: { type: String, required: true }, // Separate Image URL
        title: { type: String, required: true },
        description: { type: String, required: true },
      },],
      info: [ {
        title: { type: String, required: true },
        description: { type: String, required: true },
      },],
    sku: {
      type: String,
      required: true,
      unique: true,
      default: function() {
        // Auto-generate SKU if not provided
        const prod = this as any;
        const categoryCode = prod.category?.toString().slice(-4).toUpperCase() || 'GEN';
        const slugPart = prod.slug?.toUpperCase().slice(0, 8) || 'PROD';
        const uniqueId = prod._id.toString().slice(-6).toUpperCase();
        return `${categoryCode}-${slugPart}-${uniqueId}`;
      }
    },
  },
  { timestamps: true }
);

// ✅ Generate slug before saving
// **Middleware to generate slug before saving**
ProductSchema.pre('save', function (next) {
  const product = this as any;
  
  // Generate slug if name is modified
  if (product.isModified('name')) {
    product.slug = slugify(product.name.toString(), { 
      lower: true,
      strict: true,
      replacement: '-'
    });
  }

  // Generate SKU if not provided
  if (!product.sku) {
    const categoryCode = product.category?.toString().slice(-4).toUpperCase() || 'GEN';
    const slugPart = product.slug?.toUpperCase().slice(0, 8) || 'PROD';
    const uniqueId = product._id.toString().slice(-6).toUpperCase();
    product.sku = `${categoryCode}-${slugPart}-${uniqueId}`;
  }
  
  next();
});

const Product = mongoose.model('Product', ProductSchema);

export default Product;