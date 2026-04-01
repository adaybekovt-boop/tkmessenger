"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = void 0;
const jwt_1 = require("../utils/jwt");
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.split(' ')[1];
    const payload = (0, jwt_1.verifyAccessToken)(token);
    if (!payload) {
        return res.status(401).json({ error: 'Invalid access token' });
    }
    req.user = payload;
    next();
};
exports.authMiddleware = authMiddleware;
