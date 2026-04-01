"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateProfile = exports.searchUsers = exports.getMe = void 0;
const prisma_1 = __importDefault(require("../prisma"));
const getMe = async (req, res) => {
    const userId = req.user.userId;
    const user = await prisma_1.default.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, email: true, avatarUrl: true, status: true }
    });
    if (!user)
        return res.status(404).json({ error: 'User not found' });
    res.json(user);
};
exports.getMe = getMe;
const searchUsers = async (req, res) => {
    const query = req.query.q;
    if (!query)
        return res.status(400).json({ error: 'Search query is required' });
    const users = await prisma_1.default.user.findMany({
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
exports.searchUsers = searchUsers;
const updateProfile = async (req, res) => {
    const userId = req.user.userId;
    const { username, avatarUrl, status } = req.body;
    const user = await prisma_1.default.user.update({
        where: { id: userId },
        data: { username, avatarUrl, status },
        select: { id: true, username: true, email: true, avatarUrl: true, status: true }
    });
    res.json(user);
};
exports.updateProfile = updateProfile;
