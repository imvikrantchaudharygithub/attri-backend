import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../src/models/user.model';
import { hashPassword, verifyPassword } from '../src/services/passwordService';

process.env.SECRET_KEY = process.env.SECRET_KEY || 'test-secret-key';

vi.mock('../src/services/smsSevice', () => ({
    sendSMS: vi.fn().mockResolvedValue({ return: true }),
}));

const router = (await import('../src/routes/routes')).default;

const app = express();
app.use(express.json());
app.use('/api', router);

const PHONE = 9876543299;
const ENDPOINT = '/api/admin/set-user-password';
const ORIGINAL_SET_AT = new Date('2026-01-01T00:00:00.000Z');

let refSeq = 0;
const makeUser = async (overrides: Record<string, any> = {}) =>
    User.create({
        username: 'Reset Target',
        phone: PHONE,
        referral_code: `AP${Date.now()}${refSeq++}`,
        password: await hashPassword('originalpass1'),
        passwordSetAt: ORIGINAL_SET_AT,
        ...overrides,
    });

/** password is select:false, so it has to be asked for explicitly. */
const storedHash = async (id: any): Promise<string> => {
    const u: any = await User.findById(id).select('+password');
    return u.password;
};

describe('POST /admin/set-user-password', () => {
    it('stores a hash that verifies against the new plaintext', async () => {
        const u: any = await makeUser();

        const res = await request(app).post(ENDPOINT)
            .send({ userId: u._id.toString(), password: 'replacementpass1' });

        expect(res.status).toBe(200);
        expect(await verifyPassword(await storedHash(u._id), 'replacementpass1')).toBe(true);
        expect(await verifyPassword(await storedHash(u._id), 'originalpass1')).toBe(false);
    });

    it('updates passwordSetAt', async () => {
        const u: any = await makeUser();

        await request(app).post(ENDPOINT)
            .send({ userId: u._id.toString(), password: 'replacementpass1' });

        const after: any = await User.findById(u._id);
        expect(after.passwordSetAt.getTime()).toBeGreaterThan(ORIGINAL_SET_AT.getTime());
    });

    it('increments tokenVersion so existing sessions die', async () => {
        const u: any = await makeUser();
        const oldToken = jwt.sign(
            { userId: u._id.toString(), tv: 0 },
            process.env.SECRET_KEY as string
        );

        // Any route behind verifyToken works as the probe.
        const probe = () => request(app).post('/api/auth/password/skip')
            .set('Authorization', `Bearer ${oldToken}`).send({});

        expect((await probe()).status).toBe(200);

        await request(app).post(ENDPOINT)
            .send({ userId: u._id.toString(), password: 'replacementpass1' });

        expect((await probe()).status).toBe(401);

        const after: any = await User.findById(u._id);
        expect(after.tokenVersion).toBe(1);
    });

    it('clears an active lockout and lets the user log in again', async () => {
        const u: any = await makeUser({
            failedLoginCount: 5,
            lockedUntil: new Date(Date.now() + 15 * 60 * 1000),
        });

        await request(app).post(ENDPOINT)
            .send({ userId: u._id.toString(), password: 'replacementpass1' });

        const after: any = await User.findById(u._id);
        expect(after.failedLoginCount).toBe(0);
        expect(after.lockedUntil).toBeUndefined();

        // The reset is only useful if the user can actually get back in.
        const login = await request(app).post('/api/auth/login-password')
            .send({ phone: PHONE, password: 'replacementpass1' });
        expect(login.status).toBe(200);
    });

    it('rejects a password under 8 characters and leaves the old hash intact', async () => {
        const u: any = await makeUser();
        const before = await storedHash(u._id);

        const res = await request(app).post(ENDPOINT)
            .send({ userId: u._id.toString(), password: 'short' });

        expect(res.status).toBe(400);
        expect(await storedHash(u._id)).toBe(before);
    });

    it('rejects a password over 128 characters and leaves the old hash intact', async () => {
        const u: any = await makeUser();
        const before = await storedHash(u._id);

        const res = await request(app).post(ENDPOINT)
            .send({ userId: u._id.toString(), password: 'a'.repeat(129) });

        expect(res.status).toBe(400);
        expect(await storedHash(u._id)).toBe(before);
    });

    it('400s when password is missing entirely', async () => {
        const u: any = await makeUser();

        const res = await request(app).post(ENDPOINT).send({ userId: u._id.toString() });

        expect(res.status).toBe(400);
    });

    it('404s on an unknown userId', async () => {
        const res = await request(app).post(ENDPOINT).send({
            userId: new mongoose.Types.ObjectId().toString(),
            password: 'replacementpass1',
        });

        expect(res.status).toBe(404);
    });

    it('404s on a malformed userId rather than throwing', async () => {
        const res = await request(app).post(ENDPOINT)
            .send({ userId: 'not-an-object-id', password: 'replacementpass1' });

        expect(res.status).toBe(404);
    });

    it('never echoes the password or the hash', async () => {
        const u: any = await makeUser();

        const res = await request(app).post(ENDPOINT)
            .send({ userId: u._id.toString(), password: 'replacementpass1' });

        const body = JSON.stringify(res.body);
        expect(body).not.toContain('replacementpass1');
        expect(body).not.toContain('$argon2');
    });
});
