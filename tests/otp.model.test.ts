import { describe, it, expect } from 'vitest';
import Otp from '../src/models/otp.model';

describe('Otp model', () => {
    it('stores an entry with all required fields', async () => {
        const doc: any = await Otp.create({
            phone: 9876543210,
            otpHash: 'a'.repeat(64),
            purpose: 'login',
            expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        });
        expect(doc.attempts).toBe(0);
        expect(doc.purpose).toBe('login');
        expect(doc.phone).toBe(9876543210);
    });

    it('rejects a purpose outside the enum', async () => {
        await expect(
            Otp.create({
                phone: 9876543210,
                otpHash: 'a'.repeat(64),
                // 'password_reset' is deliberately not a valid purpose — the
                // enum is the guard that stops an OTP crossing journeys.
                purpose: 'password_reset',
                expiresAt: new Date(Date.now() + 60000),
            })
        ).rejects.toThrow();
    });

    it('requires otpHash', async () => {
        await expect(
            Otp.create({
                phone: 9876543210,
                purpose: 'login',
                expiresAt: new Date(Date.now() + 60000),
            })
        ).rejects.toThrow();
    });

    it('declares a TTL index on expiresAt', async () => {
        // init() waits for Mongoose to finish building declared indexes.
        await Otp.init();
        const indexes: any[] = await Otp.collection.indexes();
        const ttl = indexes.find((i) => i.expireAfterSeconds !== undefined);
        expect(ttl).toBeDefined();
        expect(ttl.expireAfterSeconds).toBe(0);
        expect(ttl.key).toEqual({ expiresAt: 1 });
    });

    it('declares a lookup index on phone + purpose', async () => {
        await Otp.init();
        const indexes: any[] = await Otp.collection.indexes();
        const lookup = indexes.find(
            (i) => i.key && i.key.phone === 1 && i.key.purpose === 1
        );
        expect(lookup).toBeDefined();
    });
});
