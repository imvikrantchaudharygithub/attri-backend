import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Request } from 'express';

/**
 * Key OTP limits by phone number rather than IP: households, offices and
 * mobile carriers share IPs, and the resource being protected — the Fast2SMS
 * budget, at Rs.0.11-0.21 a message — is per-phone.
 *
 * The IP fallback must go through ipKeyGenerator. express-rate-limit v8 raises
 * ERR_ERL_KEY_GEN_IPV6 for a custom keyGenerator touching req.ip directly,
 * because a single IPv6 user controls an entire /64 and could otherwise mint
 * unlimited distinct keys. Namespacing the two kinds of key also stops a phone
 * number ever colliding with an IP string.
 */
const phoneKey = (req: Request): string => {
    const phone = req.body?.phone;
    return phone ? `phone:${phone}` : `ip:${ipKeyGenerator(req.ip ?? '')}`;
};

/** Brute-force ceiling on password login. The per-account lockout in
 *  authController is the real control; this caps volume from one source. */
export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many login attempts. Please try again in 15 minutes.' },
});

/** Short-window OTP cap. Closes a hole that predates this feature: /send-otp
 *  was completely unthrottled, so the SMS balance was drainable on demand. */
export const otpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 3,
    keyGenerator: phoneKey,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "You've requested too many codes. Please wait 15 minutes." },
});

/** Long-window OTP cap, so a patient attacker can't drip past the short one. */
export const otpHourlyLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    keyGenerator: phoneKey,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "You've requested too many codes. Please try again later." },
});
