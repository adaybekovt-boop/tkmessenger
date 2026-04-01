"use strict";
// server/src/services/location.service.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setVisibility = exports.getNearbyUsers = exports.updateLocation = void 0;
const redis_1 = __importDefault(require("../redis"));
const prisma_1 = __importDefault(require("../prisma"));
const logger_1 = __importDefault(require("../logger"));
const updateLocation = async (userId, lat, lng) => {
    try {
        // 1. Храним в Redis для быстрого гео-поиска (TTL 5 минут)
        await redis_1.default.geoAdd('user_locations', {
            longitude: lng,
            latitude: lat,
            member: userId
        });
        // Устанавливаем TTL для ключа (5 минут)
        await redis_1.default.expire('user_locations', 300);
        // 2. Обновляем в PostgreSQL для истории
        await prisma_1.default.user.update({
            where: { id: userId },
            data: {
                lastLat: lat,
                lastLng: lng,
                lastLocationAt: new Date()
            }
        });
        logger_1.default.debug(`Location updated for user ${userId}: ${lat}, ${lng}`);
    }
    catch (error) {
        logger_1.default.error('Failed to update location:', error);
        throw error;
    }
};
exports.updateLocation = updateLocation;
const getNearbyUsers = async (lat, lng, radiusKm) => {
    try {
        // Ищем пользователей в радиусе через Redis GEOSEARCH
        const nearbyUserIds = await redis_1.default.geoSearch('user_locations', {
            longitude: lng,
            latitude: lat
        }, {
            radius: radiusKm,
            unit: 'km'
        });
        if (nearbyUserIds.length === 0)
            return [];
        // Получаем данные только тех, у кого включена видимость
        const users = await prisma_1.default.user.findMany({
            where: {
                id: { in: nearbyUserIds },
                isVisibleNearby: true
            },
            select: {
                id: true,
                username: true,
                avatarUrl: true,
                status: true,
                lastLat: true,
                lastLng: true
            }
        });
        // Рассчитываем расстояние для каждого пользователя
        const R = 6371; // Радиус Земли в км
        return users.map((user) => {
            if (user.lastLat && user.lastLng) {
                const dLat = (user.lastLat - lat) * Math.PI / 180;
                const dLng = (user.lastLng - lng) * Math.PI / 180;
                const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                    Math.cos(lat * Math.PI / 180) * Math.cos(user.lastLat * Math.PI / 180) *
                        Math.sin(dLng / 2) * Math.sin(dLng / 2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                const distance = R * c;
                return { ...user, distance: Math.round(distance * 10) / 10 };
            }
            return { ...user, distance: null };
        });
    }
    catch (error) {
        logger_1.default.error('Failed to get nearby users:', error);
        return [];
    }
};
exports.getNearbyUsers = getNearbyUsers;
const setVisibility = async (userId, isVisible) => {
    try {
        await prisma_1.default.user.update({
            where: { id: userId },
            data: { isVisibleNearby: isVisible }
        });
        if (!isVisible) {
            // Если выключил видимость — удаляем из Redis
            await redis_1.default.zRem('user_locations', userId);
            logger_1.default.debug(`User ${userId} removed from location index (visibility off)`);
        }
        else {
            logger_1.default.debug(`User ${userId} is now visible for nearby search`);
        }
    }
    catch (error) {
        logger_1.default.error('Failed to update visibility:', error);
        throw error;
    }
};
exports.setVisibility = setVisibility;
