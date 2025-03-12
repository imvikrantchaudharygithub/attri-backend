import mongoose, { Schema, Document } from 'mongoose';

const userSchema: Schema = new Schema({
    username: { type: String, required: true },
    phone:{type:Number,required: true,},
    referral_code: { type: String ,unique: true }, 
    referral_by: [{ type: Schema.Types.ObjectId, ref: 'User' }] , 
    balance:{type:Number, default:0},
    cashback:{type:Number, default:0},
    adult:{type:Boolean, default:0},
    profileimage: { type: String ,default:''}, 
    referralFamily: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    addresses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Address' }],
   
    // referral_family: { type: Number,default:0 }, 
    // email: { type: String, required: true, unique: true },
    // transaction: [{ type: Schema.Types.ObjectId, ref: 'Transaction' }],
    // withdrawl: [{ type: Schema.Types.ObjectId, ref: 'Withdrawl' }],
    // bankdetails: { type: Schema.Types.ObjectId, ref: 'UserBank' },
    // winingHistory: [{ type: Schema.Types.ObjectId, ref: 'WiningHistory' }] // Add this line

},{ timestamps: true });



const User = mongoose.model('User', userSchema);

export default User;
