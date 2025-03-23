import { Request, Response } from 'express';
import { UserBankDetail } from '../models/userBankDetail.model';

// Add this interface to extend the Request type
interface AuthenticatedRequest extends Request {
  userId?: string; // For compatibility with existing code
  user?: {
    id: string;
    [key: string]: any; // Allow any other properties on user
  };
}

  // Add new bank account
  export const addBankDetail = async (req: AuthenticatedRequest, res: Response): Promise<void> =>  {
    try {
      // Get userId from either source (req.userId or req.user.id)
      const userId = req.userId || (req.user ? req.user.id : undefined);
      
      if (!userId) {
        res.status(401).json({ message: 'User authentication required' });
        return;
      }

      const existingAccount = await UserBankDetail.findOne({
        user: userId,
        accountNumber: req.body.accountNumber
      });

      if (existingAccount) {
        res.status(400).json({ message: 'Account number already exists' });
        return;
      }

      // Set first account as default
      const count = await UserBankDetail.countDocuments({ user: userId });
      const isDefault = count === 0;

      const bankDetail = await UserBankDetail.create({
        ...req.body,
        user: userId,
        isDefault
      });

      res.status(201).json({
        message: 'Bank details added successfully',
        bankDetail
      });
    } catch (error: any) {
      res.status(500).json({
        message: 'Error adding bank details',
        error: error.message
      });
    }
  }

  // Get all bank accounts for user
    export const getBankDetails = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const userId = req.userId || (req.user ? req.user.id : undefined);
        const bankDetails = await UserBankDetail.find({ user: userId })
        .sort({ isDefault: -1, createdAt: -1 })
        .lean();

      res.json({
        message: 'Bank details retrieved successfully',
        bankDetails
      });
    } catch (error: any) {
      res.status(500).json({
        message: 'Error retrieving bank details',
        error: error.message
      });
    }
  }

  // Update bank account details
  export const updateBankDetail = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { id: userId } = req.user || {};

      const updatedDetail = await UserBankDetail.findOneAndUpdate(
        { _id: id, user: userId },
        req.body,
        { new: true, runValidators: true }
      );

      if (!updatedDetail) {
        res.status(404).json({ message: 'Bank detail not found' });
        return;
      }

      res.json({
        message: 'Bank details updated successfully',
        bankDetail: updatedDetail
      });
    } catch (error: any) {
      res.status(500).json({
        message: 'Error updating bank details',
        error: error.message
      });
    }
  }

  // Delete bank account
  export const deleteBankDetail = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.body;
      const userId = req.userId || (req.user ? req.user.id : undefined);

      const deletedDetail = await UserBankDetail.findOneAndDelete({
        _id: id,
        user: userId
      });

      if (!deletedDetail) {
        res.status(404).json({ message: 'Bank detail not found' });
        return;
      }

      // If deleted account was default, set new default
      if (deletedDetail.isDefault) {
        const firstAccount = await UserBankDetail.findOne({ user: userId });
        if (firstAccount) {
          firstAccount.isDefault = true;
          await firstAccount.save();
        }
      }

      res.json({
        message: 'Bank details deleted successfully'
      });
    } catch (error: any) {
      res.status(500).json({
        message: 'Error deleting bank details',
        error: error.message
      });
    }
  }
  // Set default bank account
  export const setDefaultAccount = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.userId || (req.user ? req.user.id : undefined);

      // Reset all defaults
      await UserBankDetail.updateMany(
        { user: userId },
        { $set: { isDefault: false } }
      );

      // Set new default
      const defaultAccount = await UserBankDetail.findOneAndUpdate(
        { _id: id, user: userId },
        { $set: { isDefault: true } },
        { new: true }
      );

      if (!defaultAccount) {
            res.status(404).json({ message: 'Bank detail not found' });
        return;
      }

      res.json({
        message: 'Default bank account updated successfully',
        bankDetail: defaultAccount
      });
    } catch (error: any) {
      res.status(500).json({
        message: 'Error setting default account',
        error: error.message
      });
    }
  }

