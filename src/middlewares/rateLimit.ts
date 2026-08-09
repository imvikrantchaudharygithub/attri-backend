import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Request, RequestHandler } from 'express';

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
export const phoneKey = (req: Request): string => {
    const phone = req.body?.phone;
    return phone ? `phone:${phone}` : `ip:${ipKeyGenerator(req.ip ?? '')}`;
};

/**
 * Ceilings are env-overridable so the test suite can raise them without ever
 * switching the limiter off. Disabling on NODE_ENV would mean a misconfigured
 * environment silently ships with no rate limiting at all; raising a number
 * keeps the middleware in the request path either way.
 */
const limitFrom = (raw: string | undefined, fallback: number): number => {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : fallback;
};

const MINUTES = 60 * 1000;

/** Brute-force ceiling on password login, keyed by IP. The per-account lockout
 *  in authController is the real control; this caps volume from one source. */
export const makeLoginLimiter = (limit: number, windowMs = 15 * MINUTES): RequestHandler =>
    rateLimit({
        windowMs,
        limit,
        standardHeaders: true,
        legacyHeaders: false,
        message: { message: 'Too many login attempts. Please try again in 15 minutes.' },
    });

/** OTP send cap, keyed by phone. */
export const makeOtpLimiter = (
    limit: number,
    windowMs: number,
    message: string
): RequestHandler =>
    rateLimit({
        windowMs,
        limit,
        keyGenerator: phoneKey,
        standardHeaders: true,
        legacyHeaders: false,
        message: { message },
    });

export const loginLimiter = makeLoginLimiter(
    limitFrom(process.env.AUTH_LOGIN_RATE_LIMIT, 10)
);

/** Short-window OTP cap. Closes a hole that predates this feature: /send-otp
 *  was completely unthrottled, so the SMS balance was drainable on demand. */
export const otpLimiter = makeOtpLimiter(
    limitFrom(process.env.AUTH_OTP_RATE_LIMIT, 3),
    15 * MINUTES,
    "You've requested too many codes. Please wait 15 minutes."
);

/** Long-window OTP cap, so a patient attacker can't drip past the short one. */
export const otpHourlyLimiter = makeOtpLimiter(
    limitFrom(process.env.AUTH_OTP_HOURLY_RATE_LIMIT, 10),
    60 * MINUTES,
    "You've requested too many codes. Please try again later."
);
