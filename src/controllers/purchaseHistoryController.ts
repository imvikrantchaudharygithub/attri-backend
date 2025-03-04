import { Request, Response } from "express";
import { Purchase } from "../models/purchaseHistory.model";

/**
 * Get purchase history for a user.
 */
export const getPurchaseHistory = async (req: Request, res: Response) => {
//   const { userId } = req.params;

  try {
    // Find all purchases for the given user and populate the product details
    const purchaseHistory = await Purchase.find()
      .populate({
        path: "products", // Populate product details
        model: "Product",
      }).populate({
        path: "user", // Populate product details
        model: "User",
      })
      .sort({ createdAt: -1 }); // Sort by most recent purchase

    if (!purchaseHistory || purchaseHistory.length === 0) {
        res.status(404).json({ message: "No purchase history found for this user." });
      return 
    }

    res.status(200).json({
      message: "Purchase history retrieved successfully.",
      purchaseHistory,
    });
  } catch (error) {
    console.error("Error fetching purchase history:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};