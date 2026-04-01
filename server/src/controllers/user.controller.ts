import { Request, Response } from 'express';
import prisma from '../prisma';

export const getMe = async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, email: true, avatarUrl: true, status: true }
  });
  
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
};

export const searchUsers = async (req: Request, res: Response) => {
  const query = req.query.q as string;
  if (!query) return res.status(400).json({ error: 'Search query is required' });
  
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { username: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } }
      ]
    },
    select: { id: true, username: true, email: true, avatarUrl: true, status: true }
  });
  
  res.json(users);
};

export const updateProfile = async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const { username, avatarUrl, status } = req.body;
  
  const user = await prisma.user.update({
    where: { id: userId },
    data: { username, avatarUrl, status },
    select: { id: true, username: true, email: true, avatarUrl: true, status: true }
  });
  
  res.json(user);
};
