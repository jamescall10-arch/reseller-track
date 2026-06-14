import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://hrpzkakrvgigtxtcyjzk.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  const { data, error } = await supabase
    .from('ebay_tokens')
    .select('ebay_username, ebay_user_id, expires_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    return res.status(200).json({ connected: false });
  }

  const tokenExpired = data.expires_at && new Date(data.expires_at) < new Date();

  return res.status(200).json({
    connected:    true,
    ebayUsername: data.ebay_username || null,
    ebayUserId:   data.ebay_user_id  || null,
    tokenExpired,
  });
}
