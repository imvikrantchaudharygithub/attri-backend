// scripts/migrateSkus.ts
import 'dotenv/config';
import mongoose from 'mongoose';
import Product from '../models/product.model';

async function migrateSKUs() {
  await mongoose.connect(process.env.MONGODB_URI!);
  
  const products:any = await Product.find({ sku: { $exists: false } });
  
  for (const product of products) {
    const categoryCode = product.category?.toString().slice(-4).toUpperCase() || 'GEN';
    const slugPart = (product.slug || 'product').toUpperCase().slice(0, 8);
    const uniqueId = product._id.toString().slice(-6).toUpperCase();
    product.sku = `${categoryCode}-${slugPart}-${uniqueId}`;
    await product.save();
  }
  
  console.log(`Migrated ${products.length} products`);
  await mongoose.disconnect();
  process.exit(0);
}

migrateSKUs().catch(console.error);