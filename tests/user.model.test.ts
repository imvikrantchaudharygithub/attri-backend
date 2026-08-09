import { describe, it, expect } from 'vitest';
import User from '../src/models/user.model';

const PHONE = 9876543210;
const FAKE_HASH = '$argon2id$v=19$m=19456,p=1,t=2$fakesaltfakesalt$fakehashfakehash';

const makeUser = (extra: Record<string, unknown> = {}) =>
    User.create({
        username: 'Test User',
        phone: PHONE,
        referral_code: 'TES' + Math.random().toString(36).slice(2, 8).toUpperCase(),
        ...extra,
    });

describe('User model password fields', () => {
    // select:false is what keeps the hash out of the ~15 existing call sites
    // that return user documents — getAllUsers, getUserByToken, verifyLoginOtp
    // and the admin users table among them.
    it('omits password from findOne', async () => {
        await makeUser({ password: FAKE_HASH });
        const found: any = await User.findOne({ phone: PHONE });
        expect(found.password).toBeUndefined();
    });

    it('omits password from find', async () => {
        await makeUser({ password: FAKE_HASH });
        const all: any[] = await User.find();
        expect(all[0].password).toBeUndefined();
    });

    it('omits password from findById', async () => {
        const created: any = await makeUser({ password: FAKE_HASH });
        const found: any = await User.findById(created._id);
        expect(found.password).toBeUndefined();
    });

    it('keeps the hash out of a serialised response body', async () => {
        await makeUser({ password: FAKE_HASH });
        const all = await User.find();
        expect(JSON.stringify({ users: all })).not.toContain('argon2id');
    });

    it('returns password only when explicitly selected', async () => {
        await makeUser({ password: FAKE_HASH });
        const found: any = await User.findOne({ phone: PHONE }).select('+password');
        expect(found.password).toBe(FAKE_HASH);
    });

    it('persists the hash even though it is hidden by default', async () => {
        await makeUser({ password: FAKE_HASH });
        const raw = await User.collection.findOne({ phone: PHONE });
        expect((raw as any).password).toBe(FAKE_HASH);
    });

    it('defaults the counters to zero and leaves lock unset', async () => {
        const u: any = await makeUser();
        expect(u.passwordSetSkips).toBe(0);
        expect(u.failedLoginCount).toBe(0);
        expect(u.lockedUntil).toBeUndefined();
    });

    it('allows a user with no password at all (legacy account)', async () => {
        const u: any = await makeUser();
        const found: any = await User.findOne({ _id: u._id }).select('+password');
        expect(found.password).toBeUndefined();
    });

    it('stores passwordSetAt when provided', async () => {
        const when = new Date('2026-08-09T00:00:00Z');
        await makeUser({ password: FAKE_HASH, passwordSetAt: when });
        const found: any = await User.findOne({ phone: PHONE });
        // Not select:false — My Profile needs it to show "Last changed".
        expect(found.passwordSetAt).toEqual(when);
    });
});
