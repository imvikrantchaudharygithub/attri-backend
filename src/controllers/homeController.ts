import { Request, Response } from 'express';
import Banner from '../models/banner.model';
import ProductCategory from '../models/productCategory.model';
import Section from '../models/section.model';

export const getHomedata = async (req: Request, res: Response): Promise<void> => {
    try {
      // Get all active banners
      const banners = await Banner.find({ status: 'active' });
      const sectionsData = await Section.find();
      // Get categories with populated products
      const categories = await ProductCategory.find()
        .populate({
          path: 'products',
          model: 'Product',
          select: '' // Select all fields by leaving it empty
        });
  
      res.status(200).json({
        success: true,
        data: {
          banners,
          categories,
          sectionsData
        }
      });
    } catch (error) {
      console.error('Error fetching banners and categories:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching banners and categories',
        error
      });
    }
  };