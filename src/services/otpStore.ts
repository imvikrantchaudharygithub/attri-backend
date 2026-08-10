import crypto from 'crypto';
import Otp, { OtpPurpose } from '../models/otp.model';

const OTP_TTL_MINUTES = 5;
const MAX_ATTEMPTS = 5;

/**
 * SHA-256 rather than a slow KDF: a 4-digit code has a 10k keyspace, so no
 * amount of stretching would protect it offline — the attempt counter is what
 * limits guessing. Hashing exists so that reading the database does not hand
 * over live codes.
 */
const hashOtp = (otp: string): string =>
    crypto.createHash('sha256').update(String(otp)).digest('hex');

/**
 * Issue a code, replacing any previous one for the same phone and purpose.
 * State lives in Mongo, so codes survive a restart or redeploy and work across
 * multiple instances — the previous in-memory store did neither.
 */
export const storeOtp = async (
    phone: string | number,
    otp: string,
    purpose: OtpPurpose
): Promise<void> => {
    const phoneNum = Number(phone);

    // One live code per phone per purpose. Codes for other purposes are left
    // alone so parallel journeys don't clobber each other.
    await Otp.deleteMany({ phone: phoneNum, purpose });

    await Otp.create({
        phone: phoneNum,
        otpHash: hashOtp(otp),
        purpose,
        attempts: 0,
        expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
    });
};

/**
 * Redeem a code. Returns false for every failure mode — wrong code, expired,
 * burned, never issued, or issued for a different purpose.
 *
 * `purpose` is required: a code issued for one journey must never be
 * redeemable in another.
 */
export const verifyOtp = async (
    phone: string | number,
    otp: string,
    purpose: OtpPurpose
): Promise<boolean> => {
    const entry: any = await Otp.findOne({ phone: Number(phone), purpose });
    if (!entry) return false;

    // The TTL index sweeps on Mongo's own schedule (up to ~60s late), so the
    // window has to be enforced here too.
    if (entry.expiresAt.getTime() <= Date.now()) {
        await Otp.deleteOne({ _id: entry._id });
        return false;
    }

    if (entry.attempts >= MAX_ATTEMPTS) {
        await Otp.deleteOne({ _id: entry._id });
        return false;
    }

    if (entry.otpHash !== hashOtp(otp)) {
        await Otp.updateOne({ _id: entry._id }, { $inc: { attempts: 1 } });
        return false;
    }

    // Single-use.
    await Otp.deleteOne({ _id: entry._id });
    return true;
};
