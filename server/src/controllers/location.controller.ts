import { Request, Response } from 'express';
import { updateLocation, getNearbyUsers, setVisibility } from '../services/location.service';

export const updateMyLocation = async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const { lat, lng } = req.body;
  
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'Lat/lng must be numbers' });
  }
  
  await updateLocation(userId, lat, lng);
  res.status(200).json({ status: 'ok' });
};

export const findNearby = async (req: Request, res: Response) => {
  const { lat, lng, radius = 5 } = req.query;
  
  const users = await getNearbyUsers(
    Number(lat), 
    Number(lng), 
    Number(radius)
  );
  
  res.json(users);
};

export const updateVisibility = async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const { isVisible } = req.body;
  
  await setVisibility(userId, isVisible);
  res.status(200).json({ status: 'ok' });
};
