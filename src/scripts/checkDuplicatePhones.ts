/**
 * Phase 0 pre-flight for phone + password auth.
 *
 * `phone` on the users collection has no unique index. With duplicates present,
 * `User.findOne({ phone })` returns an arbitrary match — so password login could
 * authenticate the wrong account, including one holding a different wallet
 * balance. This script is read-only and reports what needs resolving before
 * the unique index can be added.
 *
 * Exit 0 = clean, safe to add the index. Exit 1 = blocked.
 */
import mongoose from 'mongoose';
import connectDB from '../db/db';
import User from '../models/user.model';

type DupeUser = {
    id: string;
    username: string;
    createdAt: Date;
    balance: number;
    cashback: number;
};

type DupeGroup = {
    _id: number | null;
    count: number;
    users: DupeUser[];
};

const fmtDate = (d: Date | undefined): string =>
    d ? new Date(d).toISOString().slice(0, 10) : 'unknown';

async function main(): Promise<void> {
    await connectDB();

    const total = await User.countDocuments();

    const dupes: DupeGroup[] = await User.aggregate([
        {
            $group: {
                _id: '$phone',
                count: { $sum: 1 },
                users: {
                    $push: {
                        id: '$_id',
                        username: '$username',
                        createdAt: '$createdAt',
                        balance: '$balance',
                        cashback: '$cashback',
                    },
                },
            },
        },
        { $match: { count: { $gt: 1 } } },
        { $sort: { count: -1 } },
    ]);

    const missingPhone = await User.countDocuments({
        $or: [{ phone: null }, { phone: { $exists: false } }],
    });

    console.log('\n=== Phone uniqueness pre-flight ===');
    console.log(`Total users:            ${total}`);
    console.log(`Users missing a phone:  ${missingPhone}`);
    console.log(`Duplicate phone groups: ${dupes.length}`);

    if (dupes.length > 0) {
        const affected = dupes.reduce((n, d) => n + d.count, 0);
        const withMoney = dupes.filter((d) =>
            d.users.some((u) => (u.balance ?? 0) > 0 || (u.cashback ?? 0) > 0)
        ).length;

        console.log(`Accounts affected:      ${affected}`);
        console.log(`Groups holding money:   ${withMoney}\n`);

        for (const d of dupes) {
            console.log(`phone ${d._id} — ${d.count} accounts:`);
            for (const u of d.users) {
                const name = (u.username || '(no name)').padEnd(24);
                console.log(
                    `   ${u.id}  ${name} created ${fmtDate(u.createdAt)}  ` +
                    `balance Rs.${u.balance ?? 0}  cashback Rs.${u.cashback ?? 0}`
                );
            }
            console.log('');
        }

        console.log('BLOCKED: resolve these before adding the unique index (Task 1.5).');
        console.log('Accounts holding a balance or cashback need a human decision — do not auto-merge.\n');
    } else {
        console.log('\nCLEAN: no duplicate phone numbers. Task 1.5 may proceed.\n');
    }

    await mongoose.disconnect();
    process.exit(dupes.length > 0 ? 1 : 0);
}

main().catch(async (err) => {
    console.error('Pre-flight failed:', err);
    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
});
