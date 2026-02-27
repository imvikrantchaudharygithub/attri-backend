import { Request, Response } from 'express';
import User from '../models/user.model';
import mongoose from 'mongoose';

const MAX_LEVEL = 7;

interface TreeNode {
  _id: mongoose.Types.ObjectId;
  username: string;
  phone: number;
  balance: number;
  referral_code?: string;
  profileimage?: string;
  level: number;
  children: TreeNode[];
}

const buildTreeRecursive = async (
  userId: string,
  currentLevel: number,
  levelCounts: number[]
): Promise<TreeNode | null> => {
  if (currentLevel > MAX_LEVEL) return null;

  const user = await User.findById(userId).lean();
  if (!user) return null;

  const referralFamily: mongoose.Types.ObjectId[] = (user as any).referralFamily || [];
  const children: TreeNode[] = [];

  for (const childId of referralFamily) {
    const childNode = await buildTreeRecursive(
      childId.toString(),
      currentLevel + 1,
      levelCounts
    );
    if (childNode) {
      children.push(childNode);
      if (currentLevel < MAX_LEVEL) {
        levelCounts[currentLevel] = (levelCounts[currentLevel] || 0) + 1;
      }
    }
  }

  return {
    _id: (user as any)._id,
    username: (user as any).username,
    phone: (user as any).phone,
    balance: (user as any).balance ?? 0,
    referral_code: (user as any).referral_code,
    profileimage: (user as any).profileimage,
    level: currentLevel,
    children,
  };
};

const countTotalInTree = (node: TreeNode): number => {
  let count = 1;
  for (const child of node.children) {
    count += countTotalInTree(child);
  }
  return count;
};

export const getTeamTree = async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.params;

  if (!userId) {
    res.status(400).json({ message: 'User ID is required' });
    return;
  }

  try {
    const user = await User.findById(userId)
      .lean()
      .populate('referral_by', 'username phone _id');

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const levelCounts = new Array(MAX_LEVEL).fill(0);

    const tree = await buildTreeRecursive(userId, 0, levelCounts);
    if (!tree) {
      res.status(500).json({ message: 'Failed to build team tree' });
      return;
    }

    const totalMembers = countTotalInTree(tree);

    const referralBy = (user as any).referral_by;
    const parent =
      Array.isArray(referralBy) && referralBy.length > 0
        ? {
            _id: (referralBy[0] as any)._id,
            username: (referralBy[0] as any).username,
            phone: (referralBy[0] as any).phone,
          }
        : null;

    res.status(200).json({
      user: {
        _id: (user as any)._id,
        username: (user as any).username,
        phone: (user as any).phone,
        balance: (user as any).balance ?? 0,
        referral_code: (user as any).referral_code,
        profileimage: (user as any).profileimage,
      },
      parent,
      tree,
      stats: {
        totalMembers,
        levelCounts: levelCounts,
      },
    });
  } catch (error) {
    console.error('Error fetching team tree:', error);
    res.status(500).json({ message: 'Internal server error', error });
  }
};
