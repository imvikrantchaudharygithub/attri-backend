import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import User from '../src/models/user.model';
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
const makeUser = () =>
    User.create({
        username: 'Existing User',
        phone: PHONE,
        referral_code: `FLG${Date.now()}${refSeq++}`,
    });

// The flag is read per-request, so it can be toggled between cases.
afterEach(() => {
    delete process.env.AUTH_OTP_LOGIN_ENABLED;
});

describe('AUTH_OTP_LOGIN_ENABLED', () => {
    it('allows OTP login when unset (default)', async () => {
        await makeUser();
        await storeOtp(PHONE, '1234', 'login');
        const res = await request(app).post('/api/verify-login-otp').send({ phone: PHONE, otp: '1234' });
        expect(res.status).toBe(200);
    });

    it('blocks OTP login when the flag is off', async () => {
        await makeUser();
        await storeOtp(PHONE, '1234', 'login');
        process.env.AUTH_OTP_LOGIN_ENABLED = 'false';

        const res = await request(app).post('/api/verify-login-otp').send({ phone: PHONE, otp: '1234' });
        expect(res.status).toBe(403);
        expect(res.body.message).toContain('password');
    });

    it('blocks sending a LOGIN otp when the flag is off', async () => {
        await makeUser();
        process.env.AUTH_OTP_LOGIN_ENABLED = 'false';

        const res = await request(app).post('/api/send-otp').send({ phone: PHONE, newuser: false });
        expect(res.status).toBe(403);
    });

    // Signup and password reset must keep working: phone ownership still has
    // to be proven somewhere, and this flag must never block that.
    it('still allows sending a SIGNUP otp when login OTP is off', async () => {
        process.env.AUTH_OTP_LOGIN_ENABLED = 'false';
        const res = await request(app).post('/api/send-otp').send({ phone: PHONE, newuser: true });
        expect(res.status).toBe(200);
    });

    it('still allows completing SIGNUP when login OTP is off', async () => {
        process.env.AUTH_OTP_LOGIN_ENABLED = 'false';
        await storeOtp(PHONE, '1234', 'signup');

        const res = await request(app).post('/api/verify-otp').send({
            phone: PHONE, otp: '1234', username: 'New User', password: 'signuppass123',
        });
        expect(res.status).toBe(200);
    });

    it('still allows password reset when login OTP is off', async () => {
        await makeUser();
        process.env.AUTH_OTP_LOGIN_ENABLED = 'false';

        const res = await request(app).post('/api/auth/password/otp').send({ phone: PHONE });
        expect(res.status).toBe(202);
    });

    it('still allows password login when the flag is off', async () => {
        process.env.AUTH_OTP_LOGIN_ENABLED = 'false';
        await storeOtp(PHONE, '1234', 'signup');
        await request(app).post('/api/verify-otp').send({
            phone: PHONE, otp: '1234', username: 'New User', password: 'signuppass123',
        });

        const res = await request(app)
            .post('/api/auth/login-password').send({ phone: PHONE, password: 'signuppass123' });
        expect(res.status).toBe(200);
    });
});

describe('signup with a password', () => {
    it('stores a hash and allows password login afterwards', async () => {
        await storeOtp(PHONE, '1234', 'signup');

        const signup = await request(app).post('/api/verify-otp').send({
            phone: PHONE, otp: '1234', username: 'New User', password: 'signuppass123',
        });
        expect(signup.status).toBe(200);
        expect(JSON.stringify(signup.body)).not.toContain('$argon2id$');

        const login = await request(app)
            .post('/api/auth/login-password').send({ phone: PHONE, password: 'signuppass123' });
        expect(login.status).toBe(200);
    });

    it('records passwordSetAt so the account is not treated as legacy', async () => {
        await storeOtp(PHONE, '1234', 'signup');
        await request(app).post('/api/verify-otp').send({
            phone: PHONE, otp: '1234', username: 'New User', password: 'signuppass123',
        });

        const u: any = await User.findOne({ phone: PHONE });
        expect(u.passwordSetAt).toBeTruthy();
    });

    it('does not raise the soft gate on the next OTP login', async () => {
        await storeOtp(PHONE, '1234', 'signup');
        await request(app).post('/api/verify-otp').send({
            phone: PHONE, otp: '1234', username: 'New User', password: 'signuppass123',
        });

        await storeOtp(PHONE, '5678', 'login');
        const res = await request(app).post('/api/verify-login-otp').send({ phone: PHONE, otp: '5678' });
        expect(res.body.passwordSetRequired).toBe(false);
    });

    // Optional in the API so a cached older app build keeps working rather than
    // hard-failing on a live store.
    it('still succeeds without a password', async () => {
        await storeOtp(PHONE, '1234', 'signup');
        const res = await request(app).post('/api/verify-otp').send({
            phone: PHONE, otp: '1234', username: 'New User',
        });
        expect(res.status).toBe(200);
    });

    it('leaves a passwordless signup flagged for the soft gate', async () => {
        await storeOtp(PHONE, '1234', 'signup');
        await request(app).post('/api/verify-otp').send({
            phone: PHONE, otp: '1234', username: 'New User',
        });

        await storeOtp(PHONE, '5678', 'login');
        const res = await request(app).post('/api/verify-login-otp').send({ phone: PHONE, otp: '5678' });
        expect(res.body.passwordSetRequired).toBe(true);
    });

    it('rejects a password that fails the length policy', async () => {
        await storeOtp(PHONE, '1234', 'signup');
        const res = await request(app).post('/api/verify-otp').send({
            phone: PHONE, otp: '1234', username: 'New User', password: 'short',
        });
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Use at least 8 characters');
    });

    it('does not create the account when the password is rejected', async () => {
        await storeOtp(PHONE, '1234', 'signup');
        await request(app).post('/api/verify-otp').send({
            phone: PHONE, otp: '1234', username: 'New User', password: 'short',
        });
        expect(await User.countDocuments({ phone: PHONE })).toBe(0);
    });
});
