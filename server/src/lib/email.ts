import sgMail from '@sendgrid/mail';

const apiKey = process.env['SENDGRID_API_KEY'];
const fromEmail = process.env['SENDGRID_FROM_EMAIL'];

if (apiKey) sgMail.setApiKey(apiKey);

export async function sendPodNotification(
  parcelId: string,
  customerName: string,
  deliveredAt: string,
  photoUrls: string[],
  notifyEmails: string[],
): Promise<void> {
  if (!apiKey || !fromEmail) {
    console.warn('[email] SENDGRID_API_KEY or SENDGRID_FROM_EMAIL not set — skipping email');
    return;
  }
  if (notifyEmails.length === 0) {
    console.log('[email] No notify_emails on parcel — skipping');
    return;
  }

  const time = new Date(deliveredAt).toLocaleString('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Johannesburg',
  });

  const photosHtml = photoUrls.length > 0
    ? photoUrls.map(url => `<a href="${url}" style="display:inline-block;margin:4px"><img src="${url}" width="160" style="border-radius:6px;display:block" /></a>`).join('')
    : '<p style="color:#666">No photos attached.</p>';

  const html = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
  <h2 style="color:#16a34a">POD Confirmed — ${parcelId}</h2>
  <p><strong>Customer:</strong> ${customerName}</p>
  <p><strong>Delivered:</strong> ${time}</p>
  <div style="margin-top:16px">${photosHtml}</div>
</div>`;

  console.log(`[email] Sending POD notification for ${parcelId} to:`, notifyEmails);
  await sgMail.sendMultiple({
    to: notifyEmails,
    from: fromEmail,
    subject: `POD Confirmed — ${parcelId} (${customerName})`,
    html,
  });
}
