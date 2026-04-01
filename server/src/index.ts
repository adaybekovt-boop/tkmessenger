// server/src/index.ts

import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import router from './routes';
import prisma from './prisma';
import logger from './logger';
import { connectRedis } from './redis';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// Routes
app.use('/api', router);

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Хранилище активных сокетов для управления статусами
const userSockets = new Map<string, string>(); // userId -> socketId

io.on('connection', (socket) => {
  const userId = socket.handshake.query.userId as string;
  if (userId) {
    userSockets.set(userId, socket.id);
    logger.info(`User connected: ${userId} (${socket.id})`);
    
    // Ставим статус online
    prisma.user.update({ 
      where: { id: userId }, 
      data: { status: 'online' } 
    }).catch((err: any) => logger.error('Failed to update user status', err));
    
    io.emit('user_status_change', { userId, status: 'online' });
    
    // Присоединяемся к комнате пользователя для приватных сообщений
    socket.join(`user:${userId}`);
  }

  // Обработка звонков (WebRTC Signaling)
  socket.on('call_invite', (data: { targetUserId: string, offer: any, callId: string, isVideo: boolean }) => {
    logger.info(`Call invite from ${userId} to ${data.targetUserId}`);
    io.to(`user:${data.targetUserId}`).emit('incoming_call', {
      fromUserId: userId,
      offer: data.offer,
      callId: data.callId,
      isVideo: data.isVideo
    });
  });

  socket.on('call_answer', (data: { targetUserId: string, answer: any, callId: string }) => {
    logger.info(`Call answer from ${userId} to ${data.targetUserId}`);
    io.to(`user:${data.targetUserId}`).emit('call_answered', { 
      answer: data.answer, 
      callId: data.callId,
      fromUserId: userId
    });
  });

  socket.on('ice_candidate', (data: { targetUserId: string, candidate: any, callId: string }) => {
    io.to(`user:${data.targetUserId}`).emit('ice_candidate', { 
      candidate: data.candidate, 
      callId: data.callId,
      fromUserId: userId
    });
  });

  socket.on('hangup', (data: { targetUserId: string, callId: string }) => {
    logger.info(`Hangup from ${userId} to ${data.targetUserId}`);
    io.to(`user:${data.targetUserId}`).emit('call_ended', { 
      callId: data.callId,
      fromUserId: userId
    });
  });

  socket.on('disconnect', () => {
    if (userId) {
      userSockets.delete(userId);
      logger.info(`User disconnected: ${userId}`);
      
      // Ставим статус offline с задержкой (на случай перезагрузки страницы)
      setTimeout(() => {
        if (!userSockets.has(userId)) {
          prisma.user.update({ 
            where: { id: userId }, 
            data: { status: 'offline' } 
          }).catch(() => {});
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
    await connectRedis();
    server.listen(PORT, () => {
      logger.info(`🚀 Server is running on port ${PORT}`);
      logger.info(`📡 WebSocket server ready`);
      logger.info(`🗄️ Redis connected`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

export { io, logger };