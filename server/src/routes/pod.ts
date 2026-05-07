import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { supabase } from '../lib/supabase.js';
import { requireCourier } from '../middleware.js';
import { sendPodNotification } from '../lib/email.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  },
});

router.get('/deliveries', requireCourier, async (req, res) => {
  const { courierId } = req.user!;
  const { search } = req.query;
  let query = supabase
    .from('parcels')
    .select('*')
    .eq('assigned_courier_id', courierId!)
    .eq('status', 'pending');
  if (search && typeof search === 'string') query = query.ilike('id', `%${search}%`);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

router.post('/:id/confirm', requireCourier, upload.array('photos', 20), async (req, res) => {
  console.log(`[pod] confirm called for parcel ${req.params['id']}`);
  const courierId = req.user!.courierId!;

  // Fetch parcel — verify it exists AND is assigned to this courier
  const { data: parcel, error: fetchErr } = await supabase
    .from('parcels')
    .select('id, status, customer_name, notify_emails')
    .eq('id', req.params['id'])
    .eq('assigned_courier_id', courierId)
    .single();
  if (fetchErr || !parcel) {
    console.log(`[pod] parcel not found or not assigned: ${req.params['id']}`, fetchErr);
    res.status(404).json({ error: 'Delivery not found' });
    return;
  }
  if (parcel.status !== 'pending') {
    console.log(`[pod] parcel ${parcel.id} already confirmed (status: ${parcel.status})`);
    res.status(400).json({ error: 'Delivery already confirmed' });
    return;
  }

  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    res.status(400).json({ error: 'At least one photo is required' }); return;
  }

  const notes = typeof req.body.notes === 'string' ? req.body.notes : '';
  const deliveredAt = new Date().toISOString();

  const photoUrls: string[] = [];
  for (const file of files) {
    const ext = path.extname(file.originalname) || '.jpg';
    const storagePath = `${parcel.id}/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from('pod-photos')
      .upload(storagePath, file.buffer, { contentType: file.mimetype });
    if (uploadErr) { res.status(500).json({ error: 'Photo upload failed' }); return; }
    const { data: { publicUrl } } = supabase.storage.from('pod-photos').getPublicUrl(storagePath);
    photoUrls.push(publicUrl);
  }

  // Atomic update: only succeeds if the parcel is still pending — prevents double-confirm
  const { data: updated, error: updateErr } = await supabase
    .from('parcels')
    .update({ status: 'delivered', delivered_at: deliveredAt, driver_notes: notes })
    .eq('id', parcel.id)
    .eq('status', 'pending')
    .select('id');

  if (updateErr) { res.status(500).json({ error: 'Failed to update delivery status' }); return; }
  if (!updated || updated.length === 0) {
    res.status(400).json({ error: 'Delivery already confirmed' });
    return;
  }

  if (photoUrls.length > 0) {
    await supabase.from('pod_photos').insert(
      photoUrls.map(url => ({ parcel_id: parcel.id, photo_path: url }))
    );
  }

  const notifyEmails: string[] = Array.isArray(parcel.notify_emails) ? parcel.notify_emails : [];
  sendPodNotification(parcel.id, parcel.customer_name, deliveredAt, photoUrls, notifyEmails)
    .catch(err => console.error('[email] Failed to send POD notification:', err));

  res.json({ ok: true });
});

export default router;
