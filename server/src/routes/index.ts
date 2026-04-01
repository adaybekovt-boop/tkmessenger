import { Router } from 'express';
import { register, login, refresh, logout } from '../controllers/auth.controller';
import { getMe, searchUsers, updateProfile } from '../controllers/user.controller';
import { getChats, createChat, getMessages, sendMessage, editMessage, deleteMessage } from '../controllers/chat.controller';
import { getFriends, sendFriendRequest, acceptFriendRequest } from '../controllers/friend.controller';
import { updateMyLocation, findNearby, updateVisibility } from '../controllers/location.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// Auth
router.post('/auth/register', register);
router.post('/auth/login', login);
router.post('/auth/refresh', refresh);
router.post('/auth/logout', logout);

// Users
router.get('/users/me', authMiddleware, getMe);
router.get('/users/search', authMiddleware, searchUsers);
router.patch('/users/profile', authMiddleware, updateProfile);

// Friends
router.get('/friends', authMiddleware, getFriends);
router.post('/friends/request', authMiddleware, sendFriendRequest);
router.post('/friends/accept', authMiddleware, acceptFriendRequest);

// Chats
router.get('/chats', authMiddleware, getChats);
router.post('/chats', authMiddleware, createChat);
router.get('/chats/:chatId/messages', authMiddleware, getMessages);
router.post('/chats/:chatId/messages', authMiddleware, sendMessage);
router.patch('/messages/:messageId', authMiddleware, editMessage);
router.delete('/messages/:messageId', authMiddleware, deleteMessage);

// Location
router.post('/location/update', authMiddleware, updateMyLocation);
router.get('/location/nearby', authMiddleware, findNearby);
router.put('/location/visibility', authMiddleware, updateVisibility);

export default router;
