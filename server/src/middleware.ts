import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface UserPayload {
  role: 'admin' | 'courier';
  courierId?: number;
  courierName?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: UserPayload;
    }
  }
}

function getUser(req: Request): UserPayload | null {
  try {
    const token = (req as any).cookies?.token;
    if (!token) return null;
    return jwt.verify(token, process.env['JWT_SECRET'] ?? 'dev-secret') as UserPayload;
  } catch {
    return null;
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = getUser(req);
  if (user?.role === 'admin') { req.user = user; return next(); }
  res.status(401).json({ error: 'Unauthorized' });
}

export function requireCourier(req: Request, res: Response, next: NextFunction): void {
  const user = getUser(req);
  if (user?.role === 'courier') { req.user = user; return next(); }
  res.status(401).json({ error: 'Unauthorized' });
}

export { getUser };
