import axios, { AxiosInstance } from 'axios';
import Order from '../models/order.model';

type ShiprocketAuthResponse = {
  token: string;
  expires_in: number;
};

type ShiprocketOrderItem = {
  name: string;
  sku: string;
  units: number;
  selling_price: number;
  discount?: number;
  tax?: number;
  hsn?: string;
};

type ShiprocketOrderPayload = {
  order_id: string;
  order_date: string;
  pickup_location: string;
  billing_customer_name: string;
  billing_last_name: string;
  billing_address: string;
  billing_city: string;
  billing_pincode: string;
  billing_state: string;
  billing_country: string;
  billing_email: string;
  billing_phone: string;
  shipping_is_billing: boolean;
  order_items: ShiprocketOrderItem[];
  payment_method: 'Prepaid' | 'COD';
  sub_total: number;
  weight: number;
  length?: number;
  breadth?: number;
  height?: number;
};

type ServiceabilityPayload = {
  pickup_postcode: string;
  delivery_postcode: string;
  weight: number;
  cod?: 0 | 1;
  order_id?: string;
};

type ServiceabilityResponse = {
  status: number;
  data: {
    available_courier_companies: Array<{
      courier_company_id: number;
      courier_name: string;
      estd_delivery_days: string;
      rate: number;
    }>;
    is_recommended: boolean;
    recommended_by: string | null;
  };
};

type CreatePickupPayload = {
  shipment_id: number[];
  pickup_date: string;
  pickup_time: { from: string; to: string };
};

type GenerateLabelPayload = {
  shipment_ids: number[];
  format?: 'pdf' | 'zpl' | 'epson';
};

type LabelGenerationResponse = {
  status: number;
  label_url: string;
  shipment_id: string;
};

type ShiprocketPickupAddressPayload = {
    address: string;
    pincode: string;
    city: string;
    state: string;
    country: string;
    contact_person?: string;
    phone?: string;
    email?: string;
    vendor_name?: string;
    address_type?: 'pickup' | 'return';
    latitude?: number;
    longitude?: number;
  };
  type GenerateManifestPayload = {
    shipment_ids: number[];
    format?: 'pdf' | 'csv' | 'xls';
  };

type AssignAwbPayload = {
  shipment_ids: number[];
  courier_id: number;
  is_manual?: boolean;
};

type GeneratePickupPayload = {
  shipment_id: number[];
  pickup_date: string;
  pickup_time: {
    from: string;
    to: string;
  };
};

type GeneratePickupResponse = {
  status: number;
  pickup_id: number;
  message: string;
  scheduled_date: string;
};

type GenerateManifestResponse = {
  status: number;
  manifest_url: string;
  manifest_date: string;
};

class ShiprocketService {
  private authClient: AxiosInstance;
  private apiClient: AxiosInstance;
  private token: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor() {
    this.authClient = axios.create({
      baseURL: 'https://apiv2.shiprocket.in/v1/external/'
    });

    this.apiClient = axios.create({
      baseURL: 'https://apiv2.shiprocket.in/v1/external',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SHIPROCKET_TOKEN}`
      }
    });

    this.apiClient.interceptors.request.use(async (config) => {
      if (!this.token || this.isTokenExpired()) {
        await this.login();
      }
      config.headers.Authorization = `Bearer ${this.token}`;
      return config;
    });

    // Add response interceptor for error handling
    this.apiClient.interceptors.response.use(
      response => response,
      error => {
        if (error.response?.status === 401) {
          // Handle token expiration
          return this.refreshToken().then(() => {
            const config = error.config;
            config.headers.Authorization = `Bearer ${process.env.SHIPROCKET_TOKEN}`;
            return this.apiClient(config);
          });
        }
        return Promise.reject(error);
      }
    );
  }

  private isTokenExpired(): boolean {
    return this.tokenExpiry ? new Date() > this.tokenExpiry : true;
  }

  async login(): Promise<void> {
    const { data } = await this.authClient.post<ShiprocketAuthResponse>('/auth/login', {
      email: process.env.SHIPROCKET_EMAIL,
      password: process.env.SHIPROCKET_PASSWORD
    });
    this.token = data.token;
    this.tokenExpiry = new Date(Date.now() + data.expires_in * 10000);
  }
  async addPickupAddress(payload: ShiprocketPickupAddressPayload) {
    try {
      const response = await this.apiClient.post('/settings/company/addpickup', {
        address_type: 'pickup',
        ...payload
      });
      return response.data;
    } catch (error) {
      this.handleError(error, 'addPickupAddress');
    }
  }

  async generateManifest(payload: { shipment_id: number[] }) {
    try {
      // Check existing manifests first
      const ordersWithManifest = await Order.find({ 
        tracking_number: { $in: payload.shipment_id.map(String) },
        manifest_url: { $exists: true, $ne: null }
      });

      if (ordersWithManifest.length > 0) {
        const existingIds = ordersWithManifest.map(o => o.tracking_number);
        throw new Error(`Manifest already exists for shipments: ${existingIds.join(', ')}`);
      }

      const response = await this.apiClient.post('/manifests/generate', {
        shipment_id: payload.shipment_id
      });
      console.log(response.data);
      return response.data;
      
    } catch (error: any) {
      let errorMessage = 'Failed to generate manifest';
      
      // Handle specific Shiprocket error
      if (error.response?.data?.message.includes('already generated')) {
        errorMessage = `Manifest already exists for these shipments: ${payload.shipment_id.join(', ')}`;
      }
      
      throw new Error(errorMessage);
    }
  }
  // Create new order
  async createOrder(payload: ShiprocketOrderPayload) {
    try {
      // Validate unique SKUs
      const skus = payload.order_items.map(item => item.sku);
      if (new Set(skus).size !== skus.length) {
        throw new Error('Duplicate SKUs found in order items. All SKUs must be unique.');
      }

      const fullPayload = {
        ...payload,
        shipping_is_billing: payload.shipping_is_billing ?? true,
        payment_method: payload.payment_method || 'Prepaid'
      };
      return await this.apiClient.post('/orders/create/adhoc', fullPayload);
      
    } catch (error) {
      this.handleError(error, 'createOrder');
    }
  }

  // Check shipping rates
  async checkServiceability(payload: ServiceabilityPayload): Promise<any> {
    try {
      // Convert weight to Shiprocket's required format (grams)
      const formattedPayload = {
        ...payload,
        weight: Math.round(payload.weight * 1000), // Convert kg to grams
        pickup_postcode: payload.pickup_postcode.toString(),
        delivery_postcode: payload.delivery_postcode.toString()
      };
      console.log( "formattedPayload", formattedPayload);

      const response = await this.apiClient.get('/courier/serviceability', {
        params: {
          cod: 0,  // default to prepaid
          ...formattedPayload,
          order_id: payload.order_id // Maintain snake_case naming
        }
      });

      return response;
    } catch (error) {
      this.handleError(error, 'checkServiceability');
    }
  }

  // Generate shipping label
  async generateLabel(payload: GenerateLabelPayload): Promise<any> {
    try {
      if (!payload.shipment_ids?.length) {
        throw new Error('At least one shipment ID is required');
      }

      const formattedPayload: any = {
        format: 'pdf', // default format
        shipment_id: payload.shipment_ids.join(','), // convert array to comma-separated string
        ...payload
      };

      const response = await this.apiClient.post('/courier/generate/label', formattedPayload);
      console.log(response.data);
      return response.data;
    } catch (error) {
      this.handleError(error, 'generateLabel', {
        payload
      });
    }
  }

  // Schedule pickup
  async schedulePickup(payload: CreatePickupPayload) {
    try {
      const response = await this.apiClient.post('/pickup', payload);
      return response.data;
    } catch (error) {
      this.handleError(error, 'schedulePickup');
    }
  }

  // Track shipment
  async trackShipment(shipmentId: number) {
    try {
      return await this.apiClient.get(`/courier/track/awb/${shipmentId}`);
     
    } catch (error) {
      this.handleError(error, 'trackShipment');
    }
  }

  // Cancel order
  async cancelOrder(shipmentId: number) {
    try {
      const response = await this.apiClient.post('/orders/cancel', {
        ids: [shipmentId]
      });
      return response.data;
    } catch (error) {
      this.handleError(error, 'cancelOrder');
    }
  }

  async trackOrderByOrderId(orderId: string, channelId: string) {
    try {
      return await this.apiClient.get('/courier/track', {
        params: {
          order_id: orderId,
          channel_id: channelId
        }
      });
    } catch (error) {
      this.handleError(error, 'trackOrderByOrderId');
    }
  }

  async assignAWB(payload: AssignAwbPayload) {
    try {
      // Validate required fields
      if (!payload.shipment_ids?.length || !payload.courier_id) {
        throw new Error('Missing required fields: shipment_ids or courier_id');
      }

      // Convert to Shiprocket's expected format
      const formattedPayload = {
        shipment_id: payload.shipment_ids.join(','), // Convert array to comma-separated string
        courier_id: payload.courier_id, // Keep as number
        is_manual: payload.is_manual ? 1 : 0 // Convert boolean to 1/0
      };

      // Validate payload
      if (formattedPayload.courier_id <= 0) {
        throw new Error('Invalid courier_id');
      }

      const response = await this.apiClient.post('/courier/assign/awb', formattedPayload);
      return response;
    } catch (error) {
      this.handleError(error, 'assignAWB');
    }
  }

  async generatePickup(payload: GeneratePickupPayload): Promise<any> {
    try {
      // Validate required fields
      if (!payload.shipment_id?.length) {
        throw new Error('At least one shipment ID is required');
      }
      if (!payload.pickup_date || !payload.pickup_time?.from || !payload.pickup_time?.to) {
        throw new Error('Pickup date and time window are required');
      }

      const response = await this.apiClient.post('/courier/generate/pickup', {
        ...payload,
        pickup_date: new Date(payload.pickup_date).toISOString().split('T')[0] // Format as YYYY-MM-DD
      });
      return response.data;

    //   return {
    //     status: response.status,
    //     pickup_id: response.data.pickup_id,
    //     message: response.data.message,
    //     scheduled_date: response.data.scheduled_date
    //   };
    } catch (error) {
      this.handleError(error, 'generatePickup', {
        payload,
        formattedDate: new Date(payload.pickup_date).toISOString().split('T')[0]
      });
    }
  }
  async checkShipmentStatus(shipmentIds: number[]) {
    try {
      const response = await this.apiClient.get('/shipments', {
        params: {
          shipment_ids: shipmentIds.join(',')
        }
      });

      // Handle different response formats
      const responseData = response.data?.data || response.data;
      
      if (!responseData || !Array.isArray(responseData)) {
        throw new Error('Invalid response format from Shiprocket');
      }

      const validStatuses = ['processing', 'ready_to_ship', 'confirmed'];
      
      return {
        valid: responseData.every((s: any) => 
          validStatuses.includes(s.status?.toLowerCase())
        ),
        invalid: responseData
          .filter((s: any) => !validStatuses.includes(s.status?.toLowerCase()))
          .map((s: any) => ({
            shipment_id: s.shipment_id || s.id,
            status: s.status,
            issues: s.issues || []
          }))
      };
    } catch (error: any) {
      console.error('Shipment Status Check Error:', {
        error: error.response?.data || error.message,
        endpoint: '/shipments',
        shipmentIds
      });
      
      throw new Error(`Status check failed: ${error.response?.data?.message || error.message}`);
    }
  }

  async printManifest(payload: { shipment_ids: number[]; format?: 'pdf' | 'csv' }) {
    try {
      const response = await this.apiClient.post('/manifests/print', {
        shipment_ids: payload.shipment_ids,
        format: payload.format || 'pdf'
      });

      return response.data;
      
    } catch (error: any) {
      let errorMessage = 'Failed to print manifest';
      
      if (error.response?.data?.message?.includes('No manifest found')) {
        errorMessage = `No manifest exists for shipments: ${payload.shipment_ids.join(', ')}`;
      }
      
      throw new Error(errorMessage);
    }
  }

  private handleError(error: any, context: string, additionalInfo?: any): never {
    // Handle PHP errors from Shiprocket API
    const rawError = error.response?.data;
    const errorMessage = typeof rawError === 'object' 
      ? rawError?.message || error.message
      : rawError || error.message;

    const errorDetails = typeof rawError === 'object'
      ? rawError?.errors || ''
      : `Raw API response: ${rawError}`;

    throw new Error(`Shiprocket ${context} failed: ${errorMessage} ${errorDetails}`);
  }

  private async refreshToken() {
    try {
      const response = await axios.post('https://apiv2.shiprocket.in/v1/external/auth/login', {
        email: process.env.SHIPROCKET_EMAIL,
        password: process.env.SHIPROCKET_PASSWORD
      });

      if (response.data?.token) {
        process.env.SHIPROCKET_TOKEN = response.data.token;
        return response.data.token;
      }
      throw new Error('Failed to refresh token');
    } catch (error) {
      console.error('Token Refresh Error:', error);
      throw new Error('Authentication failed');
    }
  }

  private parseShipmentResponse(response: any) {
    if (Array.isArray(response.data)) {
      return response.data;
    }
    
    if (response.data?.shipments) {
      return response.data.shipments;
    }
    
    if (response.data?.data) {
      return response.data.data;
    }
    
    return [];
  }
}

export const shiprocketService = new ShiprocketService();
