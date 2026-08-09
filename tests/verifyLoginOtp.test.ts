import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import User from '../src/models/user.model';
import { hashPassword } from '../src/services/passwordService';
import { storeOtp } from '../src/services/otpStore';

process.env.SECRET_KEY = process.env.SECRET_KEY || 'test-secret-key';

vi.mock('../src/services/smsSevice', () => ({
    sendSMS: vi.fn().mockResolvedValue({ return: true }),
}));

const router = (await import('../src/routes/routes')).default;

const app = express();
app.use(express.json());
app.use('/api', router);

const PHONE = 9876543210;

let refSeq = 0;
const makeUser = async (opts: { password?: string; skips?: number } = {}) =>
    User.create({
        username: 'Test User',
        phone: PHONE,
        referral_code: `SFT${Date.now()}${refSeq++}`,
        passwordSetSkips: opts.skips ?? 0,
        ...(opts.password ? { password: await hashPassword(opts.password) } : {}),
    });

const login = async (otp = '1234') =>
    request(app).post('/api/verify-login-otp').send({ phone: PHONE, otp });

describe('verify-login-otp soft gate fields', () => {
    it('flags a legacy user as needing a password, with 3 skips', async () => {
        await makeUser();
        await storeOtp(PHONE, '1234', 'login');

        const res = await login();
        expect(res.status).toBe(200);
        expect(res.body.passwordSetRequired).toBe(true);
        expect(res.body.skipsRemaining).toBe(3);
    });

    it('does not flag a user who already has a password', async () => {
        await makeUser({ password: 'alreadyset123' });
        await storeOtp(PHONE, '1234', 'login');

        const res = await login();
        expect(res.body.passwordSetRequired).toBe(false);
    });

    it('decrements skipsRemaining as skips accumulate', async () => {
        await makeUser({ skips: 1 });
        await storeOtp(PHONE, '1234', 'login');
        expect((await login()).body.skipsRemaining).toBe(2);
    });

    it('reports zero skips remaining after 3 skips', async () => {
        await makeUser({ skips: 3 });
        await storeOtp(PHONE, '1234', 'login');

        const res = await login();
        expect(res.body.passwordSetRequired).toBe(true);
        expect(res.body.skipsRemaining).toBe(0);
    });

    it('floors skipsRemaining at zero, never negative', async () => {
        await makeUser({ skips: 9 });
        await storeOtp(PHONE, '1234', 'login');
        expect((await login()).body.skipsRemaining).toBe(0);
    });

    it('still never leaks the hash', async () => {
        await makeUser({ password: 'alreadyset123' });
        await storeOtp(PHONE, '1234', 'login');

        const res = await login();
        expect(JSON.stringify(res.body)).not.toContain('$argon2id$');
        expect(res.body.user.password).toBeUndefined();
    });

    it('still returns a working token and the user', async () => {
        await makeUser();
        await storeOtp(PHONE, '1234', 'login');

        const res = await login();
        expect(res.body.token).toBeTruthy();
        expect(res.body.user.username).toBe('Test User');
        expect(res.body.message).toBe('Login successful');
    });

    it('rejects a wrong OTP unchanged', async () => {
        await makeUser();
        await storeOtp(PHONE, '1234', 'login');
        expect((await login('9999')).status).toBe(400);
    });
});
