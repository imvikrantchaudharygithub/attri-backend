# B1G1 Coupon Setup Guide

## Overview
This guide explains how to create and manage Buy One Get One (B1G1) coupons in your e-commerce platform.

## How B1G1 Works
- Customer enters coupon code "B1G1" at checkout
- Cart must have at least 2 items (total quantity)
- The lowest priced item becomes FREE
- Only 1 item is discounted per cart (not per product quantity)

### Example Scenarios

**Scenario 1: Simple Cart**
- Cart: Product A (₹500) × 1, Product B (₹600) × 1
- Discount: ₹500 (lowest price)
- Customer Pays: ₹600

**Scenario 2: Multiple Quantities**
- Cart: Product A (₹500) × 1, Product B (₹600) × 3
- Discount: ₹500 (only 1 item free)
- Customer Pays: ₹2,300 - ₹500 = ₹1,800

**Scenario 3: Three Products**
- Cart: Product A (₹400) × 1, Product B (₹500) × 1, Product C (₹700) × 1
- Discount: ₹400 (lowest price)
- Customer Pays: ₹1,200

## Creating a B1G1 Coupon

### API Endpoint
```
POST /admin/create-coupon
Content-Type: application/json
```

### Request Body
```json
{
  "code": "B1G1",
  "discountType": "b1g1",
  "discountValue": 0,
  "minPurchaseAmount": 0,
  "maxDiscountAmount": 0,
  "validFrom": "2025-01-01T00:00:00.000Z",
  "validTo": "2025-12-31T23:59:59.999Z",
  "products": [],
  "usageLimit": 0,
  "status": "active"
}
```

### Field Descriptions
- **code**: `"B1G1"` - The coupon code customers will enter (can be any code you want)
- **discountType**: `"b1g1"` - Must be set to "b1g1" for Buy One Get One offers
- **discountValue**: `0` - Not used for B1G1, but required field
- **minPurchaseAmount**: `0` - Minimum cart value required (0 = no minimum)
- **maxDiscountAmount**: `0` - Maximum discount limit (0 = no limit)
- **validFrom**: Start date/time for the coupon
- **validTo**: End date/time for the coupon
- **products**: `[]` - Empty array means applies to all products
- **usageLimit**: `0` - How many times coupon can be used (0 = unlimited)
- **status**: `"active"` - Coupon status ("active" or "inactive")

### cURL Example
```bash
curl -X POST http://localhost:3000/admin/create-coupon \
  -H "Content-Type: application/json" \
  -d '{
    "code": "B1G1",
    "discountType": "b1g1",
    "discountValue": 0,
    "minPurchaseAmount": 0,
    "maxDiscountAmount": 0,
    "validFrom": "2025-01-01T00:00:00.000Z",
    "validTo": "2025-12-31T23:59:59.999Z",
    "products": [],
    "usageLimit": 0,
    "status": "active"
  }'
```

### Success Response
```json
{
  "success": true,
  "coupon": {
    "_id": "65abc123def456...",
    "code": "B1G1",
    "discountType": "b1g1",
    "discountValue": 0,
    "minPurchaseAmount": 0,
    "maxDiscountAmount": 0,
    "validFrom": "2025-01-01T00:00:00.000Z",
    "validTo": "2025-12-31T23:59:59.999Z",
    "products": [],
    "usageLimit": 0,
    "usedCount": 0,
    "status": "active",
    "createdAt": "2025-11-16T...",
    "updatedAt": "2025-11-16T..."
  }
}
```

## Creating Limited B1G1 Offers

### Example 1: Limited Time Offer
```json
{
  "code": "WEEKEND_B1G1",
  "discountType": "b1g1",
  "discountValue": 0,
  "validFrom": "2025-11-20T00:00:00.000Z",
  "validTo": "2025-11-22T23:59:59.999Z",
  "usageLimit": 100,
  "status": "active"
}
```

### Example 2: Minimum Purchase Required
```json
{
  "code": "B1G1_MIN500",
  "discountType": "b1g1",
  "discountValue": 0,
  "minPurchaseAmount": 500,
  "validFrom": "2025-11-01T00:00:00.000Z",
  "validTo": "2025-11-30T23:59:59.999Z",
  "status": "active"
}
```

### Example 3: Product-Specific B1G1
```json
{
  "code": "B1G1_SHIRTS",
  "discountType": "b1g1",
  "discountValue": 0,
  "products": ["65abc123...", "65def456..."],
  "validFrom": "2025-11-01T00:00:00.000Z",
  "validTo": "2025-12-31T23:59:59.999Z",
  "status": "active"
}
```
Note: When products array is not empty, B1G1 only applies if cart contains those specific products.

## Managing B1G1 Coupons

### Get All Coupons
```bash
GET /admin/get-coupons
```

### Update Coupon
```bash
PUT /admin/update-coupon/:couponId
Content-Type: application/json

{
  "status": "inactive"  // Deactivate the coupon
}
```

### Delete Coupon
```bash
POST /admin/delete-coupon/:couponId
```

## Customer Usage

### How Customers Apply B1G1

**Endpoint:**
```
POST /apply-coupon
Authorization: Bearer <user-token>
Content-Type: application/json
```

**Request:**
```json
{
  "code": "B1G1",
  "cartId": "65xyz789..."
}
```

**Success Response:**
```json
{
  "success": true,
  "message": "B1G1 offer applied - Lowest priced item free!",
  "coupon": {
    "code": "B1G1",
    "discountType": "b1g1"
  },
  "cartTotal": 2300,
  "discount": 500,
  "finalAmount": 1800,
  "cartItems": [...]
}
```

**Error Response (Less than 2 items):**
```json
{
  "success": false,
  "message": "B1G1 offer requires at least 2 items in cart"
}
```

**Error Response (Coupon not found/expired):**
```json
{
  "success": false,
  "message": "Coupon not found or expired"
}
```

## Frontend Integration

### React/Next.js Example

```javascript
// Apply Coupon Function
const applyCoupon = async (couponCode, cartId) => {
  try {
    const response = await fetch('/apply-coupon', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({
        code: couponCode.toUpperCase(),
        cartId: cartId
      })
    });

    const data = await response.json();

    if (data.success) {
      // Update UI with discount
      setDiscount(data.discount);
      setFinalAmount(data.finalAmount);
      setDiscountMessage(data.message);
    } else {
      // Show error message
      setErrorMessage(data.message);
    }
  } catch (error) {
    console.error('Error applying coupon:', error);
    setErrorMessage('Failed to apply coupon');
  }
};
```

### Cart Summary UI Component

```jsx
<div className="cart-summary">
  <div className="subtotal">
    <span>Subtotal:</span>
    <span>₹{cartTotal}</span>
  </div>
  
  <div className="coupon-section">
    <input 
      type="text"
      placeholder="Enter coupon code (e.g., B1G1)"
      value={couponCode}
      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
      className="coupon-input"
    />
    <button onClick={() => applyCoupon(couponCode, cartId)}>
      Apply
    </button>
  </div>
  
  {discount > 0 && (
    <div className="discount-applied">
      <span>Discount ({discountMessage})</span>
      <span className="discount-amount">-₹{discount}</span>
    </div>
  )}
  
  {errorMessage && (
    <div className="error-message">
      {errorMessage}
    </div>
  )}
  
  <div className="total">
    <strong>Total:</strong>
    <strong>₹{finalAmount}</strong>
  </div>
  
  <button className="checkout-btn">
    Proceed to Checkout
  </button>
</div>
```

## Testing Checklist

- [ ] Create B1G1 coupon via admin API
- [ ] Verify coupon appears in coupon list
- [ ] Test applying B1G1 with 2 different products - verify lowest price is discounted
- [ ] Test applying B1G1 with 1 product - verify error message
- [ ] Test applying B1G1 with mixed quantities (e.g., 1×₹500, 3×₹600) - verify ₹500 discount
- [ ] Test with expired coupon - verify error message
- [ ] Test with invalid coupon code - verify error message
- [ ] Test with minimum purchase amount constraint
- [ ] Test with usage limit - verify it stops working after limit reached
- [ ] Test deactivating coupon - verify it can't be applied when inactive
- [ ] Test frontend UI displays discount correctly
- [ ] Test order creation with B1G1 discount applied

## Troubleshooting

### Issue: "Coupon not found or expired"
**Solution:** Check that:
- Coupon code is correct (case-insensitive)
- Coupon status is "active"
- Current date is between validFrom and validTo dates

### Issue: "B1G1 offer requires at least 2 items in cart"
**Solution:** Customer needs to add at least 2 items (total quantity) to their cart

### Issue: Discount amount seems wrong
**Solution:** Remember that B1G1 discounts the LOWEST priced single item only, not multiple items

### Issue: Coupon already exists
**Solution:** Coupon codes must be unique. Use a different code or update the existing coupon

## Notes

1. B1G1 coupons can be combined with other cart-level discounts, but this may need additional business logic
2. The discount is calculated on the item price, not including any other product-level discounts
3. Consider adding analytics to track B1G1 coupon usage and effectiveness
4. You may want to add admin UI to easily create and manage B1G1 offers
5. Consider adding email/SMS notifications when new B1G1 offers are available

