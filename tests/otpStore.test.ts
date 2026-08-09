import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { storeOtp, verifyOtp } from '../src/services/otpStore';
import Otp from '../src/models/otp.model';

const PHONE = 9876543210;

describe('otpStore', () => {
    it('verifies a correct code for the matching purpose', async () => {
        await storeOtp(PHONE, '1234', 'login');
        expect(await verifyOtp(PHONE, '1234', 'login')).toBe(true);
    });

    it('rejects a wrong code', async () => {
        await storeOtp(PHONE, '1234', 'login');
        expect(await verifyOtp(PHONE, '9999', 'login')).toBe(false);
    });

    it('rejects when no code was ever issued', async () => {
        expect(await verifyOtp(PHONE, '1234', 'login')).toBe(false);
    });

    // The core security property: a code issued for one journey must not be
    // redeemable in another.
    it('rejects a login code presented for password_set', async () => {
        await storeOtp(PHONE, '1234', 'login');
        expect(await verifyOtp(PHONE, '1234', 'password_set')).toBe(false);
    });

    it('rejects a password_set code presented for login', async () => {
        await storeOtp(PHONE, '1234', 'password_set');
        expect(await verifyOtp(PHONE, '1234', 'login')).toBe(false);
    });

    it('rejects a signup code presented for login', async () => {
        await storeOtp(PHONE, '1234', 'signup');
        expect(await verifyOtp(PHONE, '1234', 'login')).toBe(false);
    });

    it('leaves a mismatched-purpose code intact for its own purpose', async () => {
        await storeOtp(PHONE, '1234', 'login');
        await verifyOtp(PHONE, '1234', 'password_set'); // wrong purpose, ignored
        expect(await verifyOtp(PHONE, '1234', 'login')).toBe(true);
    });

    it('is single-use', async () => {
        await storeOtp(PHONE, '1234', 'login');
        expect(await verifyOtp(PHONE, '1234', 'login')).toBe(true);
        expect(await verifyOtp(PHONE, '1234', 'login')).toBe(false);
    });

    it('never stores the code in plaintext', async () => {
        await storeOtp(PHONE, '1234', 'login');
        const doc: any = await Otp.findOne({ phone: PHONE });
        expect(doc.otpHash).not.toBe('1234');
        expect(doc.otpHash).toHaveLength(64);
        expect(JSON.stringify(doc)).not.toContain('"1234"');
    });

    it('rejects an expired code', async () => {
        await storeOtp(PHONE, '1234', 'login');
        await Otp.updateOne({ phone: PHONE }, { expiresAt: new Date(Date.now() - 1000) });
        expect(await verifyOtp(PHONE, '1234', 'login')).toBe(false);
    });

    it('burns the code after 5 failed attempts', async () => {
        await storeOtp(PHONE, '1234', 'login');
        for (let i = 0; i < 5; i++) {
            expect(await verifyOtp(PHONE, '0000', 'login')).toBe(false);
        }
        // Correct code no longer works — the entry was burned.
        expect(await verifyOtp(PHONE, '1234', 'login')).toBe(false);
    });

    it('replaces a previous code for the same phone and purpose', async () => {
        await storeOtp(PHONE, '1111', 'login');
        await storeOtp(PHONE, '2222', 'login');
        expect(await Otp.countDocuments({ phone: PHONE, purpose: 'login' })).toBe(1);
        expect(await verifyOtp(PHONE, '1111', 'login')).toBe(false);
    });

    it('keeps codes for different purposes side by side', async () => {
        await storeOtp(PHONE, '1111', 'login');
        await storeOtp(PHONE, '2222', 'password_set');
        expect(await Otp.countDocuments({ phone: PHONE })).toBe(2);
        expect(await verifyOtp(PHONE, '2222', 'password_set')).toBe(true);
        expect(await verifyOtp(PHONE, '1111', 'login')).toBe(true);
    });

    it('accepts a phone passed as a string', async () => {
        await storeOtp('9876543210', '1234', 'login');
        expect(await verifyOtp(9876543210, '1234', 'login')).toBe(true);
    });

    // State must live in Mongo, not process memory: the previous in-memory
    // store lost every pending code on each deploy and could not work across
    // more than one instance. Writing the row directly — never calling
    // storeOtp — proves verifyOtp reads from the database.
    it('reads codes written by another process', async () => {
        const hash = crypto.createHash('sha256').update('4321').digest('hex');
        await Otp.create({
            phone: PHONE,
            otpHash: hash,
            purpose: 'login',
            attempts: 0,
            expiresAt: new Date(Date.now() + 60000),
        });
        expect(await verifyOtp(PHONE, '4321', 'login')).toBe(true);
    });
});
