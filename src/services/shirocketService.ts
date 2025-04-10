import axios, { AxiosInstance } from 'axios';

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
  length?: number;
  breadth?: number;
  height?: number;
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
      baseURL: 'https://apiv2.shiprocket.in/v1/external/'
    });

    this.apiClient.interceptors.request.use(async (config) => {
      if (!this.token || this.isTokenExpired()) {
        await this.login();
      }
      config.headers.Authorization = `Bearer ${this.token}`;
      return config;
    });
  }

  private isTokenExpired(): boolean {
    return this.tokenExpiry ? new Date() > this.tokenExpiry : true;
  }

  async login(): Promise<void> {
    const { data } = await this.authClient.post<ShiprocketAuthResponse>('/auth/login', {
      email: process.env.SHIPROCKET_EMAIL || 'vikrantchaudhary1703@gmail.com',
      password: process.env.SHIPROCKET_PASSWORD || 'imJoker@1703'
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

  async generateManifest(payload: GenerateManifestPayload) {
    try {
      return await this.apiClient.post('/manifests/generate', {
        format: 'pdf',
        ...payload
      });
     
    } catch (error) {
      this.handleError(error, 'generateManifest');
    }
  }
  // Create new order
  async createOrder(payload: ShiprocketOrderPayload) {
    try {
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
  async checkServiceability(payload: ServiceabilityPayload) {
    try {
      const response = await this.apiClient.post('/courier/serviceability', {
        ...payload,
        cod: payload.cod || 0
      });
      return response.data;
    } catch (error) {
      this.handleError(error, 'checkServiceability');
    }
  }

  // Generate shipping label
  async generateLabel(payload: GenerateLabelPayload) {
    try {
      const response = await this.apiClient.post('/courier/generate/label', {
        format: 'pdf',
        ...payload
      });
      return response.data;
    } catch (error) {
      this.handleError(error, 'generateLabel');
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
      const response = await this.apiClient.get(`/courier/track/${shipmentId}`);
      return response.data;
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

  private handleError(error: any, context: string): never {
    const errorMessage = error.response?.data?.message || error.message;
    const errorDetails = error.response?.data?.errors || '';
    throw new Error(`Shiprocket ${context} failed: ${errorMessage} ${errorDetails}`);
  }
}

export const shiprocketService = new ShiprocketService();
