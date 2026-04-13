# Recovering stuck orders (paid in Razorpay, still `pending` in DB)

After deploying the webhook + `verifyPayment` fixes, new payments should no longer get stuck. Historical orders that were captured in Razorpay but never updated in MongoDB need a one-time fix.

## 1. Find affected orders

In **Razorpay Dashboard**, open each captured payment and copy:

- `order_id` (Razorpay order id, e.g. `order_ScbZjiWu7R8MHT`)
- `payment_id` (optional, for your records)

## 2. Check MongoDB

In `mongosh` or Compass, confirm the document still has `status: "pending"` and matching `razorpay_order_id`:

```js
db.orders.find({ razorpay_order_id: "order_ScbZjiWu7R8MHT" })
```

## 3. Option A — Mark paid only (minimal)

Use when you will **manually** run commission / Shiprocket / cart logic, or when those steps already ran:

```js
db.orders.updateOne(
  { razorpay_order_id: "order_ScbZjiWu7R8MHT", status: "pending" },
  {
    $set: {
      status: "processing",
      "payment.status": "completed",
      "payment.transactionId": "pay_xxxxxxxxxxxx",
      "payment.verifiedAt": new Date()
    }
  }
)
```

Replace `razorpay_order_id`, `payment.transactionId`, and repeat for each stuck order.

## 4. Option B — Re-run full post-payment flow

If **nothing** ran (no Shiprocket, no commissions, cart not cleared), prefer fixing data in the app:

- Either call your internal admin tools if you have them, **or**
- Temporarily use a guarded script that loads each order and invokes the same functions as `verifyPayment` / webhook (only for known `razorpay_order_id` values). Do **not** double-run commissions on orders already partially processed.

## 5. Verify

- Admin dashboard shows status **processing** (or your next workflow state).
- User order history matches Razorpay amount.
