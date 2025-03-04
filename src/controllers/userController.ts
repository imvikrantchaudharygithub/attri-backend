import { Request, Response } from 'express';

import User from '../models/user.model';
import { storeOtp, verifyOtp } from '../services/otpStore'; 
import crypto from 'crypto';
import mongoose, { Schema } from 'mongoose';
import { uploadCloudinary } from '../services/cloudinaryService';
import cloudinary from '../config/cloudinary';

// Generate OTP and send to the user
export const loginWithOTP = async (req: Request, res: Response): Promise<void> => {
  const { phone } = req.body;

  if (!phone) {
    res.status(400).json({ message: 'Phone number is required' });
    return;
  }

  try {
    // Check if user exists
    const existingUser = await User.findOne({ phone });
    
    if (!existingUser) {
      res.status(403).json({ message: 'Please register first before logging in' });
      return;
    }

    // Generate and send OTP (using your preferred service) 
    const otp = crypto.randomInt(100000, 999999).toString();

    await storeOtp(phone, otp);
    res.status(200).json({ message: `OTP=${otp} sent successfully` });
    return;
  } catch (error) {
    res.status(500).json({ message: 'Failed to send OTP', error });
    return;
  }
};

// Verify OTP and add the user if not exists //using when signup
export const verifyAndAddUser = async (req: Request, res: Response) : Promise<void> => {
  const { phone, otp, username, referralcode } = req.body;

  if (!phone || !otp || !username) {
      res.status(400).json({ message: 'Phone, OTP, and username are required' });
    return 
  }

  try {
    // Verify OTP
    const isVerified = await verifyOtp(phone, otp);
    if (!isVerified) {
        res.status(400).json({ message: 'Invalid OTP' });
      return 
    }

    // Check if the user already exists
    let user:any = await User.findOne({ phone });

    if (!user) {
      // Create a new user
      user = new User({
        username,
        phone,
        referral_code: generateReferralCode(username),
      });

      await user.save();
      if (referralcode) {
        const referrer: any = await User.findOne({ referral_code: referralcode });
        if (referrer) {
          // Add referred user's ID to the referrer's referralFamily array
          referrer.referralFamily = [...(referrer.referralFamily || []), user._id];
          await referrer.save();

          user.referral_by.push(referrer._id);
          await user.save();
        }
      }
    }

    res.status(200).json({ message: 'Login successful', user });
    return 
  } catch (error) {
      res.status(500).json({ message: 'Failed to verify OTP or add user', error });
    return 
  }
};

export const signupUser = async (req: Request, res: Response): Promise<void> => {
  const { phone, username } = req.body;

  if (!phone || !username) {
    res.status(400).json({ message: 'Phone and username are required' });
    return;
  }

  try {
    // Check if user already exists
    const existingUser = await User.findOne({ phone });
    
    if (existingUser) {
      res.status(409).json({ message: 'User with this phone number already exists' });
      return;
    }

    // Generate and send OTP for verification
    const otp = crypto.randomInt(100000, 999999).toString();
    await storeOtp(phone, otp);

    // Store user data temporarily or in session
    // You might want to implement a temporary storage solution
    // for holding user data until OTP verification

    res.status(200).json({ 
      message: 'Please verify your phone number',
      otp: otp, // In production, send this via SMS instead
      next: 'verifyAndAddUser' // Indicate the next step
    });
    return;
  } catch (error) {
    res.status(500).json({ message: 'Failed to initiate signup process', error });
    return;
  }
};
//using when login
export const resetsendOtpController = async (req: Request, res: Response) => {
  try {
      const { phone } = req.body;
      if (!phone) {
          return res.status(400).json({ message: 'Phone number is required' });
      }
      const existingUser = await User.findOne({ phone });
      if (!existingUser) {
          res.status(400).json({ message: 'No Account Found' });
          return;
      }

      // Generate a 6-digit OTP
      const otp = crypto.randomInt(100000, 999999).toString();

      // Store the OTP
      storeOtp(phone, otp);

    
      // Respond to the client
      res.status(200).json({ message: 'OTP sent successfully', otp });
  } catch (error) {
      console.error('Error sending OTP:', error);
      res.status(500).json({ message: 'Internal server error' });
  }
};


// Get all user
export const getAllUsers = async (req: Request, res: Response): Promise<void> => {
    try {
      const users = await User.find().populate({
        path: "addresses",
        model: "Address", 
        select: "street city state country zipCode", // Fetch only required fields
      });
  
      res.status(200).json({ users });
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ message: 'Internal server error', error });
    }
  };

const getAncestors = async (userId: string): Promise<any> => {
    const user = await User.findById(userId).lean();
  
    if (!user) return null;
  
    // Ensure user.referralFamily is treated as an array of ObjectId(s)
    // const referralFamily: any = user.referralFamily || [];
    const referralby: any = user.referral_by || [];

  
    // Fetch details of all users in the referralFamily array
    // const populatedFamily = await Promise.all(
    //   referralFamily.map(async (referralId: Schema.Types.ObjectId) => {
    //     // Recursively populate referralFamily for each referred user
    //     const referredUser = await populateReferralFamily(referralId.toString());
    //     return referredUser;
    //   })
    // );
    const populatedreferralby = await Promise.all(
        referralby.map(async (referralId: Schema.Types.ObjectId) => {
          // Recursively populate referralFamily for each referred user
          const referredUser = await getAncestors(referralId.toString());
          return referredUser;
        })
      );
  
    return {
      _id: user._id,
      username: user.username,
      phone: user.phone,
      referral_code: user.referral_code,
      balance: user.balance,
      adult: user.adult,
    //   referralFamily: populatedFamily,
      referral_by: populatedreferralby // Recursively populated referralFamily array
    };
  };

export const getUserAncestors = async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;
  
    if (!userId) {
      res.status(400).json({ message: 'User ID is required' });
      return;
    }
  
    try {
      // Find the user by ID and populate the referralFamily field
      const user = await getAncestors(userId);

      if (!user) {
        res.status(404).json({ message: 'User not found' });
        return;
      }
  
      res.status(200).json({ user });
    } catch (error) {
      console.error('Error fetching user by ID:', error);
      res.status(500).json({ message: 'Internal server error', error });
    }
  };

//   getAncestors
// getUserAncestors

const populateReferralFamily = async (userId: string): Promise<any> => {
    const user = await User.findById(userId).lean()
  
    if (!user) return null;
  
    // Ensure user.referralFamily is treated as an array of ObjectId(s)
    const referralFamily: any = user.referralFamily || [];
  
    // Fetch details of all users in the referralFamily array
    const populatedFamily = await Promise.all(
      referralFamily.map(async (referralId: Schema.Types.ObjectId) => {
        // Recursively populate referralFamily for each referred user
        const referredUser = await populateReferralFamily(referralId.toString());
        return referredUser;
      })
    );
   
  
    return {
      _id: user._id,
      username: user.username,
      phone: user.phone,
      referral_code: user.referral_code,
      balance: user.balance,
      adult: user.adult,
      referralFamily: populatedFamily,
    };
  };

export const getUserById = async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;
  
    if (!userId) {
      res.status(400).json({ message: 'User ID is required' });
      return;
    }
  
    try {
      // Find the user by ID and populate the referralFamily field
      const user = await populateReferralFamily(userId);

      if (!user) {
        res.status(404).json({ message: 'User not found' });
        return;
      }
  
      res.status(200).json({ user });
    } catch (error) {
      console.error('Error fetching user by ID:', error);
      res.status(500).json({ message: 'Internal server error', error });
    }
  };

// Utility to generate a referral code
const generateReferralCode = (username: string): string => {
  return username.slice(0, 3).toUpperCase() + Math.random().toString(36).substr(2, 6).toUpperCase();
};

export const uploadUserImage = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ message: "No file uploaded" });
        return;
      }
  
      const userId = req.body.userid;
      if (!userId) {
        res.status(400).json({ message: "User ID is required" });
        return;
      }
  
      // Get the uploaded file URL from Cloudinary
      const imageUrl = (req.file as any).path;
  
      // Update the user's profile image in the database
      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }
  
      user.profileimage = imageUrl;
      await user.save();
  
      res.status(200).json({ message: "Image uploaded successfully", user });
    } catch (error) {
      console.error("Error uploading user image:", error);
      res.status(500).json({ message: "Failed to upload image", error });
    }
  };

export const getUserByReferralCode = async (req: Request, res: Response): Promise<void> => {
  const { referralCode } = req.params;

  if (!referralCode) {
    res.status(400).json({ message: 'Referral code is required' });
    return;
  }

  try {
    const user = await User.findOne({ referral_code: referralCode });

    if (!user) {
      res.status(201).json({ message: 'User not found with this referral code' });
      return;
    }

    res.status(200).json({ user });
  } catch (error) {
    console.error('Error fetching user by referral code:', error);
    res.status(500).json({ message: 'Internal server error', error });
  }
};