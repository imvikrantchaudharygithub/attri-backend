import mongoose, { Schema, Document } from 'mongoose';

const userSchema: Schema = new Schema({
    username: { type: String, required: true },
    phone:{type:Number,required: true,},
    /**
     * argon2id hash. select:false keeps it out of every existing query —
     * getAllUsers, getUserByToken, verifyLoginOtp and the admin users table all
     * return user documents and none of them should ever see this. Only the
     * password-login path opts back in with .select('+password').
     * Absent = legacy user who has not set a password yet.
     */
    password: { type: String, select: false },
    /** Not select:false — My Profile shows "Last changed" from this. */
    passwordSetAt: { type: Date },
    /** Soft-gate skip counter. Server-side so clearing localStorage can't reset it. */
    passwordSetSkips: { type: Number, default: 0 },
    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: { type: Date },
    referral_code: { type: String ,unique: true }, 
    referral_by: [{ type: Schema.Types.ObjectId, ref: 'User' }] , 
    balance:{type:Number, default:0},
    cashback:{type:Number, default:0},
    adult:{type:Boolean, default:0},
    dateofbirth: { type: Date },
    profileimage: { type: String ,default:''}, 
    referralFamily: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    addresses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Address' }],
   bankDetails: [{ type: mongoose.Schema.Types.ObjectId, ref: 'UserBankDetail' }],
    recommendedUser: { type: Boolean, default: false },
    commissionHistory: [{
        amount: { type: Number, required: true },
        date: { type: Date, default: Date.now },
        level: { type: Number, required: true },
        fromUser: { type: Schema.Types.ObjectId, ref: 'User' }
    }],
    // referral_family: { type: Number,default:0 }, 
    // email: { type: String, required: true, unique: true },
    // transaction: [{ type: Schema.Types.ObjectId, ref: 'Transaction' }],
    // withdrawl: [{ type: Schema.Types.ObjectId, ref: 'Withdrawl' }],
    // bankdetails: { type: Schema.Types.ObjectId, ref: 'UserBank' },
    // winingHistory: [{ type: Schema.Types.ObjectId, ref: 'WiningHistory' }] // Add this line

},{ timestamps: true });



const User = mongoose.model('User', userSchema);

export default User;
