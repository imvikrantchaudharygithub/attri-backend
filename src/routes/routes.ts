import express, { Request, Response, RequestHandler } from 'express';
import upload from "../middlewares/uploads";

import {loginWithOTP,verifyAndAddUser ,getUserById,getUserAncestors,getAllUsers,getUserByReferralCode, verifyLoginOtp, getUserByToken, deleteUser, setUserAsRecommended, removeUserFromRecommended, getRecommendedUsers} from '../controllers/userController';
import { createProductCategory,  getAllProductCategories,  updateProductCategory,  deleteProductCategory, getProductCategoryBySlug,} from '../controllers/productCategoryController';
import {  createProduct, getAllProducts, updateProduct, deleteProduct,buyProduct, getProductBySlug, searchProducts} from '../controllers/productController';
import {getPurchaseHistory} from '../controllers/purchaseHistoryController'
import{getHomedata} from '../controllers/homeController'
import { uploadBanner, getBanners, deleteBanner } from '../controllers/bannerController';
import multer from 'multer';
import { createTestimonial, getTestimonials, updateTestimonial, deleteTestimonial } from '../controllers/testimonialController';
import { createSection,  getSections,  getSectionById,  updateSection, deleteSection } from '../controllers/SectionController';
import {
  createAddress,
  getUserAddresses,
  getAddressById,
  updateAddress,
  deleteAddress,
  setDefaultAddress
} from '../controllers/addressController';
import { verifyToken } from '../middlewares/auth';
import { addToCart, getCart, deleteCartItem ,updateCartItem, addBulkCartItems, increaseCartItemQuantity, decreaseCartItemQuantity, emptyCart} from '../controllers/cartController';
// import { createRazorpayOrder,verifyPayment } from '../controllers/paymentController';
import { cancelOrder, createOrder,deleteOrder,getAllOrders,getOrderById,getUserOrders, getUserRecentOrders, markOrderDelivered, updateOrderStatusWithTracking} from '../controllers/orderController';
import { createRazorpayOrder, verifyPayment, distributeCommissionsManual, deductUserBalance } from '../controllers/paymentController';
// import { authenticate } from '../middlewares/authentication';
    import { addBankDetail, getBankDetails, updateBankDetail, deleteBankDetail, setDefaultAccount } from '../controllers/userBankController';
import { withdrawalController } from '../controllers/withdrawalController';
import { addWarehouse, getTrackingDetails, getShipmentDetails, manifestOrder, getCourierList } from '../controllers/deliveryController';
import { addPickupAddress, generateManifest, shiprocketWebhook, trackOrderByOrderId, getcheckServiceability, assignAWB, generateLabel, generatePickup, printManifest } from '../controllers/shiprocketController';
import { createCoupon, getCoupons, getCouponByCode, applyCoupon, updateCoupon, deleteCoupon } from '../controllers/couponController';
import { getTeamTree } from '../controllers/teamTreeController';

const router = express.Router();

// pages api 
router.get('/home-pagedata', getHomedata);


router.post('/send-otp', loginWithOTP);
//otp for login
router.post('/verify-login-otp', verifyLoginOtp);
//otp for signup
router.post('/verify-otp', verifyAndAddUser);

// router.post('/resetsend-otp', resetsendOtpController);
router.get('/user/profile', getUserByToken);

router.get('/get-user/:userId', getUserById);
router.get('/get-user-ancestor/:userId', getUserAncestors);
router.get('/all-users', getAllUsers);
router.get('/user/referral/:referralCode', getUserByReferralCode);
router.post('/delete-user', deleteUser);
router.get('/team-tree/:userId', getTeamTree);
// product category
const categoryUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
  }).fields([
    { name: 'image', maxCount: 1 },
    { name: 'banner', maxCount: 1 }
  ]);
router.post('/create-product-category',categoryUpload, createProductCategory); // Create a new category
router.get('/get-product-categories', getAllProductCategories); // Get all categories
router.get('/get-product-category/:slug', getProductCategoryBySlug); // Get a single category by ID
// router.put('/:id', updateProductCategory); // Update a category
router.post('/delete-product-category', deleteProductCategory); // Delete a category

// Product
// upload.single("image"), - for single image
const storage = multer.memoryStorage(); // Use memory storage for Cloudinary

 const uploadp = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
}).fields([
  { name: 'images', maxCount: 10 },       // For product images
  { name: 'gallery', maxCount: 5} ,
  { name: 'ingredients', maxCount: 5 },
]);

router.post('/create-product',uploadp, createProduct); // Create a new product
router.get('/get-products', getAllProducts); // Get all products
router.get('/get-product/:slug', getProductBySlug); // Get a single product by ID
router.put('/edit-product/:id', upload.fields([
  { name: 'images', maxCount: 10 },
  { name: 'gallery', maxCount: 10 },
  { name: 'ingredients', maxCount: 10 }
]),
updateProduct, updateProduct ); // Update a product
router.post('/delete-product', deleteProduct); // Delete a product

router.post('/buy-product', buyProduct); 

router.get("/purchase-history", getPurchaseHistory);

// Cast the controller to RequestHandler type
const searchProductsHandler: RequestHandler = searchProducts;

router.post("/search-products", searchProductsHandler);

// upload banner 
router.post("/upload-banner", upload.fields([{ name: "image", maxCount: 1 }, { name: "mob_image", maxCount: 1 }]), uploadBanner);
router.get("/banners", getBanners);
router.post("/delete-banner", deleteBanner);

// Testimonial routes
router.post('/create-testimonial', upload.fields([{ name: "profilePic", maxCount: 1 }]), createTestimonial);
router.get('/get-testimonials', getTestimonials);
router.put('/update-testimonials/:id', upload.single('profilePic'), updateTestimonial);
router.post('/delete-testimonials', deleteTestimonial);

// Section routes
router.post('/sections', upload.fields([{ name: 'gallery', maxCount: 10 }]), createSection);
router.get('/get-sections', getSections);
router.get('/sections/:id', getSectionById);
router.put('/sections/:id', upload.fields([{ name: 'gallery', maxCount: 10 }]), updateSection);
router.post('/delete-section', deleteSection);

// Address routes
router.post('/add-address', createAddress); // Create new address
router.get('/users/:userId/addresses', getUserAddresses); // Get all addresses for user
router.get('/addresses/:id', getAddressById); // Get single address
router.put('/addresses/:id', updateAddress); // Update address
router.post('/delete-address', deleteAddress); // Delete address
router.post('/addresses/:addressId/default',verifyToken, setDefaultAddress);

// cart routes
router.post('/add-item', verifyToken, addToCart);
router.get('/get-cart/:userId', verifyToken, getCart);
router.post('/remove-item', verifyToken, deleteCartItem);
router.post('/update-item', verifyToken, updateCartItem);
router.post('/add-bulk-items', verifyToken, addBulkCartItems);
// Cart quantity routes
router.post('/cart/increase-quantity', verifyToken, increaseCartItemQuantity);
router.post('/cart/decrease-quantity', verifyToken, decreaseCartItemQuantity);
router.post('/empty-cart', verifyToken, emptyCart);

// razorpay routes
router.post('/create-order', verifyToken, createOrder);
router.get('/get-order/:id', verifyToken, getOrderById);
router.get('/get-user-orders/:userId', verifyToken, getUserOrders);
router.get('/get-user-recent-orders/:userId', verifyToken, getUserRecentOrders);
router.get('/get-all-orders', getAllOrders);
router.post('/delete-order', deleteOrder);

// Order status management routes
router.post('/orders/mark-delivered', markOrderDelivered);
router.post('/orders/cancel', cancelOrder);
router.post('/orders/update-status', updateOrderStatusWithTracking);
// router.post('/update-order-status', verifyToken, updateOrderStatus);

router.post('/create-razorpay-order', verifyToken, createRazorpayOrder);
router.post('/verify-payment', verifyToken, verifyPayment);


// user bank routes
router.post('/add-bank-detail', verifyToken, addBankDetail);
router.get('/get-bank-details', verifyToken, getBankDetails);
router.put('/update-bank-detail/:id', verifyToken, updateBankDetail);
router.post('/delete-bank-detail', verifyToken, deleteBankDetail);
router.post('/set-default-bank/:id', verifyToken, setDefaultAccount);

// Withdrawal routes
router.post('/create-withdrawal', verifyToken, withdrawalController.createWithdrawal);
router.get('/withdrawals', withdrawalController.getWithdrawals);
router.get('/user-withdrawals', verifyToken, withdrawalController.getWithdrawalsByUser);
router.post('/withdrawals/approve', withdrawalController.acceptWithdrawal);
router.post('/withdrawals/reject', withdrawalController.rejectWithdrawal);

// Recommended user routes
router.post('/set-user-recommended', setUserAsRecommended);
router.post('/remove-user-recommended', removeUserFromRecommended);
router.get('/recommended-users', getRecommendedUsers);

// Add to your existing routes
router.post('/distribute-commissions-manual', distributeCommissionsManual);
router.post('/deduct-user-balance', deductUserBalance);

// delivery routes
router.post('/get-tracking-details', getTrackingDetails);
router.post('/get-shipment-details', getShipmentDetails);
router.post('/add-warehouse', addWarehouse);
router.post('/manifest-order', manifestOrder);
router.get('/get-courier-list', getCourierList);


// shiprocket routes
router.post('/add-pickup-address', addPickupAddress);
router.post('/generate-manifest', generateManifest);
router.post('/generate-label', generateLabel);
router.post('/ordertrack-webhook', shiprocketWebhook);
router.post('/track-order-by-order-id', trackOrderByOrderId);
router.post('/check-serviceability', getcheckServiceability);
router.post('/assign-awb', assignAWB);
router.post('/generate-pickup', generatePickup);
router.post('/print-manifest', printManifest);

// Coupon routes
// Admin coupon management routes
router.post('/admin/create-coupon', createCoupon); // Create a new coupon
router.get('/admin/get-coupons', getCoupons); // Get all coupons
router.put('/admin/update-coupon/:id', updateCoupon); // Update a coupon
router.post('/admin/delete-coupon', deleteCoupon); // Delete a coupon

// Client-facing coupon routes
router.get('/coupon/:code', getCouponByCode); // Get coupon by code (public)
router.post('/apply-coupon', verifyToken, applyCoupon); // Apply coupon to cart

export default router;