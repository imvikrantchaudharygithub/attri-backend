import { Request, Response } from 'express';
import Product from '../models/product.model';
import ProductCategory from '../models/productCategory.model';
import {distributeCommissions} from '../services/priceDistribution'
import User from '../models/user.model';
import { Purchase } from '../models/purchaseHistory.model';
import cloudinary from "../config/cloudinary";
import mongoose from 'mongoose';


// Helper function to calculate the price after discount
const calculatePrice = (mrp: number, discount: number): number => {
  return discount > 0 ? mrp - (mrp * discount) / 100 : mrp;
};

const normalizeDistributionAmount = (value: any): number | null => {
  if (value === undefined || value === null || value === '') {
    return 0;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return null;
  }

  return numericValue;
};

type UploadFiles = {
    images?: Express.Multer.File[];
    gallery?: Express.Multer.File[];
  };


export const createProduct = async (req: Request, res: Response): Promise<void> => {
    const { name,rating, description, mrp, discount, stock, category, status, gallery, faqs, ingredients, info, tags, distributionamount } = req.body;

    // Parse gallery, faqs, and tags if they're strings
    const parsedGallery = typeof gallery === "string" ? JSON.parse(gallery) : [];
    const parsedFaqs = typeof faqs === "string" ? JSON.parse(faqs) : faqs || [];
    const parsedIngredients = typeof ingredients === "string" ? JSON.parse(ingredients) : ingredients || [];
    const parsedInfo = typeof info === "string" ? JSON.parse(info) : info || [];
    const parsedTags = typeof tags === "string" ? JSON.parse(tags) : tags || [];

    // Validate FAQs structure
    if (parsedFaqs && !Array.isArray(parsedFaqs)) {
        res.status(400).json({ message: "FAQs must be an array of {question, answer} objects" });
        return;
    }

    const normalizedDistributionAmount = normalizeDistributionAmount(distributionamount);
    if (normalizedDistributionAmount === null) {
      res.status(400).json({ message: "distributionamount must be a valid non-negative number" });
      return;
    }

    console.log("🟢 Received Request:", req.body);
    console.log("🟢 Uploaded Files:", req.files);

    // Validate uploaded files
    if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
        res.status(400).json({ message: "At least one product image is required" });
        return;
    }

    try {
        // Validate category exists
        if (!category) {
            res.status(400).json({ message: "Category is required" });
            return;
        }

        // Check if category exists in database
        const categoryExists = await ProductCategory.findById(category);
        if (!categoryExists) {
            res.status(404).json({ message: "Category not found" });
            return;
        }

        // 1. Type assertion for files
        const files = req.files as {
            images?: Express.Multer.File[];
            gallery?: Express.Multer.File[];
            ingredients?: Express.Multer.File[];
        };
  
        // 2. Validate required files
        if (!files?.images || files.images.length === 0) {
            res.status(400).json({ message: "At least one product image is required" });
            return;
        }
  
        // 3. Upload images to Cloudinary using buffer
        const uploadToCloudinary = async (file: Express.Multer.File, folder: string) => {
          return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              { folder, resource_type: 'auto' },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            );
            
            uploadStream.end(file.buffer);
          });
        };
  
        // Process main images
        const images = await Promise.all(
          files.images.map(async (file) => {
            const result: any = await uploadToCloudinary(file, 'products');
            return result.secure_url;
          })
        );
  
        // Process gallery images
        let galleryImages: any[] = [];
        if (files.gallery && files.gallery.length > 0) {
          const galleryTitles = Array.isArray(req.body.galleryTitles) ? req.body.galleryTitles : [];
          const galleryDescriptions = Array.isArray(req.body.galleryDescriptions) ? req.body.galleryDescriptions : [];
          
          galleryImages = await Promise.all(
            files.gallery.map(async (file, index) => {
              const result: any = await uploadToCloudinary(file, 'gallery');
              return {
                image: result.secure_url,
                title: galleryTitles[index] || 'Untitled',
                description: galleryDescriptions[index] || 'No description'
              };
            })
          );
        }

        // Process ingredients images
        let ingredientsData: any[] = [];
        if (files.ingredients && files.ingredients.length > 0) {
          const ingredientTitles = Array.isArray(req.body.ingredientTitles) ? req.body.ingredientTitles : [];
          const ingredientDescriptions = Array.isArray(req.body.ingredientDescriptions) ? req.body.ingredientDescriptions : [];
          
          ingredientsData = await Promise.all(
            files.ingredients.map(async (file, index) => {
              const result: any = await uploadToCloudinary(file, 'ingredients');
              return {
                image: result.secure_url,
                title: ingredientTitles[index] || 'Untitled',
                description: ingredientDescriptions[index] || 'No description'
              };
            })
          );
        }
      
        // Process FAQs
        const validatedFaqs = parsedFaqs.map((faq: any) => ({
            question: faq.question || 'No question provided',
            answer: faq.answer || 'No answer provided'
        }));
        const validatedInfo = parsedInfo.map((info: any) => ({
            title: info.title || 'No title provided',
            description: info.description || 'No description provided'
        }));



        // Save to MongoDB
        const newProduct = new Product({
            name,
            description,
            mrp,
            price: mrp - (mrp * (discount || 0)) / 100,
            discount,
            stock,
            category: new mongoose.Types.ObjectId(category),
            images,
            rating,
            gallery: galleryImages,
            ingredients: ingredientsData,
            status,
            faqs: validatedFaqs,
            info: validatedInfo,
            tags: parsedTags,
            distributionamount: normalizedDistributionAmount
        });

        const savedProduct = await newProduct.save();

        // Update the category with this product
        await ProductCategory.findByIdAndUpdate(
          category,
          { $push: { products: savedProduct._id } },
          { new: true }
      );

        // Send success response
        res.status(201).json({ message: "Product created successfully", product: newProduct });
    } catch (error) {
        console.error("❌ Error creating product:", error);
        res.status(500).json({ 
            message: "Internal server error", 
            error: error instanceof Error ? error.message : String(error) 
        });
    }
};

// Get all products
export const getAllProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const products = await Product.find().populate('category', 'name'); // Populate category name

    res.status(200).json({ products });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ message: 'Internal server error', error });
  }
};

// Get a single product by ID
export const getProductBySlug = async (req: Request, res: Response): Promise<void> => {
  const { slug } = req.params;

  try {
    const product = await Product.findOne({slug}).populate('category', 'name');

    if (!product) {
      res.status(404).json({ message: 'Product not found' });
      return;
    }

    res.status(200).json({ product });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ message: 'Internal server error', error });
  }
};

// Update a product
// export const updateProduct = async (req: Request, res: Response): Promise<void> => {
//   const { id } = req.params;
//   const { name, description, mrp, discount, stock, category, image, status } = req.body;

//   try {
//     // Check if the category exists
//     if (category) {
//       const categoryExists = await ProductCategory.findById(category);
//       if (!categoryExists) {
//         res.status(404).json({ message: 'Category not found' });
//         return;
//       }
//     }

//     // Calculate the price after discount
//     const price = discount ? calculatePrice(mrp, discount) : undefined;

//     const updatedProduct = await Product.findByIdAndUpdate(
//       id,
//       { name, description, mrp, price, discount, stock, category, image, status },
//       { new: true, runValidators: true }
//     );

//     if (!updatedProduct) {
//       res.status(404).json({ message: 'Product not found' });
//       return;
//     }

//     res.status(200).json({ message: 'Product updated successfully', product: updatedProduct });
//   } catch (error) {
//     console.error('Error updating product:', error);
//     res.status(500).json({ message: 'Internal server error', error });
//   }
// };

// Delete a product
export const deleteProduct = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.body;

  try {
    const deletedProduct = await Product.findByIdAndDelete(id);

    if (!deletedProduct) {
      res.status(404).json({ message: 'Product not found' });
      return;
    }

    res.status(200).json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ message: 'Internal server error', error });
  }
};


export const buyProduct = async (req: Request, res: Response): Promise<void> => {
    const { productId, quantity , userId } = req.body;
  
    if (!productId || !quantity || quantity <= 0) {
      res.status(400).json({ message: 'Product ID and a valid quantity are required' });
      return;
    }
  
    try {
      // Find the product by ID
      const product:any = await Product.findById(productId);
      const user = await User.findById(userId).populate({
        path: "referral_by",
        populate: {
          path: "referral_by",
          populate: {
            path: "referral_by",
            populate: {
              path: "referral_by",
              populate: {
                path: "referral_by",
              },
            },
          },
        },
      });
  
      if (!product) {
        res.status(404).json({ message: 'Product not found' });
        return;
      }
      if (!user) {
          res.status(404).json({ message: "User not found" });
        return 
      }
  
      // Check if the product is active
      if (product.status !== 'active') {
        res.status(400).json({ message: 'This product is not available for purchase' });
        return;
      }
  
      // Check if there is enough stock
      if (product.stock < quantity) {
        res.status(400).json({ message: `Insufficient stock. Only ${product.stock} items available.` });
        return;
      }
  
      // Calculate the total price
      const totalPrice = product.price * quantity;
  
      // Deduct the purchased quantity from stock
      product.stock -= quantity;
      await product.save();
      await distributeCommissions(user.toObject(), product.price);

    // Add the purchase to the user's history
    const purchase = new Purchase({
        user: userId,
        products: productId,
      });
  
      await purchase.save();

      // Respond with success
      res.status(200).json({
        message: 'Product purchased successfully',
        product: {
          id: product._id,
          name: product.name,
          price: product.price,
          quantity,
          totalPrice,
          remainingStock: product.stock,
        },
      });
    } catch (error) {
      console.error('Error purchasing product:', error);
      res.status(500).json({ message: 'Internal server error', error });
    }
  };

export const searchProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { searchTerm } = req.body;
    
    if (!searchTerm) {
      res.status(400).json({ message: 'Search term is required' });
      return;
    }

    const searchPattern = new RegExp(searchTerm, 'i');
    
    // First find categories that match the search term
    const categories = await ProductCategory.find({ name: searchPattern }).select('_id');
    const categoryIds = categories.map(cat => cat._id);
    
    // Then search products with those categories or matching name/description
    const products = await Product.find({
      $or: [
        { name: searchPattern },
        { description: searchPattern },
        { category: { $in: categoryIds } }
      ]
    })
    .populate('category', 'name')
    res.status(200).json({
      success: true,
      count: products.length,
      data: products
    });
  } catch (error: any) {
    console.error("Search error:", error);
    res.status(500).json({
      message: 'Error searching products',
      error: error.message
    });
  }
};

export const updateProduct = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { 
      name, rating, description, mrp, discount, stock, category, 
      status, gallery, faqs, ingredients, info, tags, images, distributionamount
  } = req.body;

  // Parse complex fields
  const parsedImages = typeof images === "string" ? JSON.parse(images) : images || [];
  const parsedGallery = typeof gallery === "string" ? JSON.parse(gallery) : gallery || [];
  const parsedFaqs = typeof faqs === "string" ? JSON.parse(faqs) : faqs || [];
  const parsedIngredients = typeof ingredients === "string" ? JSON.parse(ingredients) : ingredients || [];
  const parsedInfo = typeof info === "string" ? JSON.parse(info) : info || [];
  const parsedTags = typeof tags === "string" ? JSON.parse(tags) : tags || [];

  try {
      const product:any = await Product.findById(id);
      if (!product) {
          res.status(404).json({ message: "Product not found" });
          return;
      }

      // Validate category if provided
      if (category && category !== product.category.toString()) {
          const categoryExists = await ProductCategory.findById(category);
          if (!categoryExists) {
              res.status(404).json({ message: "Category not found" });
              return;
          }
      }

      // Type assertion for files
      const files = req.files as {
          images?: Express.Multer.File[];
          gallery?: Express.Multer.File[];
          ingredients?: Express.Multer.File[];
      };

      // Process main images
      let updatedImages = [...parsedImages];
      
      // 1. Handle base64 images in the parsedImages array
      const base64Images = parsedImages.filter((img: string) => 
          img.startsWith('data:image/')
      );
      
      // Upload base64 images to Cloudinary
      if (base64Images.length > 0) {
          const uploadedBase64Images = await Promise.all(
              base64Images.map(async (base64: string) => {
                  const result = await uploadBase64ToCloudinary(base64, 'products');
                  return result.secure_url;
              })
          );
          
          // Replace base64 with Cloudinary URLs
          updatedImages = [
              ...parsedImages.filter((img: string) => !img.startsWith('data:image/')),
              ...uploadedBase64Images
          ];
      }
      
      // 2. Handle uploaded files
      if (files?.images && files.images.length > 0) {
          const newImages = await Promise.all(
              files.images.map(async (file) => {
                  const result: any = await uploadToCloudinary(file, 'products');
                  return result.secure_url;
              })
          );
          
          // Append new images
          updatedImages = [...updatedImages, ...newImages];
      }
      
      product.images = updatedImages;

      // Process gallery images
      let updatedGallery = [...parsedGallery];
      if (files?.gallery && files.gallery.length > 0) {
          const galleryTitles = Array.isArray(req.body.galleryTitles) 
              ? req.body.galleryTitles : [];
          const galleryDescriptions = Array.isArray(req.body.galleryDescriptions) 
              ? req.body.galleryDescriptions : [];
          
          const newGalleryItems = await Promise.all(
              files.gallery.map(async (file, index) => {
                  const result: any = await uploadToCloudinary(file, 'gallery');
                  return {
                      image: result.secure_url,
                      title: galleryTitles[index] || 'Untitled',
                      description: galleryDescriptions[index] || 'No description'
                  };
              })
          );
          
          updatedGallery = [...updatedGallery, ...newGalleryItems];
      }

      // Process ingredients images
      let updatedIngredients = [...parsedIngredients];
      if (files?.ingredients && files.ingredients.length > 0) {
          const ingredientTitles = Array.isArray(req.body.ingredientTitles) 
              ? req.body.ingredientTitles : [];
          const ingredientDescriptions = Array.isArray(req.body.ingredientDescriptions) 
              ? req.body.ingredientDescriptions : [];
          
          const newIngredients = await Promise.all(
              files.ingredients.map(async (file, index) => {
                  const result: any = await uploadToCloudinary(file, 'ingredients');
                  return {
                      image: result.secure_url,
                      title: ingredientTitles[index] || 'Untitled',
                      description: ingredientDescriptions[index] || 'No description'
                  };
              })
          );
          
          updatedIngredients = [...updatedIngredients, ...newIngredients];
      }

      // Update product fields
      if (name) product.name = name;
      if (rating) product.rating = rating;
      if (description) product.description = description;
      if (mrp) product.mrp = mrp;
      if (discount !== undefined) product.discount = discount;
      product.price = product.mrp - (product.mrp * (product.discount || 0)) / 100;
      if (stock !== undefined) product.stock = stock;
      if (status) product.status = status;
      if (distributionamount !== undefined) {
        const normalizedDistributionAmount = normalizeDistributionAmount(distributionamount);
        if (normalizedDistributionAmount === null) {
          res.status(400).json({ message: "distributionamount must be a valid non-negative number" });
          return;
        }
        product.distributionamount = normalizedDistributionAmount;
      }
      
      // Handle category update
      if (category && category !== product.category.toString()) {
          await ProductCategory.findByIdAndUpdate(
              product.category,
              { $pull: { products: product._id } }
          );
          
          await ProductCategory.findByIdAndUpdate(
              category,
              { $push: { products: product._id } }
          );
          
          product.category = category;
      }
      
      // Update arrays
      product.gallery = updatedGallery;
      product.ingredients = updatedIngredients;
      product.faqs = parsedFaqs.map((faq: any) => ({
          question: faq.question || 'No question',
          answer: faq.answer || 'No answer'
      }));
      product.info = parsedInfo.map((info: any) => ({
          title: info.title || 'No title',
          description: info.description || 'No description'
      }));
      product.tags = parsedTags;

      // Save updated product
      const updatedProduct = await product.save();

      res.status(200).json({ 
          message: "Product updated successfully", 
          product: updatedProduct 
      });
      
  } catch (error) {
      console.error("❌ Error updating product:", error);
      res.status(500).json({ 
          message: "Internal server error", 
          error: error instanceof Error ? error.message : String(error) 
      });
  }
};

// Cloudinary upload helper for files
const uploadToCloudinary = (file: Express.Multer.File, folder: string): Promise<any> => {
  return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
          { folder, resource_type: 'auto' },
          (error, result) => {
              if (error) reject(error);
              else resolve(result);
          }
      );
      uploadStream.end(file.buffer);
  });
};

// New helper for base64 uploads
const uploadBase64ToCloudinary = (base64: string, folder: string): Promise<any> => {
  return new Promise((resolve, reject) => {
      cloudinary.uploader.upload(
          base64,
          { folder, resource_type: 'image' },
          (error, result) => {
              if (error) reject(error);
              else resolve(result);
          }
      );
  });
};
