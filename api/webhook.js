import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Disable Vercel's automatic body parsing so we can verify the raw signature
export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

const supabase = createClient(
  'https://hrpzkakrvgigtxtcyjzk.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawBody = await getRawBody(req);
  const signature = req.headers['x-signature'];
  const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;

  if (!signature || !secret) {
    return res.status(401).json({ error: 'Missing signature or secret' });
  }

  // Verify the webhook came from Lemon Squeezy
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(rawBody).digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature))) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const payload = JSON.parse(rawBody.toString());
  const { meta, data } = payload;
  const eventName = meta?.event_name;

  // Only handle subscription events
  if (!eventName?.startsWith('subscription_')) {
    return res.status(200).json({ received: true });
  }

  const attrs = data?.attributes;
  const email = attrs?.user_email;
  const lsStatus = attrs?.status;
  const subscriptionId = data?.id?.toString();
  const customerId = attrs?.customer_id?.toString();
  const endsAt = attrs?.ends_at || attrs?.trial_ends_at || null;

  if (!email) {
    return res.status(400).json({ error: 'No email in payload' });
  }

  // Map Lemon Squeezy status to our app status
  let appStatus;
  switch (lsStatus) {
    case 'active':
    case 'on_trial':
    case 'trialing':
    case 'paused':
      appStatus = 'active';
      break;
    case 'cancelled':
      // Cancelled but still has access until period ends
      appStatus = 'cancelled';
      break;
    case 'expired':
    case 'unpaid':
    case 'past_due':
      appStatus = 'expired';
      break;
    default:
      appStatus = 'active';
  }

  const { error } = await supabase.from('subscriptions').upsert({
    email,
    status: appStatus,
    ls_subscription_id: subscriptionId,
    ls_customer_id: customerId,
    ends_at: endsAt,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'email' });

  if (error) {
    console.error('Supabase error:', error);
    return res.status(500).json({ error: 'Database error' });
  }

  console.log(`[webhook] ${eventName} → ${email} → ${appStatus}`);
  return res.status(200).json({ success: true });
}
