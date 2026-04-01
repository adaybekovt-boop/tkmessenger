// server/src/services/location.service.ts

import redis from '../redis';
import prisma from '../prisma';
import logger from '../logger';

export const updateLocation = async (userId: string, lat: number, lng: number) => {
  try {
    // 1. Храним в Redis для быстрого гео-поиска (TTL 5 минут)
    await redis.geoAdd('user_locations', {
      longitude: lng,
      latitude: lat,
      member: userId
    });
    
    // Устанавливаем TTL для ключа (5 минут)
    await redis.expire('user_locations', 300);
    
    // 2. Обновляем в PostgreSQL для истории
    await prisma.user.update({
      where: { id: userId },
      data: {
        lastLat: lat,
        lastLng: lng,
        lastLocationAt: new Date()
      }
    });
    
    logger.debug(`Location updated for user ${userId}: ${lat}, ${lng}`);
  } catch (error) {
    logger.error('Failed to update location:', error);
    throw error;
  }
};

export const getNearbyUsers = async (lat: number, lng: number, radiusKm: number) => {
  try {
    // Ищем пользователей в радиусе через Redis GEOSEARCH
    const nearbyUserIds = await redis.geoSearch('user_locations', {
      longitude: lng,
      latitude: lat
    }, {
      radius: radiusKm,
      unit: 'km'
    });
    
    if (nearbyUserIds.length === 0) return [];
    
    // Получаем данные только тех, у кого включена видимость
    const users = await prisma.user.findMany({
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
    return users.map(user => {
      if (user.lastLat && user.lastLng) {
        const dLat = (user.lastLat - lat) * Math.PI / 180;
        const dLng = (user.lastLng - lng) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat * Math.PI / 180) * Math.cos(user.lastLat * Math.PI / 180) *
                  Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c;
        return { ...user, distance: Math.round(distance * 10) / 10 };
      }
      return { ...user, distance: null };
    });
  } catch (error) {
    logger.error('Failed to get nearby users:', error);
    return [];
  }
};

export const setVisibility = async (userId: string, isVisible: boolean) => {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { isVisibleNearby: isVisible }
    });
    
    if (!isVisible) {
      // Если выключил видимость — удаляем из Redis
      await redis.zRem('user_locations', userId);
      logger.debug(`User ${userId} removed from location index (visibility off)`);
    } else {
      logger.debug(`User ${userId} is now visible for nearby search`);
    }
  } catch (error) {
    logger.error('Failed to update visibility:', error);
    throw error;
  }
};