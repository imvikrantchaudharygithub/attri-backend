import mongoose, { Schema, Document } from 'mongoose';
import slugify from "slugify";

const ProductCategorySchema: Schema = new Schema(
    {
      name: { type: String, required: true, unique: true },
      slug: { type: String, unique: true }, // Add slug field
      description: { type: String, default: '' },
      banner:{ type: String }, 
      image: { type: String }, // Image URL or path
      status: { type: String, enum: ['active', 'inactive'], default: 'active' }, // Category status
      products: [{ type: Schema.Types.ObjectId, ref: 'Product' }] , // Reference to ProductCategory

    },
    { timestamps: true }
  );

  // **Middleware to generate slug before saving**
  ProductCategorySchema.pre('save', function (next) {
  if (this.name) {
    this.slug = slugify(this.name.toString(), { lower: true, strict: true });
  }
  next();
});

  
  const ProductCategory = mongoose.model('ProductCategory', ProductCategorySchema);
  
  export default ProductCategory;