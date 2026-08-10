import { Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import User from '../models/user.model';
import { storeOtp, verifyOtp } from '../services/otpStore';
import { sendSMS } from '../services/smsSevice';
import { hashPassword, verifyPassword, validatePassword } from '../services/passwordService';
import {
    ACCOUNT_LOCK_THRESHOLD,
    ACCOUNT_LOCK_MINUTES,
    MAX_PASSWORD_SET_SKIPS,
} from '../config/authConfig';

dotenv.config();
const secretKey: string = process.env.SECRET_KEY as string;

/**
 * One message for every failure cause — wrong password, unknown number, legacy
 * account with no password, locked account. Do not branch this: any variation
 * turns the login form into an account-enumeration oracle.
 */
const GENERIC_AUTH_ERROR = 'Invalid mobile number or password';

/** `tv` is checked by verifyToken against the user's current tokenVersion, so a
 *  password change invalidates every token minted before it. */
const signToken = (userId: string, tokenVersion: number = 0): string =>
    jwt.sign({ userId, tv: tokenVersion }, secretKey, { expiresIn: '168h' });

const isLocked = (user: any): boolean =>
    Boolean(user.lockedUntil && user.lockedUntil.getTime() > Date.now());

/** POST /api/auth/login-password */
export const loginWithPassword = async (req: Request, res: Response): Promise<void> => {
    const { phone, password } = req.body;

    if (!phone || !password) {
        res.status(400).json({ message: 'Mobile number and password are required' });
        return;
    }
    if (!secretKey) {
        console.error('SECRET_KEY is not defined');
        res.status(500).json({ message: 'Internal server error' });
        return;
    }

    try {
        const user: any = await User.findOne({ phone: Number(phone) }).select('+password');

        // Unknown account: still burn argon2 time, so response latency cannot
        // distinguish "no such user" from "wrong password".
        if (!user) {
            await verifyPassword(undefined, String(password));
            res.status(401).json({ message: GENERIC_AUTH_ERROR });
            return;
        }

        // Locked accounts get the same generic error — telling an attacker the
        // account is locked confirms their guessing found a real one.
        if (isLocked(user)) {
            await verifyPassword(undefined, String(password));
            res.status(401).json({ message: GENERIC_AUTH_ERROR });
            return;
        }

        const ok = await verifyPassword(user.password, String(password));

        if (!ok) {
            const failures = (user.failedLoginCount || 0) + 1;
            const update: Record<string, unknown> = { failedLoginCount: failures };
            if (failures >= ACCOUNT_LOCK_THRESHOLD) {
                update.lockedUntil = new Date(Date.now() + ACCOUNT_LOCK_MINUTES * 60 * 1000);
            }
            await User.updateOne({ _id: user._id }, update);
            res.status(401).json({ message: GENERIC_AUTH_ERROR });
            return;
        }

        await User.updateOne({ _id: user._id }, { failedLoginCount: 0, lockedUntil: null });

        // Re-read without +password so the hash cannot reach the response body.
        const safeUser = await User.findById(user._id);
        res.status(200).json({
            message: 'Login successful',
            user: safeUser,
            token: signToken(user._id.toString(), user.tokenVersion || 0),
        });
    } catch (error) {
        console.error('loginWithPassword error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * POST /api/auth/password/otp
 *
 * Always 202, registered or not. A "no account found" branch would turn the
 * reset form into a customer-list scraper — the classic enumeration leak.
 */
export const sendPasswordOtp = async (req: Request, res: Response): Promise<void> => {
    const { phone } = req.body;

    if (!phone) {
        res.status(400).json({ message: 'Mobile number is required' });
        return;
    }

    // Respond before any account-dependent work: identical status, identical
    // body, and no measurable timing difference between a registered and an
    // unregistered number.
    res.status(202).json({ message: 'If that number has an account, a code is on its way.' });

    try {
        const user = await User.findOne({ phone: Number(phone) });
        if (!user) return;

        const otp = crypto.randomInt(1000, 9999).toString();
        await storeOtp(phone, otp, 'password_set');
        await sendSMS(String(phone), Number(otp));
    } catch (error) {
        // Log only. The response has already gone out, and the client must not
        // learn whether delivery succeeded.
        console.error('sendPasswordOtp error:', error);
    }
};

/**
 * POST /api/auth/password/set
 *
 * Serves three journeys with one code path — the soft gate, forgot-password,
 * and a My Profile change. All three are the same operation: prove you own the
 * phone, then write a new hash.
 *
 * Which proof is required depends on whether a password already exists:
 *   - none yet (first set) → a valid JWT alone. The user proved phone
 *     ownership via OTP login seconds ago, so re-sending would spend an SMS
 *     for no security gain.
 *   - already set (change) → phone + a password_set OTP, always. A stolen
 *     token must not be able to rewrite the password and lock the owner out.
 */
export const setPassword = async (req: Request, res: Response): Promise<void> => {
    const { phone, otp, password } = req.body;

    // Validated before the OTP is touched, so a policy rejection doesn't
    // consume the user's code and force another SMS.
    const policyError = validatePassword(password);
    if (policyError) {
        res.status(400).json({ message: policyError });
        return;
    }

    try {
        let user: any = null;
        let provedByToken = false;

        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
            try {
                const decoded: any = jwt.verify(authHeader.split(' ')[1], secretKey);
                const candidate: any = await User.findById(decoded.userId).select('+password');
                if (candidate) {
                    user = candidate;
                    provedByToken = true;
                }
            } catch {
                // Invalid or expired token — fall through to the OTP path.
            }
        }

        if (provedByToken && user.password) {
            res.status(401).json({
                message: 'Verify your mobile number to change your password',
            });
            return;
        }

        if (!provedByToken) {
            if (!phone || !otp) {
                res.status(400).json({ message: 'Mobile number and OTP are required' });
                return;
            }

            const verified = await verifyOtp(phone, String(otp), 'password_set');
            if (!verified) {
                res.status(400).json({ message: 'Invalid or expired OTP' });
                return;
            }

            user = await User.findOne({ phone: Number(phone) });
            if (!user) {
                // Same message as a bad code: never confirm the account exists.
                res.status(400).json({ message: 'Invalid or expired OTP' });
                return;
            }
        }

        // Bumping the version evicts every other device. The caller gets a
        // token carrying the new value, so the person who just changed the
        // password stays logged in while everyone else is signed out.
        const nextVersion = (user.tokenVersion || 0) + 1;

        await User.updateOne(
            { _id: user._id },
            {
                password: await hashPassword(String(password)),
                passwordSetAt: new Date(),
                // A successful reset is also the recovery path out of a lockout.
                failedLoginCount: 0,
                lockedUntil: null,
                tokenVersion: nextVersion,
            }
        );

        const safeUser = await User.findById(user._id);
        res.status(200).json({
            message: 'Password saved',
            user: safeUser,
            token: signToken(user._id.toString(), nextVersion),
        });
    } catch (error) {
        console.error('setPassword error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * POST /api/auth/password/skip
 *
 * Server-side so clearing localStorage cannot reset the counter and keep the
 * gate open forever.
 */
export const skipPasswordSetup = async (
    req: Request & { userId?: string },
    res: Response
): Promise<void> => {
    try {
        const user: any = await User.findByIdAndUpdate(
            req.userId,
            { $inc: { passwordSetSkips: 1 } },
            { new: true }
        );

        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        res.status(200).json({
            message: 'Skipped',
            skipsRemaining: Math.max(0, MAX_PASSWORD_SET_SKIPS - (user.passwordSetSkips || 0)),
        });
    } catch (error) {
        console.error('skipPasswordSetup error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
