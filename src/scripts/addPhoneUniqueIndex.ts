/**
 * Ensures users.phone carries a UNIQUE index.
 *
 * Without it, User.findOne({ phone }) returns an arbitrary match when
 * duplicates exist — so password login could authenticate the wrong account.
 *
 * Note on naming: the schema declares `unique: true`, and Mongoose's autoIndex
 * creates `phone_1` as soon as the model loads. This script therefore adopts
 * that name instead of a custom one, or the two fight over the same key pattern
 * and Mongo raises IndexOptionsConflict.
 *
 * Idempotent, and safe to run repeatedly:
 *   - already unique      → no-op
 *   - exists, not unique  → dropped and recreated as unique
 *   - missing             → created
 * Re-checks for duplicates itself rather than trusting that checkDuplicatePhones
 * was run recently, since rows can appear between the two commands.
 */
import mongoose from 'mongoose';
import connectDB from '../db/db';
import User from '../models/user.model';

const INDEX_NAME = 'phone_1';

async function main(): Promise<void> {
    await connectDB();

    const dupes = await User.aggregate([
        { $group: { _id: '$phone', count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
    ]);

    if (dupes.length > 0) {
        console.error(`ABORT: ${dupes.length} duplicate phone group(s) present.`);
        console.error('Run "npm run check:phones" for detail.');
        await mongoose.disconnect();
        process.exit(1);
    }

    // Match on the key pattern, not the name — Mongoose may have created it
    // under its own naming already.
    const indexes: any[] = await User.collection.indexes();
    const existing = indexes.find(
        (i) => i.key && i.key.phone === 1 && Object.keys(i.key).length === 1
    );

    if (existing?.unique === true) {
        console.log(`Index "${existing.name}" on users.phone is already unique — nothing to do.`);
        await mongoose.disconnect();
        process.exit(0);
    }

    if (existing) {
        console.log(`Index "${existing.name}" exists but is not unique — recreating.`);
        await User.collection.dropIndex(existing.name);
    }

    await User.collection.createIndex({ phone: 1 }, { unique: true, name: INDEX_NAME });
    console.log(`Created unique index ${INDEX_NAME} on users.phone`);

    await mongoose.disconnect();
    process.exit(0);
}

main().catch(async (err) => {
    console.error('Index creation failed:', err instanceof Error ? err.message : err);
    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
});
