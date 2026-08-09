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
import { isOtpLoginEnabled, MAX_PASSWORD_SET_SKIPS } from '../config/authConfig';
import { hashPassword, validatePassword } from '../services/passwordService';
dotenv.config();
const secretKey :any = process.env.SECRET_KEY;
const REFERRER_REWARD_BALANCE = 10;  // ₹ real money to the referrer (withdrawable)
const NEW_MEMBER_CASHBACK = 200;     // ₹ store credit to the new member
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

    // Signup codes must keep flowing when OTP *login* is switched off: phone
    // ownership still has to be proven at registration.
    if (newuser !== true && !isOtpLoginEnabled()) {
      res.status(403).json({ message: 'OTP login is disabled. Please use your password.' });
      return;
    }

    // Generate and send OTP (using your preferred service) 
    const otp = crypto.randomInt(1000, 9999).toString();

    // Scope the code to the journey it was issued for: a signup code must not
    // be redeemable at login, nor a login code at password set.
    await storeOtp(phone, otp, newuser === true ? 'signup' : 'login');
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

  // The switch that ends OTP login once password adoption is high enough.
  // Password reset and signup are deliberately unaffected.
  if (!isOtpLoginEnabled()) {
    res.status(403).json({ message: 'OTP login is disabled. Please use your password.' });
    return;
  }

  if (!phone || !otp) {
    res.status(400).json({ message: 'Phone and OTP are required' });
    return;
  }

  try {
    // Verify OTP
    const isVerified = await verifyOtp(phone, otp, 'login');

    if (!isVerified) {
      res.status(400).json({ message: 'Invalid OTP' });
      return;
    }

    // +password so hasPassword can be computed; the response below uses a
    // re-read document so the hash never reaches the client.
    const user: any = await User.findOne({ phone }).select('+password');

    if (!user) {
      res.status(404).json({ message: 'User not found. Please signup first' });
      return;
    }

    if (!secretKey) {
      // Previously this sent a 500 and then fell through to send a 200 as
      // well, crashing on ERR_HTTP_HEADERS_SENT.
      res.status(500).json({ message: "Internal server error: Secret key not defined" });
      return;
    }
    token = jwt.sign(
      { userId: user.id, tv: user.tokenVersion || 0 },
      secretKey,
      { expiresIn: '168h' }
    );

    const hasPassword = Boolean(user.password);
    const safeUser = await User.findById(user._id);

    // Login successful
    res.status(200).json({
      message: 'Login successful',
      user: safeUser,
      token,
      // Drives the soft gate: the frontend shows the "set a password" step
      // instead of closing the modal.
      passwordSetRequired: !hasPassword,
      skipsRemaining: Math.max(0, MAX_PASSWORD_SET_SKIPS - (user.passwordSetSkips || 0)),
    });

  } catch (error) {
    console.error('Error verifying login OTP:', error);
    res.status(500).json({ message: 'Failed to verify OTP', error });
    return;
  }
};

// Verify OTP and add the user if not exists //using when signup
export const verifyAndAddUser = async (req: Request, res: Response): Promise<void> => {
  const { phone, otp, username, referralcode, dateofbirth, password } = req.body;
  let token: any;

  if (!phone || !otp || !username) {
    res.status(400).json({ message: 'Phone, OTP, and username are required' });
    return;
  }

  // Optional in the API so a cached older app build keeps working rather than
  // hard-failing on a live store; required by the signup form. Validated before
  // the transaction opens so a rejected password never consumes the OTP.
  if (password !== undefined) {
    const policyError = validatePassword(password);
    if (policyError) {
      res.status(400).json({ message: policyError });
      return;
    }
  }

  const session = await mongoose.startSession();
  let user: any = null;
  let committed = false;

  try {
    session.startTransaction();

    // Verify OTP
    const isVerified = await verifyOtp(phone, otp, 'signup');
    if (!isVerified) {
      await session.abortTransaction();
      res.status(400).json({ message: 'Invalid OTP' });
      return;
    }

    // Check if the user already exists (read within the transaction)
    user = await User.findOne({ phone }).session(session);

    if (!user) {
      // Create the new user. ALL writes below use the session so the document is
      // created and rewarded atomically — mixing session and non-session writes on
      // the same doc caused a commit-time write conflict that crashed the process.
      user = new User({
        username,
        phone,
        referral_code: generateReferralCode(username),
        referralFamily: [],
        referral_by: [],
        dateofbirth: dateofbirth,
        // Hashed inside the same session, so account creation and referral
        // rewards stay atomic. New accounts are born with a password, which is
        // what stops the legacy pool growing.
        ...(password
          ? { password: await hashPassword(String(password)), passwordSetAt: new Date() }
          : {}),
      });
      await user.save({ session });

      // Process referral reward (signup is referral-mandatory on the frontend)
      if (referralcode) {
        const referrer: any = await User.findOne({
          referral_code: referralcode.trim()
        }).session(session);

        if (!referrer) {
          console.error(`Referral code not found: "${referralcode}"`);
        } else {
          // Referrer earns REAL money (withdrawable balance); new member earns cashback.
          await User.findByIdAndUpdate(referrer._id, { $inc: { balance: REFERRER_REWARD_BALANCE } }, { session });
          await User.findByIdAndUpdate(user._id, { $inc: { cashback: NEW_MEMBER_CASHBACK } }, { session });
          // Link both directions (idempotent) within the same session.
          await User.findByIdAndUpdate(referrer._id, { $addToSet: { referralFamily: user._id } }, { session });
          await User.findByIdAndUpdate(user._id, { $addToSet: { referral_by: referrer._id } }, { session });
          console.log(`Credited Rs.${REFERRER_REWARD_BALANCE} balance to referrer ${referrer._id} and Rs.${NEW_MEMBER_CASHBACK} cashback to new member ${user._id}`);
        }
      }
    }

    if (!secretKey) {
      await session.abortTransaction();
      res.status(500).json({ message: "Internal server error: Secret key not defined" });
      return;
    }
    token = jwt.sign(
      { userId: user.id, tv: user.tokenVersion || 0 },
      secretKey,
      { expiresIn: '168h' }
    );

    await session.commitTransaction();
    committed = true;
  } catch (error) {
    // Only abort if we never committed; guard so a stale abort can never crash the process.
    if (!committed) {
      try { await session.abortTransaction(); } catch (_) { /* already settled */ }
    }
    console.error('Error in verifyAndAddUser:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Failed to verify OTP or add user', error });
    }
    return;
  } finally {
    session.endSession();
  }

  // Transaction committed — load fresh state and respond. Guarded so a response
  // error can't crash the process or trigger a post-commit abort.
  try {
    const freshUser = await User.findById(user._id);
    res.status(200).json({ message: 'Login successful', user: freshUser, token });
  } catch (err) {
    console.error('verifyAndAddUser post-commit response error:', err);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Signup completed but failed to load user' });
    }
  }
};

// Removed: resetsendOtpController. Its route was already commented out, it
// returned the OTP in its own response body, and it leaked account existence
// via "No Account Found". Password reset is handled by
// POST /api/auth/password/otp + /api/auth/password/set.

// Get all user
export const getAllUsers = async (req: Request, res: Response): Promise<void> => {
    try {
      const users = await User.find().populate({
        path: "addresses",
        model: "Address", 
        select: "street city state country zipCode", // Fetch only required fields
      }).populate({
        path: "commissionHistory",
        model: "CommissionHistory",
        select: "amount date level fromUser"
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
      res.status(404).json({ message: 'User not found with this referral code' });
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


