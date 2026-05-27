import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://hrpzkakrvgigtxtcyjzk.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.query;
  if (!email) {
    return res.status(400).json({ error: 'Missing email' });
  }

  const { data, error } = await supabase
    .from('subscriptions')
    .select('status, ends_at, ls_customer_id')
    .eq('email', email.toLowerCase())
    .maybeSingle();

  if (error) {
    console.error('Supabase error:', error);
    // Fail open — don't block users if DB has an issue
    return res.status(200).json({ status: 'active', error: true });
  }

  // No record found — new user whose webhook may not have fired yet
  // Treat as active (grace period — Lemon Squeezy sends webhook within seconds of payment)
  if (!data) {
    return res.status(200).json({ status: 'active', grace: true });
  }

  return res.status(200).json({
    status: data.status,
    endsAt: data.ends_at,
    customerId: data.ls_customer_id,
  });
}
