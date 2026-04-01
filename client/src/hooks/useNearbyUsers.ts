// client/src/hooks/useNearbyUsers.ts

import { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';

interface NearbyUser {
  id: string;
  username: string;
  avatarUrl: string | null;
  status: string;
  lastLat: number | null;
  lastLng: number | null;
  distance: number | null;
}

export const useNearbyUsers = (radius = 5) => {
  const [nearbyUsers, setNearbyUsers] = useState<NearbyUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNearby = useCallback(async (lat: number, lng: number) => {
    setIsLoading(true);
    try {
      const { data } = await api.get(`/location/nearby?lat=${lat}&lng=${lng}&radius=${radius}`);
      setNearbyUsers(data);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch nearby users');
      console.error('Failed to fetch nearby users:', err);
    } finally {
      setIsLoading(false);
    }
  }, [radius]);

  const updatePosition = useCallback(async (lat: number, lng: number) => {
    try {
      await api.post('/location/update', { lat, lng });
    } catch (err) {
      console.error('Failed to update location:', err);
    }
  }, []);

  const refresh = useCallback(() => {
    navigator.geolocation.getCurrentPosition((pos) => {
      fetchNearby(pos.coords.latitude, pos.coords.longitude);
    }, (err) => {
      setError(err.message);
    });
  }, [fetchNearby]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    let watchId: number;

    const startWatching = () => {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          updatePosition(latitude, longitude);
          fetchNearby(latitude, longitude);
        },
        (err) => setError(err.message),
        { 
          enableHighAccuracy: false, 
          timeout: 30000, 
          maximumAge: 60000 
        }
      );
    };

    startWatching();

    return () => {
      if (watchId) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [fetchNearby, updatePosition]);

  return { nearbyUsers, isLoading, error, refresh };
};