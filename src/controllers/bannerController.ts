import { Request, Response } from 'express';
import Banner from '../models/banner.model';



// Multer configuration (for local uploads)

export const uploadBanner = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.files || !("image" in req.files) || !("mob_image" in req.files)) {
      res.status(400).json({ message: "Both 'image' and 'mob_image' are required" });
      return;
    }

    // Extract file paths from Cloudinary
    const imageFile = (req.files as { [fieldname: string]: Express.Multer.File[] })["image"][0].path;
    const mobImageFile = (req.files as { [fieldname: string]: Express.Multer.File[] })["mob_image"][0].path;

    const { title } = req.body;
    if (!title) {
      res.status(400).json({ message: "Title is required" });
      return;
    }

    // Save to DB
    const banner = new Banner({
      title,
      image: imageFile,
      mob_image: mobImageFile,
    });

    await banner.save();
    res.status(201).json({ message: "Banner uploaded successfully", banner });
  } catch (error) {
    console.error("Error uploading banner:", error);
    res.status(500).json({ 
      message: "Failed to upload banner", 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
};

// Get all banners
export const getBanners = async (req: Request, res: Response): Promise<void> => {
  try {
    const banners = await Banner.find({ status: 'active' });
    res.status(200).json({ banners });
  } catch (error) {
    res.status(500).json({ message: 'Failed to retrieve banners', error });
  }
};

// Delete a banner
export const deleteBanner = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.body;
  try {
    const deletedBanner = await Banner.findByIdAndDelete(id);
    
    if (!deletedBanner) {
      res.status(404).json({ message: 'Banner not found' });
      return;
    }

    res.status(200).json({ message: 'Banner deleted successfully' });
  } catch (error) {
    console.error('Error deleting banner:', error);
    res.status(500).json({ 
      message: 'Failed to delete banner',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};