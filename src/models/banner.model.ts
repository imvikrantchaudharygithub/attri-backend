import mongoose, { Schema, Document } from 'mongoose';

interface IBanner extends Document {
  title: string;
  image: string;
  status: 'active' | 'inactive';
}

const BannerSchema: Schema = new Schema(
  {
    title: { type: String, required: true },
    image: { type: String, required: true }, // Image URL
    mob_image:{ type: String, required: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

const Banner = mongoose.model<IBanner>('Banner', BannerSchema);

export default Banner;