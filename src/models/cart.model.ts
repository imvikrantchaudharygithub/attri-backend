import mongoose, { Schema } from 'mongoose';

const cartItemSchema = new Schema({
    product: { 
        type: Schema.Types.ObjectId, 
        ref: 'Product',
        required: true 
    },
    quantity: { 
        type: Number, 
        required: true,
        min: 1
    },
    price: {
        type: Number,
        required: true
    }
});

const cartSchema = new Schema({
    userId: { 
        type: Schema.Types.ObjectId, 
        ref: 'User',
        required: true,
        unique: true
    },
    items: [cartItemSchema]
}, { timestamps: true });

export default mongoose.model('Cart', cartSchema); 