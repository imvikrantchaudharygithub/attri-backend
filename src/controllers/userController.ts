import { Request, Response } from 'express';

import User from '../models/user.model';
import { storeOtp, verifyOtp } from '../services/otpStore'; 
import crypto from 'crypto';
import mongoose, { Schema } from 'mongoose';
import { uploadCloudinary } from '../services/cloudinaryService';
import cloudinary from '../config/cloudinary';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { sendSMS } from '../services/smsSevice';
dotenv.config();
const secretKey :any = process.env.SECRET_KEY;
// Generate OTP and send to the user
export const loginWithOTP = async (req: Request, res: Response): Promise<void> => {
  const { phone ,newuser} = req.body;

  if (!phone) {
    res.status(400).json({ message: 'Phone number is required' });
    return;
  }

  try {
    // Check if user exists
    const existingUser = await User.findOne({ phone });
    if(newuser==true){
      if(existingUser){
        res.status(403).json({ message: 'User already exists' });
        return;
      }
    }else if(newuser==false){
      if (!existingUser) {
        res.status(403).json({ message: 'Please register first before logging in' });
        return;
      }
    }

    // Generate and send OTP (using your preferred service) 
    const otp = crypto.randomInt(1000, 9999).toString();

    await storeOtp(phone, otp);
   await sendSMS(phone, Number(otp));
    res.status(200).json({ message: `OTP sent successfully` });
    return;
  } catch (error) {
    res.status(500).json({ message: 'Failed to send OTP', error });
    return;
  }
};

// Verify OTP for user login
export const verifyLoginOtp = async (req: Request, res: Response): Promise<void> => {
  let token:any;
  const { phone, otp } = req.body;

  if (!phone || !otp) {
    res.status(400).json({ message: 'Phone and OTP are required' });
    return;
  }

  try {
    // Verify OTP
    const isVerified = await verifyOtp(phone, otp);
    
    if (!isVerified) {
      res.status(400).json({ message: 'Invalid OTP' });
      return;
    }

    // Find the user
    const user = await User.findOne({ phone });
    
    if (!user) {
      res.status(404).json({ message: 'User not found. Please signup first' });
      return;
    }
    if (secretKey) {
      token = jwt.sign({ userId: user.id }, secretKey, { expiresIn: '168h' });
     } else {
         res.status(500).json({ message: "Internal server error: Secret key not defined" });
     }

    // Login successful
    res.status(200).json({ 
      message: 'Login successful', 
      user ,
      token
    });
    
  } catch (error) {
    console.error('Error verifying login OTP:', error);
    res.status(500).json({ message: 'Failed to verify OTP', error });
    return;
  }
};

// Verify OTP and add the user if not exists //using when signup
export const verifyAndAddUser = async (req: Request, res: Response): Promise<void> => {
  const { phone, otp, username, referralcode, dateofbirth } = req.body;
  let token: any;

  if (!phone || !otp || !username) {
    res.status(400).json({ message: 'Phone, OTP, and username are required' });
    return;
  }

  try {
    // Verify OTP
    const isVerified = await verifyOtp(phone, otp);
    if (!isVerified) {
      res.status(400).json({ message: 'Invalid OTP' });
      return;
    }

    // Check if the user already exists
    let user: any = await User.findOne({ phone });

    if (!user) {
      // Create a new user with properly initialized arrays
      user = new User({
        username,
        phone,
        referral_code: generateReferralCode(username),
        referralFamily: [], // Initialize empty array
        referral_by: [],     // Initialize empty array
        dateofbirth: dateofbirth
      });

      await user.save();
      
      // Process referral code AFTER user is saved
      if (referralcode) {
        try {
          // Find referrer by exact code match
          const referrer:any = await User.findOne({ referral_code: referralcode.trim() });
          
          if (!referrer) {
            console.error(`Referral code not found: "${referralcode}"`);
            // Continue without error - just don't set the referral
          } else {
            console.log(`Found referrer: ${referrer._id} for code: ${referralcode}`);

            // Convert IDs to strings for comparison/debugging
            const referrerId = referrer._id.toString();
            const userId = user._id.toString();
            console.log(`Linking user ${userId} to referrer ${referrerId}`);
            
            // Direct array manipulation with save (more reliable than update operations)
            // 1. Add user to referrer's family
            if (!referrer.referralFamily) referrer.referralFamily = [];
            if (!referrer.referralFamily.some((id: mongoose.Types.ObjectId) => id.toString() === userId)) {
              referrer.referralFamily.push(user._id);
              await referrer.save();
              console.log(`Updated referrer's family array: ${referrer.referralFamily.length} members`);
            }
            
            // 2. Add referrer to user's referral_by
            if (!user.referral_by) user.referral_by = [];
            if (!user.referral_by.some((id: mongoose.Types.ObjectId) => id.toString() === referrerId)) {
              user.referral_by.push(referrer._id);
              await user.save();
              console.log(`Updated user's referral_by: ${user.referral_by.map((id: mongoose.Types.ObjectId) => id.toString())}`);
            }
            
            // 3. Verify the changes
            const verifyUser = await User.findById(user._id);
            console.log(`Verification - user referral_by: ${Array.isArray(verifyUser?.referral_by) ? verifyUser.referral_by.length : 0}`);
          }
        } catch (error) {
          // Log error but don't fail registration
          console.error('Error processing referral code:', error);
        }
      }
    }

    if (secretKey) {
      token = jwt.sign({ userId: user.id }, secretKey, { expiresIn: '168h' });
    } else {
      res.status(500).json({ message: "Internal server error: Secret key not defined" });
      return;
    }

    res.status(200).json({ message: 'Login successful', user, token });
  } catch (error) {
    console.error('Error in verifyAndAddUser:', error);
    res.status(500).json({ message: 'Failed to verify OTP or add user', error });
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
      const otp = crypto.randomInt(1000, 9999).toString();

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

const getReferralsByLevel = async (userId: string, maxLevel: number = 7): Promise<any> => {
  const user = await User.findById(userId).lean().populate('referralFamily', 'username phone'); 
  
  if (!user) return null;
  
  // Initialize levels structure
  const levels: { [key: number]: any[] } = {};
  for (let i = 1; i <= maxLevel; i++) {
    levels[i] = [];
  }
  
  // Function to recursively collect referrals by level
  const collectReferralsByLevel = async (id: string, currentLevel: number = 1) => {
    if (currentLevel > maxLevel) return;
    
    const referrer:any = await User.findById(id).lean();
    if (!referrer || !referrer.referralFamily || !referrer.referralFamily.length) return;
    
    // Get all direct referrals for this user
    for (const referralId of referrer.referralFamily) {
      const referredUser = await User.findById(referralId).lean();
      if (referredUser) {
        levels[currentLevel].push({
          _id: referredUser._id,
          username: referredUser.username,
          phone: referredUser.phone,
          referral_code: referredUser.referral_code,
          balance: referredUser.balance,
          adult: referredUser.adult,
          profileimage: referredUser.profileimage,

        });
        
        // Recursively process this user's referrals at the next level
        await collectReferralsByLevel(referralId.toString(), currentLevel + 1);
      }
    }
  };
  
  // Start collection from the user's referrals
  await collectReferralsByLevel(userId);
  
  // Convert levels object to array for easier iteration
  const levelsArray = Object.keys(levels).map(level => ({
    level: parseInt(level),
    referrals: levels[parseInt(level)]
  }));
  
  return {
    _id: user._id,
    username: user.username,
    phone: user.phone,
    referral_code: user.referral_code,
    balance: user.balance,
    adult: user.adult,
    profileimage: user.profileimage,
    referralsByLevel: levelsArray,
    referralFamily: user.referralFamily
  };
};

export const getUserById = async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.params;

  if (!userId) {
    res.status(400).json({ message: 'User ID is required' });
    return;
  }

  try {
    // Get user with referrals organized by levels 1-7
    const user = await getReferralsByLevel(userId);

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

// Get user data using JWT token from Authorization header
export const getUserByToken = async (req: Request, res: Response): Promise<void> => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ message: 'No token provided' });
      return;
    }

    const token = authHeader.split(' ')[1];
    
    // Verify token
    const decoded: any = jwt.verify(token, secretKey);
    if (!decoded || !decoded.userId) {
      res.status(401).json({ message: 'Invalid token' });
      return;
    }

    // Find user by ID from token
    const user = await User.findById(decoded.userId);
    

    // Only try to populate if the user exists
    if (user) {
      // Try to populate, but handle if it fails
      try {
        await user.populate('addresses');
        await user.populate('referralFamily');
        await user.populate('referral_by');
      } catch (error) {
        console.warn('Error populating user fields:', error);
        // Continue without populated fields
      }
    }
    
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    // Return user data
    res.status(200).json({ user });
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ message: 'Invalid token' });
      return;
    }
    console.error('Error fetching user by token:', error);
    res.status(500).json({ message: 'Internal server error', error });
  }
};
export const deleteUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.body.userId
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const deletedUser = await User.findOneAndDelete({ _id: userId });

    if (!deletedUser) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.json({ 
      message: 'User deleted successfully',
      deletedUser: {
        id: deletedUser._id,
        phone: deletedUser.phone,
        username: deletedUser.username
      }
    });
  } catch (error: any) {
    console.error('Error deleting user:', error);
    res.status(500).json({ 
      message: 'Error deleting user',
      error: error.message 
    });
  }
};

// Set user as recommended
export const setUserAsRecommended = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      res.status(400).json({ message: 'User ID is required' });
      return;
    }
    
    const user = await User.findByIdAndUpdate(
      userId,
      { recommendedUser: true },
      { new: true }
    );
    
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }
    
    res.status(200).json({ 
      message: 'User set as recommended successfully',
      user
    });
  } catch (error: any) {
    console.error('Error setting user as recommended:', error);
    res.status(500).json({ 
      message: 'Failed to set user as recommended',
      error: error.message 
    });
  }
};

// Remove user from recommended
export const removeUserFromRecommended = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      res.status(400).json({ message: 'User ID is required' });
      return;
    }
    
    const user = await User.findByIdAndUpdate(
      userId,
      { recommendedUser: false },
      { new: true }
    );
    
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }
    
    res.status(200).json({ 
      message: 'User removed from recommended successfully',
      user
    });
  } catch (error: any) {
    console.error('Error removing user from recommended:', error);
    res.status(500).json({ 
      message: 'Failed to remove user from recommended',
      error: error.message 
    });
  }
};

// Get all recommended users
export const getRecommendedUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const users = await User.find({ recommendedUser: true })
      .select('_id username phone profileimage referral_code');
      
    res.status(200).json({ 
      message: 'Recommended users retrieved successfully',
      count: users.length,
      users
    });
  } catch (error: any) {
    console.error('Error fetching recommended users:', error);
    res.status(500).json({ 
      message: 'Failed to fetch recommended users',
      error: error.message 
    });
  }
};


