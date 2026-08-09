import { describe, it, expect } from 'vitest';
import {
    hashPassword,
    verifyPassword,
    validatePassword,
    MIN_PASSWORD_LENGTH,
    MAX_PASSWORD_LENGTH,
} from '../src/services/passwordService';

describe('hashPassword / verifyPassword', () => {
    it('round-trips a correct password', async () => {
        const hash = await hashPassword('correct horse battery');
        expect(await verifyPassword(hash, 'correct horse battery')).toBe(true);
    });

    it('rejects a wrong password', async () => {
        const hash = await hashPassword('correct horse battery');
        expect(await verifyPassword(hash, 'wrong horse battery')).toBe(false);
    });

    it('produces an argon2id hash', async () => {
        const hash = await hashPassword('whatever12');
        expect(hash.startsWith('$argon2id$')).toBe(true);
    });

    it('uses the OWASP parameters', async () => {
        const hash = await hashPassword('whatever12');
        // Encoded params appear in the hash string; order is m,p,t.
        expect(hash).toContain('m=19456');
        expect(hash).toContain('t=2');
        expect(hash).toContain('p=1');
    });

    it('salts — the same input hashes differently each time', async () => {
        expect(await hashPassword('samepass1')).not.toBe(await hashPassword('samepass1'));
    });

    it('is case sensitive', async () => {
        const hash = await hashPassword('CaseSensitive1');
        expect(await verifyPassword(hash, 'casesensitive1')).toBe(false);
    });

    it('handles unicode and whitespace without truncating', async () => {
        const pw = 'पासवर्ड with spaces 🔐';
        const hash = await hashPassword(pw);
        expect(await verifyPassword(hash, pw)).toBe(true);
    });

    it('does not truncate at 72 bytes the way bcrypt would', async () => {
        const base = 'a'.repeat(72);
        const hash = await hashPassword(base + 'DIFFERENT');
        expect(await verifyPassword(hash, base + 'OTHERTAIL')).toBe(false);
    });

    it('returns false rather than throwing for a missing hash', async () => {
        expect(await verifyPassword(undefined, 'anything1')).toBe(false);
        expect(await verifyPassword(null, 'anything1')).toBe(false);
        expect(await verifyPassword('', 'anything1')).toBe(false);
    });

    it('returns false rather than throwing for a malformed hash', async () => {
        expect(await verifyPassword('not-a-hash', 'anything1')).toBe(false);
        expect(await verifyPassword('$argon2id$garbage', 'anything1')).toBe(false);
    });

    // A bare `return false` for an unknown account would answer in ~0ms while a
    // real verify takes ~50ms, letting an attacker enumerate accounts by clock.
    it('burns comparable time when there is no hash (no timing oracle)', async () => {
        const hash = await hashPassword('realpassword1');
        await verifyPassword(hash, 'warmup'); // prime the lazy dummy hash

        const t0 = Date.now();
        await verifyPassword(hash, 'wrongpassword1');
        const real = Date.now() - t0;

        const t1 = Date.now();
        await verifyPassword(undefined, 'wrongpassword1');
        const dummy = Date.now() - t1;

        expect(dummy).toBeGreaterThan(real * 0.4);
    });
});

describe('validatePassword', () => {
    it(`accepts exactly ${MIN_PASSWORD_LENGTH} characters`, () => {
        expect(validatePassword('12345678')).toBeNull();
    });

    it('rejects one character short', () => {
        expect(validatePassword('1234567')).toBe(`Use at least ${MIN_PASSWORD_LENGTH} characters`);
    });

    it(`accepts exactly ${MAX_PASSWORD_LENGTH} characters`, () => {
        expect(validatePassword('a'.repeat(MAX_PASSWORD_LENGTH))).toBeNull();
    });

    it('rejects one character over the maximum', () => {
        expect(validatePassword('a'.repeat(MAX_PASSWORD_LENGTH + 1))).toBe(
            `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer`
        );
    });

    it('accepts a long passphrase with no symbols', () => {
        expect(validatePassword('my very long attri passphrase')).toBeNull();
    });

    // OWASP: composition rules push users to "Password1!" and lower real
    // entropy. Length only.
    it('does NOT require digits, symbols or mixed case', () => {
        expect(validatePassword('abcdefghij')).toBeNull();
        expect(validatePassword('ALLUPPERCASE')).toBeNull();
        expect(validatePassword('12345678901')).toBeNull();
    });

    it('rejects a non-string', () => {
        expect(validatePassword(12345678)).toBe('Password is required');
        expect(validatePassword(null)).toBe('Password is required');
        expect(validatePassword(undefined)).toBe('Password is required');
        expect(validatePassword({})).toBe('Password is required');
    });

    it('rejects empty', () => {
        expect(validatePassword('')).toBe('Password is required');
    });
});
