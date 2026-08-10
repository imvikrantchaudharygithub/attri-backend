import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../src/models/user.model';
import { hashPassword } from '../src/services/passwordService';
import { storeOtp } from '../src/services/otpStore';

process.env.SECRET_KEY = process.env.SECRET_KEY || 'test-secret-key';

// SMS must never actually fire in tests — it costs money and needs a live key.
vi.mock('../src/services/smsSevice', () => ({
    sendSMS: vi.fn().mockResolvedValue({ return: true }),
}));

// Imported after the mock so the controller picks up the stub.
const router = (await import('../src/routes/routes')).default;

const app = express();
app.use(express.json());
app.use('/api', router);

const PHONE = 9876543210;
const OTHER_PHONE = 9123456780;
const GENERIC = 'Invalid mobile number or password';

let refSeq = 0;
const makeUser = async (password?: string, phone: number = PHONE) =>
    User.create({
        username: 'Test User',
        phone,
        referral_code: `TES${Date.now()}${refSeq++}`,
        ...(password ? { password: await hashPassword(password), passwordSetAt: new Date() } : {}),
    });

const tokenFor = (id: string) => jwt.sign({ userId: id }, process.env.SECRET_KEY as string);

describe('POST /api/auth/login-password', () => {
    it('logs in with correct credentials', async () => {
        await makeUser('rightpassword1');
        const res = await request(app)
            .post('/api/auth/login-password')
            .send({ phone: PHONE, password: 'rightpassword1' });

        expect(res.status).toBe(200);
        expect(res.body.token).toBeTruthy();
        expect(res.body.user.username).toBe('Test User');
    });

    it('issues a token that decodes to the right user', async () => {
        const u: any = await makeUser('rightpassword1');
        const res = await request(app)
            .post('/api/auth/login-password')
            .send({ phone: PHONE, password: 'rightpassword1' });

        const decoded: any = jwt.verify(res.body.token, process.env.SECRET_KEY as string);
        expect(decoded.userId).toBe(u._id.toString());
    });

    it('never returns the hash', async () => {
        await makeUser('rightpassword1');
        const res = await request(app)
            .post('/api/auth/login-password')
            .send({ phone: PHONE, password: 'rightpassword1' });

        expect(JSON.stringify(res.body)).not.toContain('$argon2id$');
        expect(res.body.user.password).toBeUndefined();
    });

    it('accepts a phone sent as a string', async () => {
        await makeUser('rightpassword1');
        const res = await request(app)
            .post('/api/auth/login-password')
            .send({ phone: '9876543210', password: 'rightpassword1' });
        expect(res.status).toBe(200);
    });

    // The enumeration guarantee: every failure cause is indistinguishable.
    it('returns byte-identical 401s for wrong password, unknown number, and no password set', async () => {
        await makeUser('rightpassword1');
        const wrongPassword = await request(app)
            .post('/api/auth/login-password').send({ phone: PHONE, password: 'wrongpassword1' });

        const unknownNumber = await request(app)
            .post('/api/auth/login-password').send({ phone: 9999999999, password: 'anything123' });

        await makeUser(undefined, OTHER_PHONE); // legacy account, no password
        const legacyAccount = await request(app)
            .post('/api/auth/login-password').send({ phone: OTHER_PHONE, password: 'anything123' });

        for (const res of [wrongPassword, unknownNumber, legacyAccount]) {
            expect(res.status).toBe(401);
            expect(res.body.message).toBe(GENERIC);
        }
        // Identical bodies, not merely identical messages.
        expect(JSON.stringify(wrongPassword.body)).toBe(JSON.stringify(unknownNumber.body));
        expect(JSON.stringify(wrongPassword.body)).toBe(JSON.stringify(legacyAccount.body));
    });

    it('increments the failure counter', async () => {
        await makeUser('rightpassword1');
        await request(app).post('/api/auth/login-password').send({ phone: PHONE, password: 'wrong1234567' });
        const u: any = await User.findOne({ phone: PHONE });
        expect(u.failedLoginCount).toBe(1);
    });

    it('locks the account after 5 failures', async () => {
        await makeUser('rightpassword1');
        for (let i = 0; i < 5; i++) {
            await request(app).post('/api/auth/login-password').send({ phone: PHONE, password: 'wrong1234567' });
        }
        const u: any = await User.findOne({ phone: PHONE });
        expect(u.failedLoginCount).toBe(5);
        expect(u.lockedUntil).toBeTruthy();
        expect(u.lockedUntil.getTime()).toBeGreaterThan(Date.now());
    });

    it('rejects the CORRECT password while locked, with the same generic error', async () => {
        await makeUser('rightpassword1');
        for (let i = 0; i < 5; i++) {
            await request(app).post('/api/auth/login-password').send({ phone: PHONE, password: 'wrong1234567' });
        }
        const res = await request(app)
            .post('/api/auth/login-password').send({ phone: PHONE, password: 'rightpassword1' });

        expect(res.status).toBe(401);
        // Revealing the lock would confirm the attacker found a real account.
        expect(res.body.message).toBe(GENERIC);
    });

    it('allows login again once the lock expires', async () => {
        await makeUser('rightpassword1');
        for (let i = 0; i < 5; i++) {
            await request(app).post('/api/auth/login-password').send({ phone: PHONE, password: 'wrong1234567' });
        }
        await User.updateOne({ phone: PHONE }, { lockedUntil: new Date(Date.now() - 1000) });

        const res = await request(app)
            .post('/api/auth/login-password').send({ phone: PHONE, password: 'rightpassword1' });
        expect(res.status).toBe(200);
    });

    it('resets the failure counter on success', async () => {
        await makeUser('rightpassword1');
        await request(app).post('/api/auth/login-password').send({ phone: PHONE, password: 'wrong1234567' });
        await request(app).post('/api/auth/login-password').send({ phone: PHONE, password: 'rightpassword1' });
        const u: any = await User.findOne({ phone: PHONE });
        expect(u.failedLoginCount).toBe(0);
        expect(u.lockedUntil).toBeNull();
    });

    it('400s on a missing field', async () => {
        expect((await request(app).post('/api/auth/login-password').send({ phone: PHONE })).status).toBe(400);
        expect((await request(app).post('/api/auth/login-password').send({ password: 'x'.repeat(9) })).status).toBe(400);
    });
});

describe('POST /api/auth/password/otp', () => {
    it('returns 202 for a registered number', async () => {
        await makeUser('rightpassword1');
        const res = await request(app).post('/api/auth/password/otp').send({ phone: PHONE });
        expect(res.status).toBe(202);
    });

    it('returns an identical 202 for an UNREGISTERED number', async () => {
        const registered = await makeUser('rightpassword1');
        const a = await request(app).post('/api/auth/password/otp').send({ phone: PHONE });
        const b = await request(app).post('/api/auth/password/otp').send({ phone: 9999999999 });

        expect(registered).toBeTruthy();
        expect(b.status).toBe(202);
        expect(JSON.stringify(a.body)).toBe(JSON.stringify(b.body));
    });

    it('issues a password_set code, not a login code', async () => {
        await makeUser('rightpassword1');
        await request(app).post('/api/auth/password/otp').send({ phone: PHONE });
        // Give the fire-and-forget write a moment to land.
        await new Promise((r) => setTimeout(r, 300));
        const Otp = (await import('../src/models/otp.model')).default;
        const doc: any = await Otp.findOne({ phone: PHONE });
        expect(doc).toBeTruthy();
        expect(doc.purpose).toBe('password_set');
    });

    it('400s without a phone', async () => {
        expect((await request(app).post('/api/auth/password/otp').send({})).status).toBe(400);
    });
});

describe('POST /api/auth/password/set', () => {
    it('sets a password with a valid password_set OTP and returns a token', async () => {
        await makeUser();
        await storeOtp(PHONE, '1234', 'password_set');

        const res = await request(app)
            .post('/api/auth/password/set')
            .send({ phone: PHONE, otp: '1234', password: 'brandnewpass1' });

        expect(res.status).toBe(200);
        expect(res.body.token).toBeTruthy();
        expect(JSON.stringify(res.body)).not.toContain('$argon2id$');

        const login = await request(app)
            .post('/api/auth/login-password').send({ phone: PHONE, password: 'brandnewpass1' });
        expect(login.status).toBe(200);
    });

    // Purpose scoping at the HTTP boundary.
    it('REJECTS a login-purpose OTP', async () => {
        await makeUser();
        await storeOtp(PHONE, '1234', 'login');
        const res = await request(app)
            .post('/api/auth/password/set')
            .send({ phone: PHONE, otp: '1234', password: 'brandnewpass1' });
        expect(res.status).toBe(400);
    });

    it('REJECTS a signup-purpose OTP', async () => {
        await makeUser();
        await storeOtp(PHONE, '1234', 'signup');
        const res = await request(app)
            .post('/api/auth/password/set')
            .send({ phone: PHONE, otp: '1234', password: 'brandnewpass1' });
        expect(res.status).toBe(400);
    });

    it('rejects a wrong OTP', async () => {
        await makeUser();
        await storeOtp(PHONE, '1234', 'password_set');
        const res = await request(app)
            .post('/api/auth/password/set')
            .send({ phone: PHONE, otp: '9999', password: 'brandnewpass1' });
        expect(res.status).toBe(400);
    });

    // The soft gate: first set is proved by the JWT from the OTP login the user
    // completed seconds ago, so no second SMS is spent.
    it('accepts a JWT with no OTP for a FIRST set', async () => {
        const u: any = await makeUser();
        const res = await request(app)
            .post('/api/auth/password/set')
            .set('Authorization', `Bearer ${tokenFor(u._id.toString())}`)
            .send({ password: 'brandnewpass1' });
        expect(res.status).toBe(200);
    });

    // A stolen token must not be able to rewrite an existing password and lock
    // the real owner out.
    it('REJECTS a bare JWT when a password already exists', async () => {
        const u: any = await makeUser('existingpass1');
        const res = await request(app)
            .post('/api/auth/password/set')
            .set('Authorization', `Bearer ${tokenFor(u._id.toString())}`)
            .send({ password: 'replacementpass1' });
        expect(res.status).toBe(401);

        // And the original password still works.
        const login = await request(app)
            .post('/api/auth/login-password').send({ phone: PHONE, password: 'existingpass1' });
        expect(login.status).toBe(200);
    });

    it('allows a CHANGE when an OTP is supplied', async () => {
        await makeUser('existingpass1');
        await storeOtp(PHONE, '1234', 'password_set');
        const res = await request(app)
            .post('/api/auth/password/set')
            .send({ phone: PHONE, otp: '1234', password: 'replacementpass1' });
        expect(res.status).toBe(200);

        const login = await request(app)
            .post('/api/auth/login-password').send({ phone: PHONE, password: 'replacementpass1' });
        expect(login.status).toBe(200);
    });

    it('ignores an invalid token and falls back to the OTP path', async () => {
        await makeUser();
        await storeOtp(PHONE, '1234', 'password_set');
        const res = await request(app)
            .post('/api/auth/password/set')
            .set('Authorization', 'Bearer not-a-real-token')
            .send({ phone: PHONE, otp: '1234', password: 'brandnewpass1' });
        expect(res.status).toBe(200);
    });

    it('enforces the length policy', async () => {
        await makeUser();
        await storeOtp(PHONE, '1234', 'password_set');
        const res = await request(app)
            .post('/api/auth/password/set').send({ phone: PHONE, otp: '1234', password: 'short1' });
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Use at least 8 characters');
    });

    it('does not burn the OTP when the password fails validation', async () => {
        await makeUser();
        await storeOtp(PHONE, '1234', 'password_set');
        await request(app).post('/api/auth/password/set').send({ phone: PHONE, otp: '1234', password: 'short1' });
        // Same code still works with a valid password.
        const res = await request(app)
            .post('/api/auth/password/set').send({ phone: PHONE, otp: '1234', password: 'goodpassword1' });
        expect(res.status).toBe(200);
    });

    it('clears any lock when the password is reset', async () => {
        await makeUser('oldpassword1');
        await User.updateOne({ phone: PHONE }, {
            failedLoginCount: 5, lockedUntil: new Date(Date.now() + 900000),
        });
        await storeOtp(PHONE, '1234', 'password_set');
        await request(app).post('/api/auth/password/set')
            .send({ phone: PHONE, otp: '1234', password: 'freshpassword1' });

        const u: any = await User.findOne({ phone: PHONE });
        expect(u.failedLoginCount).toBe(0);
        expect(u.lockedUntil).toBeNull();
    });

    it('records passwordSetAt', async () => {
        await makeUser();
        await storeOtp(PHONE, '1234', 'password_set');
        await request(app).post('/api/auth/password/set')
            .send({ phone: PHONE, otp: '1234', password: 'brandnewpass1' });
        const u: any = await User.findOne({ phone: PHONE });
        expect(u.passwordSetAt).toBeTruthy();
    });
});

describe('POST /api/auth/password/skip', () => {
    it('increments the counter server-side', async () => {
        const u: any = await makeUser();
        const res = await request(app)
            .post('/api/auth/password/skip')
            .set('Authorization', `Bearer ${tokenFor(u._id.toString())}`).send({});

        expect(res.status).toBe(200);
        expect(res.body.skipsRemaining).toBe(2);
        const after: any = await User.findOne({ phone: PHONE });
        expect(after.passwordSetSkips).toBe(1);
    });

    it('floors skipsRemaining at zero', async () => {
        const u: any = await makeUser();
        const auth = `Bearer ${tokenFor(u._id.toString())}`;
        for (let i = 0; i < 4; i++) {
            await request(app).post('/api/auth/password/skip').set('Authorization', auth).send({});
        }
        const res = await request(app).post('/api/auth/password/skip').set('Authorization', auth).send({});
        expect(res.body.skipsRemaining).toBe(0);
    });

    it('rejects an unauthenticated request', async () => {
        const res = await request(app).post('/api/auth/password/skip').send({});
        expect([401, 403]).toContain(res.status);
    });
});
