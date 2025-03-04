import { Request, Response } from 'express';
import Section from '../models/section.model';
import cloudinary from '../config/cloudinary';

// Create a new section
export const createSection = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, description, gallery, place } = req.body;

    // Parse gallery metadata
    const parsedGallery = typeof gallery === "string" ? JSON.parse(gallery) : [];
    console.log("Request Body:", req.body);
    console.log("Parsed Gallery:", parsedGallery);

    if (!title) {
      res.status(400).json({ message: "Section title is required" });
      return;
    }

    // Get uploaded files
    const files = req.files as { gallery?: Express.Multer.File[] };

    // Process gallery images
    let galleryImages: any[] = [];
    
    if (files?.gallery && files.gallery.length > 0) {
      // Create parsedGallery from galleryTitles and galleryDescriptions
      const galleryTitles = Array.isArray(req.body.galleryTitles) ? req.body.galleryTitles : [];
      const galleryDescriptions = Array.isArray(req.body.galleryDescriptions) ? req.body.galleryDescriptions : [];

      galleryImages = files.gallery.map((file, index) => {
        const title = galleryTitles[index] || 'Untitled';
        const description = galleryDescriptions[index] || 'No description';

        return {
          image: file.path, // Use the existing Cloudinary URL
          title,
          description
        };
      });
    }

    // Create and save section
    const section = new Section({
      title,
      description,
      place,
      gallery: galleryImages,
    });

    const savedSection = await section.save();
    res.status(201).json({
      success: true,
      message: "Section created successfully",
      section: savedSection
    });
  } catch (error) {
    console.error("❌ Error creating section:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create section",
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get all sections
export const getSections = async (req: Request, res: Response): Promise<void> => {
  try {
    const sections = await Section.find();
    res.status(200).json({
      success: true,
      count: sections.length,
      sections
    });
  } catch (error) {
    console.error("Error fetching sections:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch sections",
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get section by ID
export const getSectionById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const section = await Section.findById(id);
    
    if (!section) {
      res.status(404).json({
        success: false,
        message: "Section not found"
      });
      return;
    }
    
    res.status(200).json({
      success: true,
      section
    });
  } catch (error) {
    console.error("Error fetching section:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch section",
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Update section
export const updateSection = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { title, description } = req.body;
    
    // Find the section first
    const section = await Section.findById(id);
    if (!section) {
      res.status(404).json({
        success: false,
        message: "Section not found"
      });
      return;
    }
    
    // Handle gallery updates if files are present
    let galleryUpdates: any[] = [];
    
    if (req.files) {
      const files = req.files as {
        gallery?: Express.Multer.File[];
      };
      
      // Parse gallery metadata if provided
      const parsedGallery = req.body.gallery ? 
        (typeof req.body.gallery === "string" ? JSON.parse(req.body.gallery) : req.body.gallery) : 
        [];
      
      // Upload function
      const uploadToCloudinary = async (file: Express.Multer.File, folder: string) => {
        return new Promise((resolve, reject) => {
          if (!file.buffer) {
            console.error("File buffer is empty:", file);
            return reject(new Error("Empty file"));
          }

          const uploadStream = cloudinary.uploader.upload_stream(
            { folder, resource_type: 'auto' },
            (error, result) => {
              if (error) {
                console.error("Cloudinary upload error:", error);
                reject(error);
              } else {
                resolve(result);
              }
            }
          );
          
          uploadStream.end(file.buffer);
        });
      };
      
      // Process new gallery images
      if (files?.gallery && files.gallery.length > 0) {
        galleryUpdates = await Promise.all(
          files.gallery.map(async (file, index) => {
            const result: any = await uploadToCloudinary(file, 'sections');
            return {
              image: result.secure_url,
              title: parsedGallery[index]?.title || 'Untitled',
              description: parsedGallery[index]?.description || 'No description'
            };
          })
        );
      }
    }
    
    // Update fields
    const updateData: any = {
      ...(title && { title }),
      ...(description && { description })
    };
    
    // Only update gallery if new images were uploaded
    if (galleryUpdates.length > 0) {
      updateData.gallery = galleryUpdates;
    }
    
    // Update the section
    const updatedSection = await Section.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );
    
    res.status(200).json({
      success: true,
      message: "Section updated successfully",
      section: updatedSection
    });
  } catch (error) {
    console.error("Error updating section:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update section",
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Delete section
export const deleteSection = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.body;
    const deletedSection = await Section.findByIdAndDelete(id);
    
    if (!deletedSection) {
      res.status(404).json({
        success: false,
        message: "Section not found"
      });
      return;
    }
    
    res.status(200).json({
      success: true,
      message: "Section deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting section:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete section",
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
