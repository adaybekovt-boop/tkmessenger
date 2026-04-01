"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyRefreshToken = exports.verifyAccessToken = exports.generateRefreshToken = exports.generateAccessToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const generateAccessToken = (payload) => {
    const options = {
        expiresIn: (process.env.JWT_ACCESS_EXPIRY || '15m')
    };
    return jsonwebtoken_1.default.sign(payload, process.env.JWT_ACCESS_SECRET || 'fallback_secret', options);
};
exports.generateAccessToken = generateAccessToken;
const generateRefreshToken = (payload) => {
    const options = {
        expiresIn: (process.env.JWT_REFRESH_EXPIRY || '7d')
    };
    return jsonwebtoken_1.default.sign(payload, process.env.JWT_REFRESH_SECRET || 'fallback_secret', options);
};
exports.generateRefreshToken = generateRefreshToken;
const verifyAccessToken = (token) => {
    try {
        return jsonwebtoken_1.default.verify(token, process.env.JWT_ACCESS_SECRET);
    }
    catch (error) {
        return null;
    }
};
exports.verifyAccessToken = verifyAccessToken;
const verifyRefreshToken = (token) => {
    try {
        return jsonwebtoken_1.default.verify(token, process.env.JWT_REFRESH_SECRET);
    }
    catch (error) {
        return null;
    }
};
exports.verifyRefreshToken = verifyRefreshToken;
