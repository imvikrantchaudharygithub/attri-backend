import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const BIGSHIP_BASE_URL = process.env.BIGSHIP_BASE_URL;
const BIGSHIP_API_KEY = process.env.BIGSHIP_API_KEY;

const apiClient = axios.create({
    baseURL: BIGSHIP_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BIGSHIP_API_KEY}`
    }
});

/**
 * API TO LOGIN / GENERATE TOKEN
 * @param credentials - Example:
 * {
 *   "username": "your_username",
 *   "password": "your_password"
 * }
 */
export const login = async (credentials: any) => {
    try {
        const response = await apiClient.post('/api/auth/generate-token', credentials);
        return response.data;
    } catch (error: any) {
        throw new Error(error.response?.data?.message || 'Error logging in');
    }
};

/**
 * API TO GET PAYMENT CATEGORY
 */
export const getPaymentCategory = async () => {
    try {
        const response = await apiClient.get('/api/payment/category');
        return response.data;
    } catch (error: any) {
        throw new Error(error.response?.data?.message || 'Error fetching payment category');
    }
};

/**
 * API TO GET COURIER LIST
 */
export const getCourierList = async (shipmentCategory: string) => {
    try {
        const response = await apiClient.get(`/api/courier/get/all?shipment_category=${shipmentCategory}`);
        return response.data;
    } catch (error: any) {
        throw new Error(error.response?.data?.message || 'Error fetching courier list');
    }
};

/**
 * API TO GET CURRENT WALLET BALANCE
 */
export const getWalletBalance = async () => {
    try {
        const response = await apiClient.get('/api/wallet/balance');
        return response.data;
    } catch (error: any) {
        throw new Error(error.response?.data?.message || 'Error fetching wallet balance');
    }
};

/**
 * API TO ADD WAREHOUSE
 * @param warehouseData - Example:
 * {
 *   "address_line1": "H-No 188, Near Green View Doon",
 *   "address_line2": "Malsi",
 *   "address_landmark": "Sinola",
 *   "address_pincode": 248009,
 *   "contact_number_primary": "9998887772"
 * }
 */
export const addWarehouse = async (warehouseData: any) => {
    try {
        const response = await apiClient.post('/api/warehouse/add', warehouseData);
        return response.data;
    } catch (error: any) {
        throw new Error(error.response?.data?.message || 'Error adding warehouse');
    }
};

/**
 * API TO ADD SINGLE ORDER
 * @param orderData - Example:
 * {
 *   "order_id": "12345",
 *   "customer_name": "John Doe",
 *   "customer_phone": "9876543210",
 *   "customer_address": "123 Main Street, Delhi",
 *   "customer_pincode": "110001",
 *   "product_name": "T-shirt",
 *   "product_price": 500,
 *   "product_weight": 1.5
 * }
 */
export const addSingleOrder = async (orderData: any) => {
    try {
        const response = await apiClient.post('/api/order/add', orderData);
        return response.data;
    } catch (error: any) {
        throw new Error(error.response?.data?.message || 'Error adding single order');
    }
};

/**
 * API TO MANIFEST SINGLE ORDER
 * @param manifestData - Example:
 * {
 *   "order_id": "12345"
 * }
 */
export const manifestSingleOrder = async (manifestData: any) => {
    try {
        const response = await apiClient.post('/api/order/manifest', manifestData);
        return response.data;
    } catch (error: any) {
        throw new Error(error.response?.data?.message || 'Error manifesting single order');
    }
};

/**
 * API TO GET TRACKING DETAILS
 * @param trackingNumber - Example:
 * {
 *   "tracking_number": "TRACK67890"
 * }
 */
export const getTrackingDetails = async (trackingNumber: string) => {
    try {
        const response = await apiClient.get(`/api/tracking/details/${trackingNumber}`);
        return response.data;
    } catch (error: any) {
        throw new Error(error.response?.data?.message || 'Error fetching tracking details');
    }
};
