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
    stock: { type: Number, default: 0 }, // Stock count
    rating: { type: Number, default: 0 }, // Rating
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductCategory', required: true }, // Reference to ProductCategory
    images: { type: [String]}, // Image URL or path
    status: { type: String, enum: ['active', 'inactive'], default: 'active' }, // Status of the product
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
  },
  { timestamps: true }
);

// ✅ Generate slug before saving
// **Middleware to generate slug before saving**
ProductSchema.pre('save', function (next) {
    if (this.name) {
      this.slug = slugify(this.name.toString(), { lower: true, strict: true });
    }
    next();
  });

const Product = mongoose.model('Product', ProductSchema);

export default Product;