import { Request, Response } from 'express';
import prisma from '../prisma';

export const getFriends = async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  
  const friendships = await prisma.friendship.findMany({
    where: { OR: [{ userId }, { friendId: userId }] },
    include: {
      user: { select: { id: true, username: true, avatarUrl: true, status: true } },
      friend: { select: { id: true, username: true, avatarUrl: true, status: true } }
    }
  });
  
  res.json(friendships);
};

export const sendFriendRequest = async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const { friendId } = req.body;
  
  if (userId === friendId) return res.status(400).json({ error: 'Cannot add yourself' });
  
  const existing = await prisma.friendship.findUnique({
    where: { userId_friendId: { userId, friendId } }
  });
  
  if (existing) return res.status(400).json({ error: 'Already friend or requested' });
  
  const friendship = await prisma.friendship.create({
    data: { userId, friendId, status: 'pending' }
  });
  
  res.status(201).json(friendship);
};

export const acceptFriendRequest = async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const { requestId } = req.body;
  
  const friendship = await prisma.friendship.update({
    where: { id: requestId },
    data: { status: 'accepted' }
  });
  
  res.json(friendship);
};
