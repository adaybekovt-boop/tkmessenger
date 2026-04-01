"use strict";
// server/src/index.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.io = void 0;
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const dotenv_1 = __importDefault(require("dotenv"));
const routes_1 = __importDefault(require("./routes"));
const prisma_1 = __importDefault(require("./prisma"));
const logger_1 = __importDefault(require("./logger"));
exports.logger = logger_1.default;
const redis_1 = require("./redis");
dotenv_1.default.config();
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: process.env.CLIENT_URL || 'http://localhost:5173',
        methods: ['GET', 'POST'],
        credentials: true
    }
});
exports.io = io;
// Middleware
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use((0, cors_1.default)({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true
}));
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '50mb' }));
app.use((0, cookie_parser_1.default)());
// Routes
app.use('/api', routes_1.default);
// Health Check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Хранилище активных сокетов для управления статусами
const userSockets = new Map(); // userId -> socketId
io.on('connection', (socket) => {
    const userId = socket.handshake.query.userId;
    if (userId) {
        userSockets.set(userId, socket.id);
        logger_1.default.info(`User connected: ${userId} (${socket.id})`);
        // Ставим статус online
        prisma_1.default.user.update({
            where: { id: userId },
            data: { status: 'online' }
        }).catch((err) => logger_1.default.error('Failed to update user status', err));
        io.emit('user_status_change', { userId, status: 'online' });
        // Присоединяемся к комнате пользователя для приватных сообщений
        socket.join(`user:${userId}`);
    }
    // Обработка звонков (WebRTC Signaling)
    socket.on('call_invite', (data) => {
        logger_1.default.info(`Call invite from ${userId} to ${data.targetUserId}`);
        io.to(`user:${data.targetUserId}`).emit('incoming_call', {
            fromUserId: userId,
            offer: data.offer,
            callId: data.callId,
            isVideo: data.isVideo
        });
    });
    socket.on('call_answer', (data) => {
        logger_1.default.info(`Call answer from ${userId} to ${data.targetUserId}`);
        io.to(`user:${data.targetUserId}`).emit('call_answered', {
            answer: data.answer,
            callId: data.callId,
            fromUserId: userId
        });
    });
    socket.on('ice_candidate', (data) => {
        io.to(`user:${data.targetUserId}`).emit('ice_candidate', {
            candidate: data.candidate,
            callId: data.callId,
            fromUserId: userId
        });
    });
    socket.on('hangup', (data) => {
        logger_1.default.info(`Hangup from ${userId} to ${data.targetUserId}`);
        io.to(`user:${data.targetUserId}`).emit('call_ended', {
            callId: data.callId,
            fromUserId: userId
        });
    });
    socket.on('disconnect', () => {
        if (userId) {
            userSockets.delete(userId);
            logger_1.default.info(`User disconnected: ${userId}`);
            // Ставим статус offline с задержкой (на случай перезагрузки страницы)
            setTimeout(() => {
                if (!userSockets.has(userId)) {
                    prisma_1.default.user.update({
                        where: { id: userId },
                        data: { status: 'offline' }
                    }).catch(() => { });
                    io.emit('user_status_change', { userId, status: 'offline' });
                }
            }, 5000);
        }
    });
});
const PORT = process.env.PORT || 4000;
// Connect to Redis before starting server
const startServer = async () => {
    try {
        await (0, redis_1.connectRedis)();
        server.listen(PORT, () => {
            logger_1.default.info(`🚀 Server is running on port ${PORT}`);
            logger_1.default.info(`📡 WebSocket server ready`);
            logger_1.default.info(`🗄️ Redis connected`);
        });
    }
    catch (error) {
        logger_1.default.error('Failed to start server:', error);
        process.exit(1);
    }
};
startServer();
process.on('unhandledRejection', (reason, promise) => {
    logger_1.default.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (error) => {
    logger_1.default.error('Uncaught Exception:', error);
    process.exit(1);
});
