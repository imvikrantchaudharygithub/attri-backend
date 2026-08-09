import mongoose, { Schema } from 'mongoose';

/**
 * Where an OTP may be redeemed. Purpose-scoping is what stops a code issued for
 * one journey being replayed into another — without it, intercepting a single
 * login SMS would let an attacker set a password and hold the account
 * permanently.
 */
export type OtpPurpose = 'login' | 'signup' | 'password_set';

export const OTP_PURPOSES: OtpPurpose[] = ['login', 'signup', 'password_set'];

const otpSchema: Schema = new Schema(
    {
        phone: { type: Number, required: true },
        /** SHA-256 of the code. A database read must not yield live OTPs. */
        otpHash: { type: String, required: true },
        purpose: { type: String, enum: OTP_PURPOSES, required: true },
        attempts: { type: Number, default: 0 },
        expiresAt: { type: Date, required: true },
    },
    { timestamps: true }
);

// Mongo removes the document once expiresAt passes — no cron, and codes cannot
// outlive their window even if the app never looks at them again.
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// The lookup path in verifyOtp: one live code per phone per purpose.
otpSchema.index({ phone: 1, purpose: 1 });

const Otp = mongoose.model('Otp', otpSchema);

export default Otp;
