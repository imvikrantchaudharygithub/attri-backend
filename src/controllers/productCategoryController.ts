import { Request, Response } from 'express';
import ProductCategory from '../models/productCategory.model';
import { uploadCloudinary } from '../services/cloudinaryService';

// Create a new product category
export const createProductCategory = async (req: Request, res: Response): Promise<void> => {
  const { name, description, image, status } = req.body;
    // Validate uploaded files
    if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
        res.status(400).json({ message: "At least one category image is required" });
        return;
    }


  if (!name) {
    res.status(400).json({ message: 'Category name and image are required' });
    return;
  }

  try {
    const files = req.files as {
        image?: Express.Multer.File[];
        banner?: Express.Multer.File[] | undefined;
      };
      if (!files?.image || files.image.length === 0) {
        res.status(400).json({ message: "At least one product image is required" });
        return;
     }
     // Upload main image (single)
     const imageResult = await uploadCloudinary(files.image[0], 'categories');
     const imageUrl = (imageResult as any).secure_url;
 
     // Upload banner image if exists (single)
     let bannerUrl = '';
     if (files.banner && files.banner.length > 0) {
       const bannerResult = await uploadCloudinary(files.banner[0], 'categories/banners');
       bannerUrl = (bannerResult as any).secure_url;
     }
 
  
    const newCategory = new ProductCategory({
      name,
      description,
      image: imageUrl,
      banner: bannerUrl || undefined,
      status,
      
    });

    await newCategory.save();
    

    res.status(201).json({ message: 'Product category created successfully', category: newCategory });
  } catch (error) {
    console.error('Error creating product category:', error);
    res.status(500).json({ message: 'Internal server error', error });
  }
};

// Get all product categories
export const getAllProductCategories = async (req: Request, res: Response): Promise<void> => {
  try {
    const categories = await ProductCategory.find().populate('products');

    res.status(200).json({ categories });
  } catch (error) {
    console.error('Error fetching product categories:', error);
    res.status(500).json({ message: 'Internal server error', error });
  }
};

// Get a single product category by ID
export const getProductCategoryBySlug = async (req: Request, res: Response): Promise<void> => {
  const { slug } = req.params;

  try {
    const category = await ProductCategory.findOne({slug}).populate('products')

    if (!category) {
      res.status(404).json({ message: 'Product category not found' });
      return;
    }

    res.status(200).json({ category });
  } catch (error) {
    console.error('Error fetching product category:', error);
    res.status(500).json({ message: 'Internal server error', error });
  }
};

// Update a product category
export const updateProductCategory = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { name, description, image, status } = req.body;

  try {
    const updatedCategory = await ProductCategory.findByIdAndUpdate(
      id,
      { name, description, image, status },
      { new: true, runValidators: true }
    );

    if (!updatedCategory) {
      res.status(404).json({ message: 'Product category not found' });
      return;
    }

    res.status(200).json({ message: 'Product category updated successfully', category: updatedCategory });
  } catch (error) {
    console.error('Error updating product category:', error);
    res.status(500).json({ message: 'Internal server error', error });
  }
};

// Delete a product category
export const deleteProductCategory = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.body;

  try {
    const deletedCategory = await ProductCategory.findByIdAndDelete(id);

    if (!deletedCategory) {
      res.status(404).json({ message: 'Product category not found' });
      return;
    }

    res.status(200).json({ message: 'Product category deleted successfully' });
  } catch (error) {
    console.error('Error deleting product category:', error);
    res.status(500).json({ message: 'Internal server error', error });
  }
};