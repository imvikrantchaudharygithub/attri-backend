import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary";

// Allowed file types
const allowedFormats = ["image/jpeg", "image/jpg", "image/png"];

const fileFilter = (req: any, file: Express.Multer.File, cb: any) => {
  if (allowedFormats.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only JPG, JPEG, and PNG files are allowed"), false);
  }
};

// Cloudinary Storage Configuration
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: <any>{
    folder: "products",
    format: async (req:any, file:any) => file.mimetype.split("/")[1], // Keep original format
    public_id: (req:any, file:any) => `${Date.now()}-${file.originalname.split(".")[0]}`,
  },
});

const upload = multer({ storage, fileFilter });

export default upload;