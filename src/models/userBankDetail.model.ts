import mongoose, { Schema, Document } from 'mongoose';


const userBankDetailSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User reference is required']
  },
  accountHolderName: {
    type: String,
    required: [true, 'Account holder name is required'],
    trim: true
  },
  accountNumber: {
    type: String,
    required: [true, 'Account number is required'],
    unique: true,
    match: [/^\d{9,18}$/, 'Invalid account number format']
  },
  ifscCode: {
    type: String,
    required: [true, 'IFSC code is required'],
    uppercase: true,
    match: [/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC code format']
  },
  bankName: {
    type: String,
    required: [true, 'Bank name is required'],
    trim: true
  },
  branchName: {
    type: String,
    trim: true
  },
 
  isDefault: {
    type: Boolean,
    default: false
  },
}, {
  timestamps: true,
});


export const UserBankDetail = mongoose.model('UserBankDetail', userBankDetailSchema);
