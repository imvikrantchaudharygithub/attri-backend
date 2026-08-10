import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
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

const PHONE = 9876543212;

let refSeq = 0;
const makeUser = async (password?: string) =>
    User.create({
        username: 'Token User',
        phone: PHONE,
        referral_code: `TV${Date.now()}${refSeq++}`,
        ...(password ? { password: await hashPassword(password), passwordSetAt: new Date() } : {}),
    });

/** Any route behind verifyToken works as the probe. */
const callProtected = (token: string) =>
    request(app).post('/api/auth/password/skip').set('Authorization', `Bearer ${token}`).send({});

describe('tokenVersion', () => {
    it('defaults to 0 on a new user', async () => {
        const u: any = await makeUser();
        expect(u.tokenVersion).toBe(0);
    });

    it('accepts a freshly issued token', async () => {
        await makeUser('originalpass1');
        const login = await request(app)
            .post('/api/auth/login-password').send({ phone: PHONE, password: 'originalpass1' });

        expect((await callProtected(login.body.token)).status).toBe(200);
    });

    it('invalidates an existing token after a password change', async () => {
        await makeUser('originalpass1');
        const first = await request(app)
            .post('/api/auth/login-password').send({ phone: PHONE, password: 'originalpass1' });
        const oldToken = first.body.token;

        expect((await callProtected(oldToken)).status).toBe(200);

        await storeOtp(PHONE, '1234', 'password_set');
        await request(app).post('/api/auth/password/set')
            .send({ phone: PHONE, otp: '1234', password: 'replacementpass1' });

        // The attacker's stolen 7-day token is now dead.
        const after = await callProtected(oldToken);
        expect(after.status).toBe(401);
    });

    it('keeps the changer logged in with the token the change returned', async () => {
        await makeUser('originalpass1');
        await storeOtp(PHONE, '1234', 'password_set');

        const changed = await request(app).post('/api/auth/password/set')
            .send({ phone: PHONE, otp: '1234', password: 'replacementpass1' });

        expect(changed.status).toBe(200);
        expect((await callProtected(changed.body.token)).status).toBe(200);
    });

    it('bumps the version on every password change', async () => {
        await makeUser('originalpass1');

        await storeOtp(PHONE, '1111', 'password_set');
        await request(app).post('/api/auth/password/set')
            .send({ phone: PHONE, otp: '1111', password: 'secondpass111' });

        await storeOtp(PHONE, '2222', 'password_set');
        await request(app).post('/api/auth/password/set')
            .send({ phone: PHONE, otp: '2222', password: 'thirdpass1111' });

        const u: any = await User.findOne({ phone: PHONE });
        expect(u.tokenVersion).toBe(2);
    });

    // Users are carrying 168h tokens minted before this field existed. They
    // decode with tv undefined, which must be treated as 0 — otherwise
    // deploying this logs out every active session at once.
    it('accepts a legacy token that carries no tv claim', async () => {
        const u: any = await makeUser();
        const legacyToken = jwt.sign(
            { userId: u._id.toString() },
            process.env.SECRET_KEY as string,
            { expiresIn: '168h' }
        );
        expect((await callProtected(legacyToken)).status).toBe(200);
    });

    it('rejects a token whose user no longer exists', async () => {
        const u: any = await makeUser();
        const token = jwt.sign(
            { userId: u._id.toString(), tv: 0 },
            process.env.SECRET_KEY as string
        );
        await User.deleteOne({ _id: u._id });
        expect((await callProtected(token)).status).toBe(401);
    });

    it('rejects a token claiming a stale version', async () => {
        const u: any = await makeUser();
        await User.updateOne({ _id: u._id }, { tokenVersion: 5 });
        const staleToken = jwt.sign(
            { userId: u._id.toString(), tv: 4 },
            process.env.SECRET_KEY as string
        );
        expect((await callProtected(staleToken)).status).toBe(401);
    });

    it('OTP login issues a token carrying the current version', async () => {
        const u: any = await makeUser();
        await User.updateOne({ _id: u._id }, { tokenVersion: 3 });
        await storeOtp(PHONE, '1234', 'login');

        const res = await request(app).post('/api/verify-login-otp').send({ phone: PHONE, otp: '1234' });
        const decoded: any = jwt.verify(res.body.token, process.env.SECRET_KEY as string);
        expect(decoded.tv).toBe(3);
        expect((await callProtected(res.body.token)).status).toBe(200);
    });

    it('signup issues a usable token', async () => {
        await storeOtp(PHONE, '1234', 'signup');
        const res = await request(app).post('/api/verify-otp').send({
            phone: PHONE, otp: '1234', username: 'Fresh User', password: 'signuppass123',
        });
        expect(res.status).toBe(200);
        expect((await callProtected(res.body.token)).status).toBe(200);
    });
});
