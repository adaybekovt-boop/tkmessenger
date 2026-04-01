"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.acceptFriendRequest = exports.sendFriendRequest = exports.getFriends = void 0;
const prisma_1 = __importDefault(require("../prisma"));
const getFriends = async (req, res) => {
    const userId = req.user.userId;
    const friendships = await prisma_1.default.friendship.findMany({
        where: { OR: [{ userId }, { friendId: userId }] },
        include: {
            user: { select: { id: true, username: true, avatarUrl: true, status: true } },
            friend: { select: { id: true, username: true, avatarUrl: true, status: true } }
        }
    });
    res.json(friendships);
};
exports.getFriends = getFriends;
const sendFriendRequest = async (req, res) => {
    const userId = req.user.userId;
    const { friendId } = req.body;
    if (userId === friendId)
        return res.status(400).json({ error: 'Cannot add yourself' });
    const existing = await prisma_1.default.friendship.findUnique({
        where: { userId_friendId: { userId, friendId } }
    });
    if (existing)
        return res.status(400).json({ error: 'Already friend or requested' });
    const friendship = await prisma_1.default.friendship.create({
        data: { userId, friendId, status: 'pending' }
    });
    res.status(201).json(friendship);
};
exports.sendFriendRequest = sendFriendRequest;
const acceptFriendRequest = async (req, res) => {
    const userId = req.user.userId;
    const { requestId } = req.body;
    const friendship = await prisma_1.default.friendship.update({
        where: { id: requestId },
        data: { status: 'accepted' }
    });
    res.json(friendship);
};
exports.acceptFriendRequest = acceptFriendRequest;
