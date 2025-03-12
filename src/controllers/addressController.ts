import { Request, Response } from "express";
import Address, { IAddress } from "../models/address.model";
import User from "../models/user.model";
import mongoose from "mongoose";

// ➤ Create a new address
export const createAddress = async (req: Request, res: Response): Promise<void> => {
  try {
    // Get userId - first try from auth token, fall back to request body
    let userId = (req as any).user?._id;
    
    // If userId not in auth token, use from request body
    if (!userId && req.body.userId) {
      userId = req.body.userId;
    }
    
    // Validate userId exists
    if (!userId) {
      res.status(400).json({ message: "User ID is required" });
      return;
    }
    
    // Destructure without userId to avoid duplicates
    const { isDefault, userId: bodyUserId, ...addressData } = req.body;

    // Create address with user reference
    const newAddress = await Address.create({
      ...addressData,
      userId: userId, // Use the validated userId
      isDefault: isDefault || false
    });

    // Update user's addresses array
    await User.findByIdAndUpdate(userId, {
      $push: { addresses: newAddress._id }
    });

    res.status(200).json({ message: "Address added successfully", address: newAddress });
  } catch (error:any) {
    console.error("Error adding address:", error);
    if (error.name === 'ValidationError') {
      res.status(400).json({ message: "Validation error", error: error.message });
    } else if (error.code === 11000) {
      res.status(400).json({ message: "Only one default address allowed" });
    } else {
      res.status(500).json({ message: "Internal server error" });
    }
  }
};


// ➤ Get all addresses for a user
export const getUserAddresses = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    const addresses = await Address.find({ userId: userId });
    // console.log(addresses);
    if (!addresses.length) {
    res.status(404).json({ message: "No addresses found" });
      return 
    }

    res.status(200).json({ addresses });
  } catch (error) {
    console.error("Error fetching addresses:", error);
    res.status(500).json({ message: "Failed to fetch addresses", error });
  }
};

// ➤ Get a single address by ID
export const getAddressById = async (req: Request, res: Response): Promise<void> =>  {
  try {
    const { id } = req.params;
    const address = await Address.findById(id);

    if (!address) {
     res.status(404).json({ message: "Address not found" });
      return
    }

    res.status(200).json({ address });
  } catch (error) {
    console.error("Error fetching address:", error);
    res.status(500).json({ message: "Failed to fetch address", error });
  }
};

// ➤ Update an address
export const updateAddress = async (req: Request, res: Response): Promise<void> =>  {
  try {
    const { id } = req.params;
    const updatedData = req.body;

    const updatedAddress = await Address.findByIdAndUpdate(id, updatedData, { new: true });

    if (!updatedAddress) {
    res.status(404).json({ message: "Address not found" });
      return 
    }

    res.status(200).json({ message: "Address updated successfully", address: updatedAddress });
  } catch (error) {
    console.error("Error updating address:", error);
    res.status(500).json({ message: "Failed to update address", error });
  }
};

// ➤ Delete an address
export const deleteAddress = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const deletedAddress = await Address.findByIdAndDelete(id);

    if (!deletedAddress) {
    res.status(404).json({ message: "Address not found" });
      return 
    }

    res.status(200).json({ message: "Address deleted successfully" });
  } catch (error) {
    console.error("Error deleting address:", error);
    res.status(500).json({ message: "Failed to delete address", error });
  }
};

export const setDefaultAddress = async (req: Request, res: Response): Promise<void> => {
  try {
    // 1. Get userId and addressId from params
    const { addressId } = req.params;
    const { userId } = req.body; // Get userId from request body instead of auth token
    
    // Log for debugging
    console.log("Setting default address:", { userId, addressId });
    
    // 2. Validate parameters
    if (!userId || !addressId) {
      res.status(400).json({ message: "User ID and Address ID are required" });
      return;
    }
    
    // 3. Verify the address exists and belongs to the user
    const addressExists = await Address.findOne({ 
      _id: addressId, 
      userId: userId 
    });
    
    if (!addressExists) {
      res.status(404).json({ message: "Address not found for this user" });
      return;
    }
    
    // 4. Reset all defaults for this user
    await Address.updateMany(
      { userId: userId, isDefault: true },
      { $set: { isDefault: false } }
    );
    
    // 5. Set the new default
    const updatedAddress = await Address.findByIdAndUpdate(
      addressId,
      { $set: { isDefault: true } },
      { new: true }
    );
    
    res.status(200).json({
      message: "Default address updated successfully",
      address: updatedAddress
    });
    
  } catch (error: any) {
    console.error("Error setting default address:", error);
    
    res.status(500).json({ 
      message: "Failed to update default address",
      error: error.message
    });
  }
};