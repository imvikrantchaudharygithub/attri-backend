import { Request, Response } from 'express';
import Order from '../models/order.model';
import { shiprocketService } from '../services/shirocketService';


export const createShiprocketOrder = async (orderId:string): Promise<any> => {
  try {


    // Get order from database
    const order:any = await Order.findById(orderId)
      .populate('user', 'username email phone')
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
      billing_customer_name: order?.user?.username ,
      billing_last_name: "",
      billing_address: order.address.street,
      billing_address_2: order.address.landmark || "",
      billing_city: order.address.city,
      billing_pincode: order.address.pincode.toString(),
      billing_state: order.address.state,
      billing_country: "India",
      billing_email: order.user.email || "",
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
      order.tracking_orderid = response?.data?.order_id.toString();
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

    // Validate input
    if (!shipmentIds?.length || !Array.isArray(shipmentIds)) {
      res.status(400).json({
        success: false,
        message: 'At least one valid shipment ID is required'
      });
      return;
    }

    // Add before manifest generation
    // const preCheck = await shiprocketService.checkShipmentStatus(shipmentIds);
    // if (!preCheck.valid) {
    //    res.status(400).json({
    //     success: false,
    //     message: 'Shipments not ready for manifest',
    //     preCheck: preCheck.valid,
    //     // invalid_shipments: preCheck.invalid,
    //     // raw_response: preCheck // For debugging
    //   });
    //   return;
    // }

    // Convert to strings for DB query
    const stringIds = shipmentIds.map(String);

    // Check for existing manifests and valid tracking numbers
    const orders = await Order.find({ tracking_number: { $in: stringIds } });
    
    const invalidOrders = orders.filter(order => 
      !order.tracking_number || order.manifest_url
    );

    if (invalidOrders.length > 0) {
      const errors = invalidOrders.map(order => ({
        trackingNumber: order.tracking_number,
        issue: !order.tracking_number ? 'Missing tracking number' : 'Existing manifest'
      }));
      
      
      res.status(400).json({
        success: false,
        message: 'Invalid orders found',
        errors
      });
      return;
    }

    // Generate manifest with Shiprocket
    const response = await shiprocketService.generateManifest({
      shipment_id: shipmentIds.map(id => Number(id))
    });

    // Update orders with manifest URL from response
    await Order.updateMany(
      { tracking_number: { $in: stringIds } },
      { $set: { manifest_url: response.manifest_url } }
    );

    res.json({
      success: true,
      message: 'Manifest generated successfully',
      data: response
    });

  } catch (error: any) {
    console.error('Manifest generation error:', error);
    const statusCode = error.message.includes('already exists') ? 409 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Failed to generate manifest'
    });
  }
};

export const generateLabel = async (req: Request, res: Response): Promise<void> => {
  try {
    const { shipmentIds } = req.body;

    if (!shipmentIds?.length || !Array.isArray(shipmentIds)) {  
      res.json({
        success: false,
        message: 'At least one valid shipment ID is required'
      });
      return;
    }   

    const response = await shiprocketService.generateLabel({
      shipment_ids: shipmentIds.map(id => Number(id))
    });

    res.json({
      success: true,
      message: 'Label generated successfully',
      data: response
    });

  } catch (error:any) { 
    console.error('Label generation error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate label'
    });
  }
};

  
export const getcheckServiceability = async (req: Request, res: Response): Promise<void> => {
  try {
    const { pickupPostcode, deliveryPostcode, weight, orderId } = req.body;
    console.log(req.body);

    const response = await shiprocketService.checkServiceability({  
         pickup_postcode: pickupPostcode,
         delivery_postcode: deliveryPostcode,
         weight: weight,
         order_id: orderId
    });
    res.json({
      success: true,
      message: 'Serviceability checked successfully',
      data: response?.data
    });
  } catch (error:any) { 
    console.error('Serviceability check error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to check serviceability'
    });
  }
};  


export const assignAWB = async (req: Request, res: Response): Promise<void> => {
  try {
    const { shipmentIds, courierId } = req.body;

    const response = await shiprocketService.assignAWB({    
      shipment_ids: shipmentIds.map((id:any) => Number(id)),
      courier_id: Number(courierId)
    });

    // Update order status to confirmed using tracking_number
    await Order.updateMany(
      { tracking_number: { $in: shipmentIds } },
      { $set: { status: 'confirmed' } }
    );

    res.json({
      success: true,
      message: 'AWB assigned successfully and order status updated',
      data: response?.data
    });
  } catch (error:any) {
    console.error('AWB assignment error:', error);  
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to assign AWB'
    });
  }
};


export const generatePickup = async (req: Request, res: Response): Promise<void> => {
  try {
    // Destructure using snake_case to match payload
    const { 
      shipmentIds,
      pickup_date: pickupDate,  // Map payload's pickup_date to pickupDate
      pickup_time: pickupTime   // Map payload's pickup_time to pickupTime
    } = req.body;

    // Validate time format
    const timeFormatRegex = /^(0?[0-9]|1[0-9]|2[0-3]):([0-5][0-9])$/;
    if (!pickupTime?.from || !timeFormatRegex.test(pickupTime.from) ||
        !pickupTime?.to || !timeFormatRegex.test(pickupTime.to)) {
      res.status(400).json({
        success: false,
        message: 'Invalid time format. Use HH:MM 24-hour format (e.g. "09:00" or "14:30")'
      });
      return;
    }

    // Validate date format (YYYY-MM-DD)
    const dateFormatRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateFormatRegex.test(pickupDate)) {
      res.status(400).json({
        success: false,
        message: 'Invalid date format. Use YYYY-MM-DD'
      });
      return;
    }

    // Convert and validate shipment IDs
    const numericShipmentIds = shipmentIds
      .map((id:any) => Number(id))
      .filter((id:any) => !isNaN(id) && id > 0);

    if (numericShipmentIds.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Invalid shipment ID format'
      });
      return;
    }

    // Validate time window
    const [fromHours, fromMinutes] = pickupTime.from.split(':').map(Number);
    const [toHours, toMinutes] = pickupTime.to.split(':').map(Number);
    const totalFrom = fromHours * 60 + fromMinutes;
    const totalTo = toHours * 60 + toMinutes;
    
    if (totalTo <= totalFrom) {
      res.status(400).json({
        success: false,
        message: 'Pickup end time must be after start time'
      });
      return;
    }

    const response = await shiprocketService.generatePickup({
      shipment_id: numericShipmentIds,
      pickup_date: pickupDate,
      pickup_time: {
        from: pickupTime.from,
        to: pickupTime.to
      }
    });

    res.json({
      success: true,
      message: 'Pickup generated successfully',
      data: response
    });

  } catch (error: any) {
    console.error('Pickup generation error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate pickup'
    });
  }
};

export const trackOrderByOrderId = async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderId, channelId } = req.body;

    const response = await shiprocketService.trackOrderByOrderId(orderId, channelId);
    res.json({
      success: true,
      message: 'Order tracked successfully',
      data: response?.data
    });
  } catch (error:any) {
    console.error('Track order by order ID error:', error); 
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to track order'
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
    await Order.updateOne(
        { _id: payload.order_id },
        { $set: { status: payload.current_status.toLowerCase() } }
      );
    
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

export const printManifest = async (req: Request, res: Response): Promise<void> => {
  try {
    const { shipmentIds, format = 'pdf' } = req.body;

    // Validate input
    if (!shipmentIds?.length || !Array.isArray(shipmentIds)) {
      res.status(400).json({
        success: false,
        message: 'At least one valid shipment ID is required'
      });
      return;
    }

    // Convert to strings for DB query
    const stringIds = shipmentIds.map(String);

    // Check for existing manifests in database
    const invalidShipments = await Order.find({
      tracking_orderids: { $in: stringIds },
      manifest_url: { $exists: false }
    });

    if (invalidShipments.length > 0) {
      const missingIds = invalidShipments.map(s => s.tracking_orderid);
      res.status(400).json({
        success: false,
        message: 'Manifest not generated for these shipments',
        missingShipments: missingIds
      });
      return;
    }

    // Call Shiprocket service
    const response = await shiprocketService.printManifest({
      shipment_ids: shipmentIds.map(id => Number(id)),
      format: format as 'pdf' | 'csv'
    });

    res.json({
      success: true,
      message: 'Manifest printed successfully',
      data: response
    });

  } catch (error: any) {
    console.error('Manifest print error:', error);
    const statusCode = error.message.includes('No manifest exists') ? 400 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Failed to print manifest'
    });
  }
};
