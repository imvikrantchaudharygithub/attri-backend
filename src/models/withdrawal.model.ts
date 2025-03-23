import mongoose, { Schema, Document } from 'mongoose';

const withdrawalSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User reference is required']
  },
  amount: {
    type: Number,
    required: [true, 'Withdrawal amount is required'],
    min: [1, 'Withdrawal amount must be at least 1']
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'processing'],
    default: 'pending'
  },
  bankDetail: {
    type: Schema.Types.ObjectId,
    ref: 'UserBankDetail',
    required: [true, 'Bank detail reference is required']
  },
  processedAt: Date
}, {
  timestamps: true
});

export const Withdrawal = mongoose.model('Withdrawal', withdrawalSchema);
