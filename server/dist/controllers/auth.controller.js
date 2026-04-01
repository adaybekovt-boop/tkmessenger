"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logout = exports.refresh = exports.login = exports.register = void 0;
const zod_1 = require("zod");
const prisma_1 = __importDefault(require("../prisma"));
const password_1 = require("../utils/password");
const jwt_1 = require("../utils/jwt");
const registerSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    username: zod_1.z.string().min(3),
    password: zod_1.z.string().min(6)
});
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string()
});
const register = async (req, res) => {
    try {
        const { email, username, password } = registerSchema.parse(req.body);
        const existingUser = await prisma_1.default.user.findFirst({
            where: { OR: [{ email }, { username }] }
        });
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }
        const hashedPassword = await (0, password_1.hashPassword)(password);
        const user = await prisma_1.default.user.create({
            data: { email, username, password: hashedPassword }
        });
        const accessToken = (0, jwt_1.generateAccessToken)({ userId: user.id });
        const refreshToken = (0, jwt_1.generateRefreshToken)({ userId: user.id });
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });
        res.status(201).json({ user: { id: user.id, username: user.username, email: user.email }, accessToken });
    }
    catch (error) {
        res.status(400).json({ error: 'Invalid registration data' });
    }
};
exports.register = register;
const login = async (req, res) => {
    try {
        const { email, password } = loginSchema.parse(req.body);
        const user = await prisma_1.default.user.findUnique({ where: { email } });
        if (!user || !(await (0, password_1.comparePassword)(password, user.password))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const accessToken = (0, jwt_1.generateAccessToken)({ userId: user.id });
        const refreshToken = (0, jwt_1.generateRefreshToken)({ userId: user.id });
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });
        res.json({ user: { id: user.id, username: user.username, email: user.email }, accessToken });
    }
    catch (error) {
        res.status(400).json({ error: 'Invalid login data' });
    }
};
exports.login = login;
const refresh = async (req, res) => {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken)
        return res.status(401).json({ error: 'No refresh token' });
    const payload = (0, jwt_1.verifyRefreshToken)(refreshToken);
    if (!payload)
        return res.status(401).json({ error: 'Invalid refresh token' });
    const accessToken = (0, jwt_1.generateAccessToken)({ userId: payload.userId });
    res.json({ accessToken });
};
exports.refresh = refresh;
const logout = (req, res) => {
    res.clearCookie('refreshToken');
    res.status(200).json({ message: 'Logged out successfully' });
};
exports.logout = logout;
