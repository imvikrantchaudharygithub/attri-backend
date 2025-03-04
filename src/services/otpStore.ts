// services/otpStore.ts
interface OtpEntry {
    otp: string;
    expiresAt: number;
}

const otpStore: Record<string, OtpEntry> = {};

export const storeOtp =async (phone: string, otp: string, expiresInMinutes: number = 5) => {
    const expiresAt = Date.now() + expiresInMinutes * 60 * 1000;
    otpStore[phone] = { otp, expiresAt };
};  

export const verifyOtp = async (phone: string, otp: string): Promise<boolean> => {
    const entry = otpStore[phone];
    if (entry && entry.otp === otp && entry.expiresAt > Date.now()) {
        // OTP is valid, delete it from the store
        delete otpStore[phone];
        return true;
    }
    return false;
};