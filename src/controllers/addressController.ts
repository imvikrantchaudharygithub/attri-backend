import { Request, Response } from "express";
import Address from "../models/address.model";
import User from "../models/user.model";

// ➤ Create a new address
export const createAddress = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId,phone,name, street, city, state, country, zipcode } = req.body;
  
      if (!userId) {
          res.status(400).json({ message: "User ID is required" });
        return 
      }
  
      // Check if user exists
      const user:any = await User.findById(userId);
      if (!user) {
          res.status(404).json({ message: "User not found" });
        return 
      }
  
      // Create the address
      const newAddress = await Address.create({
        user: userId,
        name,
        street,
        city,
        phone,
        state,
        zipcode,
      });
  
      // Update user's address array
      user.addresses.push(newAddress._id);
      await user.save();
  
      res.status(201).json({ message: "Address added successfully", address: newAddress });
    } catch (error) {
      console.error("Error adding address:", error);
      res.status(500).json({ message: "Internal server error", error });
    }
  };

// ➤ Get all addresses for a user
export const getUserAddresses = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    const addresses = await Address.find({ user: userId });
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