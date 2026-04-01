"use strict";
// server/src/controllers/chat.controller.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteMessage = exports.editMessage = exports.sendMessage = exports.getMessages = exports.createChat = exports.getChats = void 0;
const prisma_1 = __importDefault(require("../prisma"));
const index_1 = require("../index");
const getChats = async (req, res) => {
    const userId = req.user.userId;
    const chats = await prisma_1.default.chat.findMany({
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
exports.getChats = getChats;
const createChat = async (req, res) => {
    const userId = req.user.userId;
    const { name, isGroup, memberIds } = req.body;
    const allMemberIds = [...new Set([userId, ...memberIds])];
    const chat = await prisma_1.default.chat.create({
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
        index_1.io.to(`user:${id}`).emit('new_chat', chat);
    });
    res.status(201).json(chat);
};
exports.createChat = createChat;
const getMessages = async (req, res) => {
    const { chatId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const messages = await prisma_1.default.message.findMany({
        where: { chatId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit),
        include: { sender: { select: { id: true, username: true, avatarUrl: true } } }
    });
    res.json(messages.reverse());
};
exports.getMessages = getMessages;
const sendMessage = async (req, res) => {
    const userId = req.user.userId;
    const { chatId } = req.params;
    const { content, type = 'text', fileUrl } = req.body;
    const message = await prisma_1.default.message.create({
        data: { content, type, fileUrl, senderId: userId, chatId },
        include: { sender: { select: { id: true, username: true, avatarUrl: true } } }
    });
    // Broadcast to all chat members
    index_1.io.to(chatId).emit('new_message', message);
    res.status(201).json(message);
};
exports.sendMessage = sendMessage;
const editMessage = async (req, res) => {
    const userId = req.user.userId;
    const { messageId } = req.params;
    const { content } = req.body;
    const existingMessage = await prisma_1.default.message.findUnique({ where: { id: messageId } });
    if (!existingMessage || existingMessage.senderId !== userId) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    const message = await prisma_1.default.message.update({
        where: { id: messageId },
        data: { content },
        include: { sender: { select: { id: true, username: true, avatarUrl: true } } }
    });
    index_1.io.to(message.chatId).emit('message_edited', message);
    res.json(message);
};
exports.editMessage = editMessage;
const deleteMessage = async (req, res) => {
    const userId = req.user.userId;
    const { messageId } = req.params;
    const existingMessage = await prisma_1.default.message.findUnique({ where: { id: messageId } });
    if (!existingMessage || existingMessage.senderId !== userId) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    await prisma_1.default.message.delete({ where: { id: messageId } });
    index_1.io.to(existingMessage.chatId).emit('message_deleted', { messageId });
    res.json({ message: 'Deleted successfully' });
};
exports.deleteMessage = deleteMessage;
