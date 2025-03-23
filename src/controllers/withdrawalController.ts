import { Request, Response } from 'express';
import { Withdrawal } from '../models/withdrawal.model';
import User from '../models/user.model';
import { UserBankDetail } from '../models/userBankDetail.model';


// Add this interface to extend the Request type
interface AuthenticatedRequest extends Request {
    userId?: string; // For compatibility with existing code
    user?: {
      id: string;
      [key: string]: any; // Allow any other properties on user
    };
  }
export const withdrawalController = {
  async createWithdrawal(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.userId || (req.user ? req.user.id : undefined);
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }
      const { amount, bankDetail } = req.body;

      // Add minimum amount check
      if (amount < 100) {
        res.status(400).json({ message: 'Minimum withdrawal amount is 100' });
        return;
      }

      // Check user balance
      const user:any = await User.findById(userId);
      if (!user || user.balance < amount) {
        res.status(400).json({ message: 'Insufficient balance' });
        return;
      }

      // Verify bank detail belongs to user
      const bankAccount = await UserBankDetail.findOne({
        _id: bankDetail,
        user: userId
      });
      
      if (!bankAccount) {
        res.status(400).json({ message: 'Invalid bank account' });
        return;
      }

      // Deduct balance immediately
      user.balance -= amount;
      await user.save();

      const withdrawal = await Withdrawal.create({
        user: userId,
        amount,
        bankDetail,
        status: 'pending'
      });

      res.status(200).json({
        message: 'Withdrawal request created successfully',
        withdrawal
      });
    } catch (error: any) {
      res.status(500).json({
        message: 'Error creating withdrawal request',
        error: error.message
      });
    }
  },

  async getWithdrawals(req: Request, res: Response): Promise<void> {
    try {
      const withdrawals = await Withdrawal.find({})
        .populate('user', 'username phone balance')
        .populate('bankDetail')
        .sort({ createdAt: -1 });

      res.json({
        message: 'Withdrawals retrieved successfully',
        withdrawals
      });
    } catch (error: any) {
      res.status(500).json({
        message: 'Error retrieving withdrawals',
        error: error.message
      });
    }
  },

  async getWithdrawalsByUser(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.userId || (req.user ? req.user.id : undefined);
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }
      const withdrawals = await Withdrawal.find({ user: userId })
        .populate('bankDetail')
        .sort({ createdAt: -1 });

      res.json({
        message: 'User withdrawals retrieved successfully',
        withdrawals
      });
    } catch (error: any) {
      res.status(500).json({
        message: 'Error retrieving user withdrawals',
        error: error.message
      });
    }
  },

  async acceptWithdrawal(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.body;
      const withdrawal = await Withdrawal.findById(id);

      if (!withdrawal) {
        res.status(404).json({ message: 'Withdrawal not found' });
        return;
      }

      if (withdrawal.status !== 'pending') {
        res.status(400).json({ message: 'Withdrawal already processed' });
        return;
      }

      // Deduct balance from user account
      const user:any = await User.findById(withdrawal.user);
      if (user && user.balance >= withdrawal.amount) {
        user.balance -= withdrawal.amount;
        await user.save();
      } else {
        res.status(400).json({ message: 'Insufficient balance for processing' });
        return;
      }

      withdrawal.status = 'approved';
      withdrawal.processedAt = new Date();
      await withdrawal.save();

      res.json({
        message: 'Withdrawal approved successfully',
        withdrawal
      });
    } catch (error: any) {
      res.status(500).json({
        message: 'Error approving withdrawal',
        error: error.message
      });
    }
  },

  async rejectWithdrawal(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.body;
      const { reason } = req.body;

      const withdrawal = await Withdrawal.findByIdAndUpdate(
        id,
        { 
          status: 'rejected',
          processedAt: new Date(),
          ...(reason && { rejectionReason: reason })
        },
        { new: true }
      );

      if (!withdrawal) {
        res.status(404).json({ message: 'Withdrawal not found' });
        return;
      }

      res.json({
        message: 'Withdrawal rejected successfully',
        withdrawal
      });
    } catch (error: any) {
      res.status(500).json({
        message: 'Error rejecting withdrawal',
        error: error.message
      });
    }
  }
};
