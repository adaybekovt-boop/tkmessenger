// server/src/controllers/chat.controller.ts

import { Request, Response } from 'express';
import prisma from '../prisma';
import { io } from '../index';

export const getChats = async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  
  const chats = await prisma.chat.findMany({
    where: { members: { some: { userId } } },
    include: {
      members: {
        include: { user: { select: { id: true, username: true, avatarUrl: true, status: true } } }
      },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { sender: { select: { id: true, username: true, avatarUrl: true } } }
      }
    },
    orderBy: { updatedAt: 'desc' }
  });
  
  res.json(chats);
};

export const createChat = async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const { name, isGroup, memberIds } = req.body;
  
  const allMemberIds = [...new Set([userId, ...memberIds])];
  
  const chat = await prisma.chat.create({
    data: {
      name: isGroup ? name : null,
      isGroup,
      members: {
        create: allMemberIds.map((id, index) => ({
          userId: id,
          role: id === userId ? 'admin' : 'member'
        }))
      }
    },
    include: { 
      members: { 
        include: { user: { select: { id: true, username: true, avatarUrl: true, status: true } } } 
      } 
    }
  });
  
  // Notify users via socket
  allMemberIds.forEach((id) => {
    io.to(`user:${id}`).emit('new_chat', chat);
  });
  
  res.status(201).json(chat);
};

export const getMessages = async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const { page = 1, limit = 50 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);
  
  const messages = await prisma.message.findMany({
    where: { chatId },
    orderBy: { createdAt: 'desc' },
    skip,
    take: Number(limit),
    include: { sender: { select: { id: true, username: true, avatarUrl: true } } }
  });
  
  res.json(messages.reverse());
};

export const sendMessage = async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const { chatId } = req.params;
  const { content, type = 'text', fileUrl } = req.body;
  
  const message = await prisma.message.create({
    data: { content, type, fileUrl, senderId: userId, chatId },
    include: { sender: { select: { id: true, username: true, avatarUrl: true } } }
  });
  
  // Broadcast to all chat members
  io.to(chatId).emit('new_message', message);
  
  res.status(201).json(message);
};

export const editMessage = async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const { messageId } = req.params;
  const { content } = req.body;
  
  const existingMessage = await prisma.message.findUnique({ where: { id: messageId } });
  if (!existingMessage || existingMessage.senderId !== userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  const message = await prisma.message.update({
    where: { id: messageId },
    data: { content },
    include: { sender: { select: { id: true, username: true, avatarUrl: true } } }
  });
  
  io.to(message.chatId).emit('message_edited', message);
  res.json(message);
};

export const deleteMessage = async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const { messageId } = req.params;
  
  const existingMessage = await prisma.message.findUnique({ where: { id: messageId } });
  if (!existingMessage || existingMessage.senderId !== userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  await prisma.message.delete({ where: { id: messageId } });
  
  io.to(existingMessage.chatId).emit('message_deleted', { messageId });
  res.json({ message: 'Deleted successfully' });
};