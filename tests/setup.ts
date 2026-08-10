import 'dotenv/config';
import mongoose from 'mongoose';
import { beforeAll, afterAll, afterEach } from 'vitest';

/**
 * Rate limiters hold module-level state keyed by IP, and every supertest
 * request arrives from 127.0.0.1 — so production ceilings would be shared
 * across an entire test file and mask the behaviour under test.
 *
 * Raise the ceilings rather than switching limiting off, so the middleware
 * stays in the request path. tests/rateLimit.test.ts sets them low again to
 * prove the limits actually bite.
 */
process.env.AUTH_LOGIN_RATE_LIMIT ??= '100000';
process.env.AUTH_OTP_RATE_LIMIT ??= '100000';
process.env.AUTH_OTP_HOURLY_RATE_LIMIT ??= '100000';

/**
 * Tests run against a dedicated database and wipe every collection between
 * cases. The name guard below is the only thing standing between a misconfigured
 * env var and an emptied production database — do not remove it.
 */
beforeAll(async () => {
    const uri = process.env.MONGODB_URI_TEST;

    if (!uri) {
        throw new Error(
            'MONGODB_URI_TEST is not set. Point it at a TEST database, never production.'
        );
    }

    // Match on the database name in the path, not the whole URI — a cluster
    // host that happens to contain "test" must not satisfy this.
    const dbName = uri.split('/').pop()?.split('?')[0] ?? '';
    if (!/test/i.test(dbName)) {
        throw new Error(
            `MONGODB_URI_TEST database name must contain "test" (got "${dbName}"). Refusing to run.`
        );
    }

    await mongoose.connect(uri);
});

afterEach(async () => {
    const collections = mongoose.connection.collections;
    for (const key of Object.keys(collections)) {
        await collections[key].deleteMany({});
    }
});

afterAll(async () => {
    await mongoose.disconnect();
});
