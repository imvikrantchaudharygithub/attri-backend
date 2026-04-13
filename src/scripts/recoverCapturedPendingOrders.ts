import Razorpay from 'razorpay';
import connectDB from '../db/db';
import Order from '../models/order.model';

type CapturedPayment = {
  id: string;
  status: string;
  created_at?: number;
};

function parseArgs(argv: string[]) {
  const orderIds: string[] = [];
  let dryRun = false;

  for (const arg of argv) {
    if (arg === '--dry-run') dryRun = true;
    else orderIds.push(arg);
  }

  return { orderIds, dryRun };
}

async function main(): Promise<void> {
  const { orderIds, dryRun } = parseArgs(process.argv.slice(2));

  if (orderIds.length === 0) {
    // eslint-disable-next-line no-console
    console.error(
      'Usage: ts-node src/scripts/recoverCapturedPendingOrders.ts [--dry-run] <razorpay_order_id>...'
    );
    process.exit(1);
  }

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    // eslint-disable-next-line no-console
    console.error('Missing Razorpay env. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
    process.exit(1);
  }

  await connectDB();

  const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

  for (const razorpayOrderId of orderIds) {
    // eslint-disable-next-line no-console
    console.log(`\n[recover] checking ${razorpayOrderId}`);

    const order = await Order.findOne({ razorpay_order_id: razorpayOrderId });
    if (!order) {
      // eslint-disable-next-line no-console
      console.log('[skip] not found in MongoDB');
      continue;
    }

    if (order.status !== 'pending') {
      // eslint-disable-next-line no-console
      console.log(`[skip] DB status is ${order.status} (not pending)`);
      continue;
    }

    const paymentsResp: any = await razorpay.orders.fetchPayments(razorpayOrderId);
    const items: CapturedPayment[] = Array.isArray(paymentsResp?.items) ? paymentsResp.items : [];
    const captured = items.find((p) => p?.status === 'captured');

    if (!captured) {
      // eslint-disable-next-line no-console
      console.log(
        `[skip] no captured payment found in Razorpay (statuses: ${items
          .map((p) => p?.status)
          .filter(Boolean)
          .join(', ') || 'none'})`
      );
      continue;
    }

    const verifiedAt =
      typeof captured.created_at === 'number' ? new Date(captured.created_at * 1000) : new Date();

    if (dryRun) {
      // eslint-disable-next-line no-console
      console.log(`[dry-run] would set status=processing, paymentId=${captured.id}`);
      continue;
    }

    const updated = await Order.findOneAndUpdate(
      { _id: order._id, status: 'pending' },
      {
        status: 'processing',
        'payment.status': 'completed',
        'payment.transactionId': captured.id,
        'payment.verifiedAt': verifiedAt,
      },
      { new: true }
    );

    if (!updated) {
      // eslint-disable-next-line no-console
      console.log('[skip] lost race (order no longer pending)');
      continue;
    }

    // eslint-disable-next-line no-console
    console.log(`[ok] updated order ${updated._id} to processing (payment ${captured.id})`);
  }

  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[fatal]', err);
  process.exit(1);
});

