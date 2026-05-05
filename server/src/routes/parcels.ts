import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { requireAdmin } from '../middleware.js';

const router = Router();

function withPhotos(p: any) {
  return {
    ...p,
    photos: (p.pod_photos as any[])?.map((ph: any) => ph.photo_path) ?? [],
    pod_photos: undefined,
  };
}

router.get('/', requireAdmin, async (req, res) => {
  const { status } = req.query;
  let query = supabase.from('parcels').select('*, pod_photos(photo_path)');
  if (status && typeof status === 'string') query = query.eq('status', status);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json((data ?? []).map(withPhotos));
});

router.post('/', requireAdmin, async (req, res) => {
  const { id, customer_name, customer_email, customer_phone, address, description, pieces, amount, assigned_courier_id } = req.body;
  if (!id || !customer_name) {
    res.status(400).json({ error: 'Invoice number and customer name are required' });
    return;
  }
  const { data, error } = await supabase
    .from('parcels')
    .insert({
      id,
      customer_name,
      customer_email: customer_email || null,
      customer_phone: customer_phone || null,
      address: address || null,
      description: description || null,
      pieces: pieces ? parseInt(pieces, 10) : 1,
      amount: amount ? parseFloat(amount) : null,
      assigned_courier_id: assigned_courier_id ? parseInt(assigned_courier_id, 10) : null,
    })
    .select()
    .single();

  if (error) {
    res.status(error.code === '23505' ? 409 : 500).json({
      error: error.code === '23505' ? 'Invoice number already exists' : error.message,
    });
    return;
  }
  res.status(201).json({ ...data, photos: [] });
});

router.get('/:id', requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('parcels')
    .select('*, pod_photos(photo_path)')
    .eq('id', req.params['id'])
    .single();
  if (error || !data) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(withPhotos(data));
});

router.patch('/:id/status', requireAdmin, async (req, res) => {
  const { status } = req.body;
  if (!['pending', 'delivered', 'paid'].includes(status)) {
    res.status(400).json({ error: 'Invalid status' }); return;
  }
  const { error } = await supabase.from('parcels').update({ status }).eq('id', req.params['id']);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ ok: true });
});

export default router;
