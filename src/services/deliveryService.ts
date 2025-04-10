// bigship.service.ts
import axios, { AxiosInstance } from 'axios';

const BASE_URL = 'https://api.bigship.in/';

export class BigShipService {
  private axiosInstance: AxiosInstance;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: BASE_URL,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  // 1. API TO LOGIN / GENERATE TOKEN
  async loginUser(payload: {
    user_name: string;
    password: string;
    access_key: string;
  }) {
    return this.axiosInstance.post('/api/login/user', payload);
  }

  // 2. API TO GET PAYMENT CATEGORY
  async getPaymentCategory(shipment_category: 'b2c' | 'b2b', token: string) {
    return this.axiosInstance.get('/api/payment/category', {
      params: { shipment_category },
      headers: { Authorization: `Bearer ${token}` }
    });
  }

  // 3. API TO GET COURIER LIST
  async getCourierList(shipment_category: 'b2c' | 'b2b', token: string) {
    return this.axiosInstance.get('/api/courier/get/all', {
      params: { shipment_category },
      headers: { Authorization: `Bearer ${token}` }
    });
  }

  // 4. API TO GET CURRENT WALLET BALANCE
  async getWalletBalance(token: string) {
    return this.axiosInstance.get('/api/Wallet/balance/get', {
      headers: { Authorization: `Bearer ${token}` }
    });
  }

  // 5. API TO ADD WAREHOUSE
  async addWarehouse(payload: {
    address_line1: string;
    address_line2?: string;
    address_landmark?: string;
    address_pincode: string;
    contact_number_primary: string;
  }, token: string) {
    return this.axiosInstance.post('/api/warehouse/add', payload, {
      headers: { Authorization: `Bearer ${token}` }
    });
  }

  // 6. API TO ADD SINGLE ORDER
  async addSingleOrder(payload: {
    shipment_category: 'b2c';
    warehouse_detail: {
      pickup_location_id: number;
      return_location_id: number;
    };
    consignee_detail: {
      first_name: string;
      last_name: string;
      company_name?: string;
      contact_number_primary: string;
      contact_number_secondary?: string;
      email_id?: string;
      consignee_address: {
        address_line1: string;
        address_line2?: string;
        address_landmark?: string;
        pincode: string;
      };
    };
    order_detail: {
      invoice_date: string;
      invoice_id: string;
      payment_type: 'COD' | 'Prepaid';
      shipment_invoice_amount: number;
      total_collectable_amount?: number;
      box_details: Array<{
        each_box_dead_weight: number;
        each_box_length: number;
        each_box_width: number;
        each_box_height: number;
        each_box_invoice_amount: number;
        each_box_collectable_amount?: number;
        box_count: number;
        product_details: Array<{
          product_category: string;
          product_sub_category?: string;
          product_name: string;
          product_quantity: number;
          each_product_invoice_amount: number;
          each_product_collectable_amount?: number;
          hsn?: string;
        }>;
      }>;
    };
    ewaybill_number?: string;
    document_detail?: {
      invoice_document_file?: string;
      ewaybill_document_file?: string;
    };
  }, token: string) {
    return this.axiosInstance.post('/api/order/add/single', payload, {
      headers: { Authorization: `Bearer ${token}` }
    });
  }

  // 7. API TO MANIFEST SINGLE ORDER
  async manifestSingleOrder(payload: {
    system_order_id: number;
    courier_id?: number;
  }, token: string) {
    return this.axiosInstance.post('/api/order/manifest/single', payload, {
      headers: { Authorization: `Bearer ${token}` }
    });
  }

  // 8. API TO GET AWB, LABEL AND MANIFEST
  async getShipmentData(shipment_data_id: number, system_order_id: string, token: string) {
    return this.axiosInstance.post('/api/shipment/data?shipment_data_id=1&system_order_id=1000252329', null, {
      params: { shipment_data_id, system_order_id },
      headers: { Authorization: `Bearer ${token}` }
    });
  }

  // 9. API TO CANCEL AWB
  async cancelAWB(awbs: string[], token: string) {
    return this.axiosInstance.put('/api/order/cancel', awbs, {
      headers: { Authorization: `Bearer ${token}` }
    });
  }

  // 10. LIST OF PRODUCT CATEGORY (Static Data)
  getProductCategories() {
    return [
      'Accessories', 'FashionClothing', 'BookStationary', 'Electronics',
      'FMCG', 'Footwear', 'Toys', 'SportsEquipment', 'Others',
      'Wellness', 'Medicines'
    ];
  }

  // 11. API TO GET SHIPPING RATES LIST
  async getShippingRates(
    shipment_category: 'b2c' | 'b2b',
    system_order_id: number,
    token: string,
    risk_type?: string,
  ) {
    return this.axiosInstance.get('/api/order/shipping/rates', {
      params: { shipment_category, system_order_id, risk_type },
      headers: { Authorization: `Bearer ${token}` }
    });
  }

  // 12. API TO ADD HEAVY ORDER
  async addHeavyOrder(payload: {
    shipment_category: 'b2b';
    warehouse_detail: {
      pickup_location_id: number;
      return_location_id: number;
    };
    consignee_detail: {
      first_name: string;
      last_name: string;
      company_name?: string;
      contact_number_primary: string;
      contact_number_secondary?: string;
      email_id?: string;
      consignee_address: {
        address_line1: string;
        address_line2?: string;
        address_landmark?: string;
        pincode: string;
      };
    };
    order_detail: {
      invoice_date: string;
      invoice_id: string;
      payment_type: 'COD' | 'Prepaid' | 'ToPay';
      shipment_invoice_amount: number;
      total_collectable_amount?: number;
      box_details: Array<{
        each_box_dead_weight: number;
        each_box_length: number;
        each_box_width: number;
        each_box_height: number;
        box_count: number;
        product_details: Array<{
          product_category: string;
          product_sub_category?: string;
          product_name: string;
          product_quantity: number;
          hsn?: string;
        }>;
      }>;
    };
    ewaybill_number?: string;
    document_detail?: {
      invoice_document_file?: string;
      ewaybill_document_file?: string;
    };
  }, token: string) {
    return this.axiosInstance.post('/api/order/add/heavy', payload, {
      headers: { Authorization: `Bearer ${token}` }
    });
  }

  // 13. API TO MANIFEST HEAVY ORDER
  async manifestHeavyOrder(payload: {
    system_order_id: number;
    courier_id: number;
    risk_type?: string;
  }, token: string) {
    return this.axiosInstance.post('/api/order/manifest/heavy', payload, {
      headers: { Authorization: `Bearer ${token}` }
    });
  }

  // 14. LIST OF RISK TYPE (Static Data)
  getRiskTypes() {
    return ['OwnerRisk', 'CarrierRisk'];
  }

  // 15. API TO CALCULATE RATES
  async calculateRates(payload: {
    shipment_category: 'b2c' | 'b2b';
    payment_type: string;
    pickup_pincode: number;
    destination_pincode: number;
    shipment_invoice_amount: number;
    risk_type?: string;
    box_details: Array<{
      each_box_dead_weight: number;
      each_box_length: number;
      each_box_width: number;
      each_box_height: number;
      box_count: number;
    }>;
  }, token: string) {
    return this.axiosInstance.post('/api/calculator', payload, {
      headers: { Authorization: `Bearer ${token}` }
    });
  }

  // 16. API TO GET TRACKING DETAILS
  async getTrackingDetails(tracking_type: 'lrn' | 'awb', tracking_id: string, token: string) {
    return this.axiosInstance.get('/api/tracking', {
      params: { tracking_type, tracking_id },
      headers: { Authorization: `Bearer ${token}` }
    });
  }

  // 17. LIST OF SCAN STATUS IN TRACKING API (Static Data)
  getScanStatusList() {
    return [
      'Pickup Scheduled', 'Not Picked', 'Cancelled', 'In-Transit',
      'Out for Delivery', 'Delivered', 'Undelivered',
      'RTO In Transit', 'RTO Delivered', 'Lost'
    ];
  }
}