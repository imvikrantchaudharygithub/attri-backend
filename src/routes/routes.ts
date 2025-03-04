import express, { Request, Response } from 'express';
import upload from "../middlewares/uploads";

import {loginWithOTP,verifyAndAddUser ,getUserById,getUserAncestors,getAllUsers,getUserByReferralCode} from '../controllers/userController';
import { createProductCategory,  getAllProductCategories,  updateProductCategory,  deleteProductCategory, getProductCategoryBySlug,} from '../controllers/productCategoryController';
import {  createProduct, getAllProducts, updateProduct, deleteProduct,buyProduct, getProductBySlug} from '../controllers/productController';
import {getPurchaseHistory} from '../controllers/purchaseHistoryController'
import{getHomedata} from '../controllers/homeController'
import { uploadBanner, getBanners, deleteBanner } from '../controllers/bannerController';
import multer from 'multer';
import { createTestimonial, getTestimonials, updateTestimonial, deleteTestimonial } from '../controllers/testimonialController';
import { createSection,  getSections,  getSectionById,  updateSection, deleteSection } from '../controllers/SectionController';

const router = express.Router();

// pages api 
router.get('/home-pagedata', getHomedata);


router.post('/send-otp', loginWithOTP);
// router.post('/resetsend-otp', resetsendOtpController);

router.post('/verify-otp', verifyAndAddUser);
router.get('/get-user/:userId', getUserById);
router.get('/get-user-ancestor/:userId', getUserAncestors);
router.get('/`all-users`', getAllUsers);
router.get('/user/referral/:referralCode', getUserByReferralCode);

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
// router.put('/:id', updateProduct); // Update a product
router.post('/delete-product', deleteProduct); // Delete a product

router.post('/buy-product', buyProduct); 

router.get("/purchase-history", getPurchaseHistory);


// upload banner 
router.post("/upload-banner", upload.fields([{ name: "image", maxCount: 1 }, { name: "mob_image", maxCount: 1 }]), uploadBanner);
router.get("/banners", getBanners);
router.post("/delete-banner", deleteBanner);

// Testimonial routes
router.post('/testimonials', upload.fields([{ name: "profilePic", maxCount: 1 }]), createTestimonial);
router.get('/testimonials', getTestimonials);
router.put('/testimonials/:id', upload.single('profilePic'), updateTestimonial);
router.delete('/testimonials/:id', deleteTestimonial);

// Section routes
router.post('/sections', upload.fields([{ name: 'gallery', maxCount: 10 }]), createSection);
router.get('/get-sections', getSections);
router.get('/sections/:id', getSectionById);
router.put('/sections/:id', upload.fields([{ name: 'gallery', maxCount: 10 }]), updateSection);
router.post('/delete-section', deleteSection);

export default router;