// GET ?action=url&userId=XXX    → generate eBay OAuth URL
// GET ?action=status&userId=XXX → check eBay connection status
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://hrpzkakrvgigtxtcyjzk.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.account',
  'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.finances',
  'https://api.ebay.com/oauth/api_scope/commerce.identity.readonly',
].join(' ');

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { action, userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  // ── Generate OAuth URL ─────────────────────────────────────────────────────
  if (action === 'url' || !action) {
    const clientId = process.env.EBAY_APP_ID;
    const ruName   = process.env.EBAY_RUNAME;
    if (!clientId || !ruName) return res.status(500).json({ error: 'eBay credentials not configured' });
    const params = new URLSearchParams({ client_id:clientId, response_type:'code', redirect_uri:ruName, scope:SCOPES, state:userId });
    return res.status(200).json({ url: 'https://auth.ebay.com/oauth2/authorize?' + params });
  }

  // ── Check connection status ────────────────────────────────────────────────
  if (action === 'status') {
    const { data } = await supabase
      .from('ebay_tokens')
      .select('ebay_username, ebay_user_id, expires_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (!data) return res.status(200).json({ connected: false });
    return res.status(200).json({
      connected:    true,
      ebayUsername: data.ebay_username || null,
      ebayUserId:   data.ebay_user_id  || null,
      tokenExpired: data.expires_at && new Date(data.expires_at) < new Date(),
    });
  }

  return res.status(400).json({ error: 'Unknown action' });
}
