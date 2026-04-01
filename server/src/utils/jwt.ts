import jwt, { SignOptions } from 'jsonwebtoken';

interface TokenPayload {
  userId: string;
}

export const generateAccessToken = (payload: TokenPayload): string => {
  const options: SignOptions = {
    expiresIn: (process.env.JWT_ACCESS_EXPIRY || '15m') as any
  };
  return jwt.sign(payload as object, process.env.JWT_ACCESS_SECRET || 'fallback_secret', options);
};

export const generateRefreshToken = (payload: TokenPayload): string => {
  const options: SignOptions = {
    expiresIn: (process.env.JWT_REFRESH_EXPIRY || '7d') as any
  };
  return jwt.sign(payload as object, process.env.JWT_REFRESH_SECRET || 'fallback_secret', options);
};

export const verifyAccessToken = (token: string): TokenPayload | null => {
  try {
    return jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as TokenPayload;
  } catch (error) {
    return null;
  }
};

export const verifyRefreshToken = (token: string): TokenPayload | null => {
  try {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET!) as TokenPayload;
  } catch (error) {
    return null;
  }
};
