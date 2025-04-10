import { Request, Response } from 'express';
import Order from '../models/order.model';
import { shiprocketService } from '../services/shirocketService';

export const createShiprocketOrder = async (orderId:string): Promise<any> => {
  try {


    // Get order from database
    const order:any = await Order.findById(orderId)
      .populate('user', 'name email phone')
      .populate('address')
      .populate('products.product', 'name sku weight dimensions price');
      
    if (!order) {
      return { success: false, message: 'Order not found' };
    }

    // Prepare Shiprocket payload
    const payload = {
      order_id: order._id.toString(),
      order_date: order.createdAt.toISOString(),
      channel_id: "WEB",
      pickup_location: "Primary Warehouse",
      billing_customer_name: order.user.username || "Customer Name",
      billing_last_name: "",
      billing_address: order.address.street,
      billing_address_2: order.address.landmark || "",
      billing_city: order.address.city,
      billing_pincode: order.address.pincode.toString(),
      billing_state: order.address.state,
      billing_country: "India",
      billing_email: order.user.email || "no-reply@example.com",
      billing_phone: `91${order.address.contact}`.replace(/\D/g, "").slice(0, 12),
      shipping_is_billing: true,
      order_items: order.products.map((item: any) => ({
        name: item.product.name.substring(0, 50),
        sku: item.product.sku || "DEFAULT-SKU",
        units: item.quantity,
        selling_price: item.priceAtPurchase.toFixed(2),
        hsn: item.product.hsn || "000000"
      })),
      payment_method: (order.paymentMethod === "COD" ? "COD" : "Prepaid") as 'COD' | 'Prepaid',
      sub_total: order.totalAmount.toFixed(2),
      total_discount: "0.00",
      shipping_charges: "0.00",
      weight: (order.totalWeight || 0.5).toFixed(2),
      length: order.products[0]?.product?.dimensions?.length?.toFixed(2) || "1.00",
      breadth: order.products[0]?.product?.dimensions?.width?.toFixed(2) || "1.00",
      height: order.products[0]?.product?.dimensions?.height?.toFixed(2) || "1.00",
      ...(order.paymentMethod === "COD" && {
        cod: 1,
        cod_amount: order.totalAmount.toFixed(2)
      })
    };
    console.log(payload);
    // Create Shiprocket order
    const response = await shiprocketService.createOrder(payload);
    
    // Update local order with tracking info
    if (response.data && response.data.shipment_id) {
      order.tracking_number = response?.data?.shipment_id.toString();
      await order.save();
    }
    console.log(response?.data);

    return {
      success: true,
      message: 'Order created in Shiprocket',
      data: response?.data
    };

  } catch (error:any) {
    console.error('Shiprocket order creation error:', error);
    return {
      success: false,
      message: error.message || 'Failed to create Shiprocket order'
    };
  }
};

export const addPickupAddress = async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      address,
      pincode,
      city,
      state,
      country,
      contact_person,
      phone,
      email,
      vendor_name,
      latitude,
      longitude
    } = req.body;

    // Validate required fields
    if (!address || !pincode || !city || !state || !country) {
       res.json({
        success: false,
        message: 'Missing required fields: address, pincode, city, state, country'
      });
      return;
    }

    const payload = {
      address,
      pin_code: pincode,
      city,
      state,
      country,
      pickup_location: 'Primary Warehouse',
      contact_person: contact_person || 'Warehouse Manager',
      phone: phone || process.env.DEFAULT_PHONE,
      email: email || process.env.DEFAULT_EMAIL,
      name: vendor_name || 'Primary Vendor',
      ...(latitude && { latitude: parseFloat(latitude) }),
      ...(longitude && { longitude: parseFloat(longitude) })
    };

    const response = await shiprocketService.addPickupAddress(payload);

    res.json({
      success: true,
      message: 'Pickup address added successfully',
      data: response
    });

  } catch (error:any) {
    console.error('Add pickup address error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to add pickup address'
    });
  }
};

export const generateManifest = async (req: Request, res: Response): Promise<void> => {
  try {
    const { shipmentIds } = req.body;

    if (!shipmentIds?.length || !Array.isArray(shipmentIds)) {
      res.json({
        success: false,
        message: 'At least one valid shipment ID is required'
      });
      return;
    }

    const response = await shiprocketService.generateManifest({
      shipment_ids: shipmentIds.map(id => Number(id))
    });

    res.json({
      success: true,
      message: 'Manifest generated successfully',
      data: {
        manifest_url: response?.data?.manifest_url,
        shipment_ids: response?.data?.shipment_ids
      }
    });

  } catch (error:any) {
    console.error('Manifest generation error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate manifest'
    });
  }
};

export const shiprocketWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const signature = req.headers['x-api-key'] as string;
    const payload = req.body;

    // Verify webhook signature
    if (!verifySignature(signature, payload)) {
      res.status(200).json({ success: false, message: 'Invalid signature' });
      return;
    }
    console.log(payload);
    // Process webhook event
    switch(payload.event) {
      case 'tracking':
        await handleTrackingUpdate(payload.data);
        break;
      case 'order_status':
        await handleOrderStatusUpdate(payload.data);
        break;
      default:
        console.log('Unhandled webhook event:', payload.event);
    }

    // Return only 200 status without body
    res.sendStatus(200);

  } catch (error) {
    console.error('Webhook error:', error);
    res.sendStatus(200);
  }
};

// Helper functions
const verifySignature = (signature: string, payload: any) => {
  // Implement your signature verification logic
  return true; // Temporary bypass
};

const handleTrackingUpdate = async (data: any) => {
  // Update order tracking in your database
};

const handleOrderStatusUpdate = async (data: any) => {
  // Update order status in your database
};
