import mongoose, { Schema, Document } from "mongoose";

export interface IAddress extends Document {
  name: string;
  street: string;
  city: string;
  state: string;
  country: string;
  pincode: string;
  contact: string;
  userId: mongoose.Types.ObjectId;
  isDefault: boolean;
}

const AddressSchema: Schema = new Schema(
  {
    street: { type: String, required: true },
    name: { type: String, required: true ,default:""},
    city: { type: String, required: true },
    state: { type: String, required: true },
    country: { type: String, required: true ,default:"India"},
    pincode: { type: String, required: true },
    contact: { type: String, required: true },
    type: { type: String, required: true, enum: ['home', 'office', 'other'] },
    isDefault: { type: Boolean, default: false, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);

// // Add compound unique index for default address
// AddressSchema.index({ userId: 1, isDefault: 1 }, { 
//   unique: true, 
//   partialFilterExpression: { isDefault: true } 
// });

// // Add before model creation
// AddressSchema.pre('save', async function(next) {
//   if (this.isModified('isDefault') && this.isDefault) {
//     try {
//       await mongoose.model('Address').updateMany(
//         { userId: this.userId, isDefault: true },
//         { $set: { isDefault: false } }
//       );
//       next();
//     } catch (error) {
//       next(error as Error);
//     }
//   } else {
//     next();
//   }
// });

const Address = mongoose.model<IAddress>("Address", AddressSchema);

export default Address;