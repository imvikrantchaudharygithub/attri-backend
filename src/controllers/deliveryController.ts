import Order from '../models/order.model';
import { BigShipService } from '../services/deliveryService';
import { Request, Response } from 'express';
// import { Order } from '../models/order.model';

// Example usage
const bigship = new BigShipService();

export const loginAndGetToken = async (): Promise<string> => {
  try {
    const auth = await bigship.loginUser({
        user_name: process.env.BIGSHIP_USER!,
        password: process.env.BIGSHIP_PASSWORD!,
        access_key: process.env.BIGSHIP_ACCESS_KEY!
      });

    if (!auth.data?.data?.token) {
      throw new Error('Token not found in login response');
    }
    
    return auth.data.data.token;
    
  } catch (error: any) {
    console.error('Login failed:', error.response?.data || error.message);
    throw new Error('Failed to authenticate with BigShip API');
  }
};

// Example usage in a controller
export const getShippingData = async (req: Request, res: Response) => {
  try {
    const token = await loginAndGetToken();
    
    // Now use the token for subsequent API calls
    const balance = await bigship.getWalletBalance(token);
    
    res.json({
      token,  // For debugging - don't expose in production
      balance: balance.data
    });
    
  } catch (error: any) {
    res.status(500).json({
      message: error.message,
      details: error.response?.data || null
    });
  }
};

export const getCourierList = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = await loginAndGetToken();
    const response = await bigship.getCourierList('b2c',token);
    res.status(200).json({
      success: true,
      data: response.data
    });
  } catch (error: any) {
    console.error('Courier List Error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to get courier list',
      error: error.response?.data || error.message
    });
  }
};



// Example: Get product categories (static data)
const categories = bigship.getProductCategories();

export const addWarehouse = async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      address_line1,
      address_line2,
      address_landmark,
      address_pincode,
      contact_number_primary
    } = req.body;

    // Validate required fields
    if (!address_line1 || !address_pincode || !contact_number_primary) {
      res.status(400).json({ 
        success: false,
        message: 'Missing required fields: address_line1, address_pincode, contact_number_primary' 
      });
      return;
    }

    // Get authentication token
    const token = await loginAndGetToken();

    // Prepare payload with defaults for optional fields
    const payload = {
      address_line1,
      address_line2: address_line2 || '',
      address_landmark: address_landmark || '',
      address_pincode,
      contact_number_primary
    };

    // Call BigShip API
    const response = await bigship.addWarehouse(payload, token);
    
    res.status(200).json({
      success: true,
      data: response.data
    });
    
  } catch (error: any) {
    console.error('Warehouse Error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to add warehouse',
      error: error.response?.data || error.message
    });
  }
};

export const createSingleOrderShipment = async (orderId:string): Promise<void> => {
  try {
    const token = await loginAndGetToken();

    // Get order details from your database
    const order:any = await Order.findById(orderId)
      .populate('products.product')
      .populate('products.product.category', 'name')
      .populate('address')
      .populate('user', 'username phone  _id  ')
    
    if (!order) {
      throw new Error('Order not found');
    }

    // Construct payload from order data
    const payload:any = {
      shipment_category: 'b2c',
      warehouse_detail: {
        pickup_location_id: 157222, // Replace with actual warehouse ID
        return_location_id: 157222  // Replace with actual return location
      },
      consignee_detail: {
        first_name: order?.user?.username,
        last_name:  order?.user?.username,
        contact_number_primary: String(order?.address?.contact),
        consignee_address: {
          address_line1: order?.address?.street.substring(0, 50).padEnd(10, 'X'),
          pincode: order?.address?.pincode,
          address_city: order?.address?.city,
          address_state: order?.address?.state
        }
      },
      order_detail: {
        invoice_date: new Date().toISOString(),
        invoice_id: order._id.toString(),
        document_detail: {
            document_type: 'invoice',
            invoice_document_file:'',
            document_url: '' // Replace with actual invoice URL
          },
        payment_type: order.paymentMethod === 'COD' ? 'COD' : 'Prepaid',
        shipment_invoice_amount: order.totalAmount,
        total_collectable_amount: order.paymentMethod === 'COD' ? order.totalAmount : 0,
        box_details: order.products.map((productItem:any) => ({
          each_box_dead_weight: productItem?.product?.weight || 1,
          each_box_length: productItem?.product?.dimensions?.length || 1,
          each_box_width: productItem?.product?.dimensions?.width || 1,
          each_box_height: productItem?.product?.dimensions?.height || 1,
          each_box_collectable_amount: order.paymentMethod === 'COD' ? productItem?.priceAtPurchase : 0,
          each_box_invoice_amount: productItem?.priceAtPurchase,
          box_count: productItem?.quantity,
          product_details: [{
            product_category: productItem?.product?.category?.name,
            product_name: productItem?.product?.name,
            product_quantity: productItem?.quantity,
            each_product_invoice_amount: productItem?.priceAtPurchase
          }]
        }))
      }
    };
    console.log(payload);
    const response = await bigship.addSingleOrder(payload, token);
    
    // Extract system_order_id from response and update order
    if (response.data.success) {
      const idMatch = response.data.data.match(/\d+/); // Extract first numeric ID from string
      if (!idMatch) {
        throw new Error('Failed to extract system_order_id from response');
      }
      const systemOrderId = idMatch[0];
      order.tracking_number = systemOrderId;
      console.log('Updated order with tracking number:', systemOrderId);
      await order.save();
    }
    // console.log(response.data,order.tracking_number);
    return response.data;
    // res.status(200).json({
    //   success: true,
    //   data: response.data
    // });

  } catch (error: any) {
    // console.log(payload);

    console.error('Order Shipment Error:', error.response?.data || error.message);
    throw new Error('Failed to create order shipment');
    // res.status(500).json({
    //   success: false,
    //   message: 'Failed to create order shipment',
    //   error: error.response?.data || error.message
    // });
  }
};

export const manifestOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const {  system_order_id } = req.body;
    const token = await loginAndGetToken();
    const response = await bigship.manifestSingleOrder({
        system_order_id: system_order_id,
        courier_id: 1
      }, token);
    res.status(200).json({
      success: true,
      data: response.data
    });
  } catch (error: any) {
    console.error('Manifest Error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to manifest order',
      error: error.response?.data || error.message
    });
  }
};
export const getShipmentDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const { shipment_data_id, system_order_id } = req.body;
    const token = await loginAndGetToken();

    const response = await bigship.getShipmentData(shipment_data_id, system_order_id, token);
    res.status(200).json({
      success: true,
      data: response.data
    });

  } catch (error: any) {
    console.error('Shipment Details Error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to get shipment details',
      error: error.response?.data || error.message
    });
  }
};

export const getTrackingDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const { tracking_type, tracking_id } = req.body;
    const token = await loginAndGetToken(); 

    const response = await bigship.getTrackingDetails(tracking_type, tracking_id, token);
    res.status(200).json({
      success: true,
      data: response.data
    });

  } catch (error: any) {
    console.error('Tracking Details Error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to get tracking details',
      error: error.response?.data || error.message
    });
  }     
};




