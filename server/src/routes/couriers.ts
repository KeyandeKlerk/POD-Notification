import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { supabase } from '../lib/supabase.js';
import { requireAdmin } from '../middleware.js';

const router = Router();

router.get('/', requireAdmin, async (_req, res) => {
  const { data, error } = await supabase
    .from('couriers')
    .select('id, username, name, active')
    .order('name');
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

router.post('/', requireAdmin, async (req, res) => {
  const { username, name, password } = req.body;
  if (!username || !name || !password) {
    res.status(400).json({ error: 'username, name, and password are required' }); return;
  }
  const hash = await bcrypt.hash(password, 10);
  const { data, error } = await supabase
    .from('couriers')
    .insert({ username, name, password_hash: hash })
    .select('id, username, name, active')
    .single();
  if (error) {
    res.status(error.code === '23505' ? 409 : 500).json({
      error: error.code === '23505' ? 'Username already exists' : error.message,
    });
    return;
  }
  res.status(201).json(data);
});

router.patch('/:id/active', requireAdmin, async (req, res) => {
  const { data: courier, error: fetchErr } = await supabase
    .from('couriers').select('active').eq('id', req.params['id']).single();
  if (fetchErr || !courier) { res.status(404).json({ error: 'Not found' }); return; }
  const newActive = courier.active ? 0 : 1;
  await supabase.from('couriers').update({ active: newActive }).eq('id', req.params['id']);
  res.json({ active: !!newActive });
});

export default router;
