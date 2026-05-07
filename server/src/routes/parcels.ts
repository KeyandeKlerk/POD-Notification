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

function sanitizeEmails(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e: unknown) => (typeof e === 'string' ? e.trim() : ''))
    .filter(Boolean);
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
  const { id, customer_name, assigned_courier_id, pieces, notify_emails } = req.body;
  if (!id || !customer_name) {
    res.status(400).json({ error: 'Invoice number and customer name are required' });
    return;
  }
  const { data, error } = await supabase
    .from('parcels')
    .insert({
      id,
      customer_name,
      pieces: pieces ? parseInt(pieces, 10) : 1,
      assigned_courier_id: assigned_courier_id ? parseInt(assigned_courier_id, 10) : null,
      notify_emails: sanitizeEmails(notify_emails),
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

router.patch('/:id', requireAdmin, async (req, res) => {
  const { data: existing, error: fetchErr } = await supabase
    .from('parcels').select('status').eq('id', req.params['id']).single();
  if (fetchErr || !existing) { res.status(404).json({ error: 'Not found' }); return; }
  if (existing.status !== 'pending') {
    res.status(409).json({ error: 'This delivery has already been confirmed and can no longer be edited' }); return;
  }

  const { customer_name, pieces, assigned_courier_id, notify_emails } = req.body;
  const updates: Record<string, unknown> = {};
  if (customer_name !== undefined) updates['customer_name'] = customer_name;
  if (pieces !== undefined) updates['pieces'] = parseInt(pieces, 10);
  if (assigned_courier_id !== undefined) {
    updates['assigned_courier_id'] = assigned_courier_id ? parseInt(assigned_courier_id, 10) : null;
  }
  if (notify_emails !== undefined) updates['notify_emails'] = sanitizeEmails(notify_emails);

  const { data, error } = await supabase
    .from('parcels')
    .update(updates)
    .eq('id', req.params['id'])
    .select('*, pod_photos(photo_path)')
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(withPhotos(data));
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const { data: existing, error: fetchErr } = await supabase
    .from('parcels').select('status').eq('id', req.params['id']).single();
  if (fetchErr || !existing) { res.status(404).json({ error: 'Not found' }); return; }
  if (existing.status !== 'pending') {
    res.status(409).json({ error: 'Only pending deliveries can be deleted' }); return;
  }

  const { error } = await supabase.from('parcels').delete().eq('id', req.params['id']);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ ok: true });
});

export default router;
