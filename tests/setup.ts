import 'dotenv/config';
import mongoose from 'mongoose';
import { beforeAll, afterAll, afterEach } from 'vitest';

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
