import mongoose, { Schema, Document } from "mongoose";


const AddressSchema = new Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    country: { type: String, default:'India' },
    zipcode: { type: String, required: true },
  },
  { timestamps: true }
);

const Address = mongoose.model("Address", AddressSchema);

export default Address;