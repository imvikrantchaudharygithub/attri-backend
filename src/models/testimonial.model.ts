import mongoose, { Schema, Document } from 'mongoose';

export interface ITestimonial extends Document {
  title: string;
  description: string;
  author: string;
  rating: number;
  profilePic: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const testimonialSchema: Schema = new Schema({
  title: { 
    type: String, 
    required: true 
  },
  description: { 
    type: String, 
    required: true 
  },
  author: { 
    type: String, 
    required: true 
  },
  rating: { 
    type: Number, 
    required: true,
    min: 1,
    max: 5 
  },
  profilePic: { 
    type: String,
    default: '' 
  },
  isActive: { 
    type: Boolean, 
    default: true 
  }
}, { 
  timestamps: true 
});

const Testimonial = mongoose.model<ITestimonial>('Testimonial', testimonialSchema);

export default Testimonial;
