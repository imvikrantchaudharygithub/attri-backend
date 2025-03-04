import mongoose, { Schema, Document } from "mongoose";

const PurchaseSchema: Schema = new Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    products: [{ type: Schema.Types.ObjectId, ref: 'Product' }] , 

  },
  { timestamps: true }
);

export const Purchase = mongoose.model("Purchase", PurchaseSchema);