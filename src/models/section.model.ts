import mongoose, { Schema, Document } from 'mongoose';

const SectionSchema: Schema = new Schema(
  {
    title: { type: String, required: true }, 
    description: { type: String, default: '' },
    place: { type: String, required: true }, 
    gallery: [
        {
          image: { type: String, required: true }, // Separate Image URL
          title: { type: String, required: true },
          description: { type: String, required: true },
        },
      ],
  },
  { timestamps: true }
);

const Section = mongoose.model('Section', SectionSchema);

export default Section;