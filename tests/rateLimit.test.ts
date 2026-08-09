import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express, { RequestHandler } from 'express';
import { makeLoginLimiter, makeOtpLimiter, phoneKey } from '../src/middlewares/rateLimit';

/**
 * The exported singletons run with ceilings raised by tests/setup.ts, so these
 * build fresh limiters at low limits to prove the limiting actually bites.
 * Same factories the production limiters are built from.
 */
const appWith = (limiter: RequestHandler) => {
    const app = express();
    app.use(express.json());
    app.post('/x', limiter, (_req, res) => {
        res.status(200).json({ ok: true });
    });
    return app;
};

describe('login limiter', () => {
    it('allows up to the limit then returns 429', async () => {
        const app = appWith(makeLoginLimiter(3, 60_000));

        for (let i = 0; i < 3; i++) {
            expect((await request(app).post('/x').send({})).status).toBe(200);
        }

        const blocked = await request(app).post('/x').send({});
        expect(blocked.status).toBe(429);
        expect(blocked.body.message).toContain('Too many login attempts');
    });
});

describe('OTP limiter', () => {
    it('allows up to the limit then returns 429 for the same phone', async () => {
        const app = appWith(makeOtpLimiter(2, 60_000, 'too many codes'));

        expect((await request(app).post('/x').send({ phone: 9876543210 })).status).toBe(200);
        expect((await request(app).post('/x').send({ phone: 9876543210 })).status).toBe(200);

        const blocked = await request(app).post('/x').send({ phone: 9876543210 });
        expect(blocked.status).toBe(429);
        expect(blocked.body.message).toBe('too many codes');
    });

    // Keying by phone rather than IP is the whole point: shared IPs are normal
    // in India, and the budget being protected is per-phone.
    it('counts each phone separately even from one IP', async () => {
        const app = appWith(makeOtpLimiter(2, 60_000, 'too many codes'));

        await request(app).post('/x').send({ phone: 9876543210 });
        await request(app).post('/x').send({ phone: 9876543210 });
        expect((await request(app).post('/x').send({ phone: 9876543210 })).status).toBe(429);

        // A different number from the same IP is unaffected.
        expect((await request(app).post('/x').send({ phone: 9123456780 })).status).toBe(200);
    });

    it('falls back to an IP key when no phone is supplied', async () => {
        const app = appWith(makeOtpLimiter(1, 60_000, 'too many codes'));
        expect((await request(app).post('/x').send({})).status).toBe(200);
        expect((await request(app).post('/x').send({})).status).toBe(429);
    });
});

describe('phoneKey', () => {
    it('namespaces phone keys so they cannot collide with an IP string', () => {
        expect(phoneKey({ body: { phone: 9876543210 }, ip: '1.2.3.4' } as any))
            .toBe('phone:9876543210');
    });

    it('namespaces IP keys when no phone is present', () => {
        expect(phoneKey({ body: {}, ip: '1.2.3.4' } as any)).toMatch(/^ip:/);
    });

    it('does not throw on a missing ip', () => {
        expect(() => phoneKey({ body: {} } as any)).not.toThrow();
    });
});
