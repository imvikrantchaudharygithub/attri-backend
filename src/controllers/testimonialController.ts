import { Request, Response } from 'express';
import Testimonial from '../models/testimonial.model';
import { uploadCloudinary } from '../services/cloudinaryService';

// Create new testimonial
export const createTestimonial = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, description, author, rating } = req.body;
    
    // Debug logs
    console.log('Request body:', req.body);
    console.log('Request files:', req.files);
    
    let profilePic = '';
    if (req.files) {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      if (files.profilePic && files.profilePic.length > 0) {
        // If file already has a path, use it directly
        if (files.profilePic[0].path) {
          profilePic = files.profilePic[0].path;
        } else {
          // Otherwise, upload to Cloudinary
          const imageResult = await uploadCloudinary(files.profilePic[0], 'testimonials');
          profilePic = (imageResult as { secure_url: string }).secure_url;
        }
      }
    }

    const testimonial = new Testimonial({
      title,
      description,
      author,
      rating,
      profilePic
    });

    await testimonial.save();
    res.status(201).json({ success: true, data: testimonial });
  } catch (error) {
    console.error('Error details:', error);
    res.status(500).json({ success: false, message: 'Error creating testimonial', error });
  }
};

// Get all testimonials
export const getTestimonials = async (req: Request, res: Response): Promise<void> => {
  try {
    const testimonials = await Testimonial.find({ isActive: true });
    res.status(200).json({ success: true, data: testimonials });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching testimonials', error });
  }
};

// Update testimonial
export const updateTestimonial = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (req.file) {
      const result: any = await uploadCloudinary(req.file, 'testimonials');
      updates.profilePic = result.secure_url;
    }

    const testimonial = await Testimonial.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true }
    );

    if (!testimonial) {
      res.status(404).json({ success: false, message: 'Testimonial not found' });
      return;
    }

    res.status(200).json({ success: true, data: testimonial });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error updating testimonial', error });
  }
};

// Delete testimonial
export const deleteTestimonial = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.body;
    const testimonial = await Testimonial.findByIdAndDelete(id);
    console.log(testimonial,req.body);

    if (!testimonial) {
      res.status(404).json({ success: false, message: 'Testimonial not found' });
      return;
    }

    res.status(200).json({ success: true, message: 'Testimonial deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error deleting testimonial', error });
  }
};
