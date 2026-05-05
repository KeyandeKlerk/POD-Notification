import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

import { supabase } from './lib/supabase.js';
import { getUser } from './middleware.js';
import parcelsRouter from './routes/parcels.js';
import couriersRouter from './routes/couriers.js';
import podRouter from './routes/pod.js';

const app = express();

app.use(cors({
  origin: process.env['CLIENT_ORIGIN'] ?? 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env['NODE_ENV'] === 'production',
  sameSite: 'lax' as const,
  maxAge: 86_400_000,
};

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!password) { res.status(400).json({ error: 'Password required' }); return; }

  if (!username || username === 'admin') {
    if (password === process.env['ADMIN_PASSWORD']) {
      const token = jwt.sign({ role: 'admin' }, process.env['JWT_SECRET'] ?? 'dev-secret', { expiresIn: '24h' });
      res.cookie('token', token, COOKIE_OPTS);
      res.json({ role: 'admin' });
      return;
    }
  }

  if (username) {
    const { data: courier } = await supabase
      .from('couriers')
      .select('*')
      .eq('username', username)
      .eq('active', 1)
      .single();

    if (courier && await bcrypt.compare(password, courier.password_hash)) {
      const token = jwt.sign(
        { role: 'courier', courierId: courier.id, courierName: courier.name },
        process.env['JWT_SECRET'] ?? 'dev-secret',
        { expiresIn: '24h' },
      );
      res.cookie('token', token, COOKIE_OPTS);
      res.json({ role: 'courier', courierId: courier.id, courierName: courier.name });
      return;
    }
  }

  res.status(401).json({ error: 'Invalid credentials' });
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: 'Not authenticated' }); return; }
  res.json(user);
});

app.use('/api/parcels', parcelsRouter);
app.use('/api/couriers', couriersRouter);
app.use('/api/pod', podRouter);

// Serve built client in local production mode
const clientDist = path.resolve('../dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('/{*path}', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

export default app;
