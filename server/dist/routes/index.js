"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_controller_1 = require("../controllers/auth.controller");
const user_controller_1 = require("../controllers/user.controller");
const chat_controller_1 = require("../controllers/chat.controller");
const friend_controller_1 = require("../controllers/friend.controller");
const location_controller_1 = require("../controllers/location.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
// Auth
router.post('/auth/register', auth_controller_1.register);
router.post('/auth/login', auth_controller_1.login);
router.post('/auth/refresh', auth_controller_1.refresh);
router.post('/auth/logout', auth_controller_1.logout);
// Users
router.get('/users/me', auth_middleware_1.authMiddleware, user_controller_1.getMe);
router.get('/users/search', auth_middleware_1.authMiddleware, user_controller_1.searchUsers);
router.patch('/users/profile', auth_middleware_1.authMiddleware, user_controller_1.updateProfile);
// Friends
router.get('/friends', auth_middleware_1.authMiddleware, friend_controller_1.getFriends);
router.post('/friends/request', auth_middleware_1.authMiddleware, friend_controller_1.sendFriendRequest);
router.post('/friends/accept', auth_middleware_1.authMiddleware, friend_controller_1.acceptFriendRequest);
// Chats
router.get('/chats', auth_middleware_1.authMiddleware, chat_controller_1.getChats);
router.post('/chats', auth_middleware_1.authMiddleware, chat_controller_1.createChat);
router.get('/chats/:chatId/messages', auth_middleware_1.authMiddleware, chat_controller_1.getMessages);
router.post('/chats/:chatId/messages', auth_middleware_1.authMiddleware, chat_controller_1.sendMessage);
router.patch('/messages/:messageId', auth_middleware_1.authMiddleware, chat_controller_1.editMessage);
router.delete('/messages/:messageId', auth_middleware_1.authMiddleware, chat_controller_1.deleteMessage);
// Location
router.post('/location/update', auth_middleware_1.authMiddleware, location_controller_1.updateMyLocation);
router.get('/location/nearby', auth_middleware_1.authMiddleware, location_controller_1.findNearby);
router.put('/location/visibility', auth_middleware_1.authMiddleware, location_controller_1.updateVisibility);
exports.default = router;
