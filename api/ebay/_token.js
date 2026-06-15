/**
 * Shared eBay token utilities.
 * Files starting with _ in api/ are NOT treated as Vercel endpoints.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://hrpzkakrvgigtxtcyjzk.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const EBAY_API      = 'https://api.ebay.com';
export const MARKETPLACE_ID = 'EBAY_GB';

export function ebayHeaders(token, extra = {}) {
  return {
    'Authorization':           `Bearer ${token}`,
    'Content-Type':            'application/json',
    'X-EBAY-C-MARKETPLACE-ID': MARKETPLACE_ID,
    'Accept-Language':         'en-GB',
    'Content-Language':        'en-GB',
    ...extra,
  };
}

// ── Application token (client credentials grant) ──────────────────────────────
let _appToken  = null;
let _appExpiry = 0;

export async function getAppToken() {
  if (_appToken && Date.now() < _appExpiry - 60000) return _appToken;
  const creds = Buffer.from(`${process.env.EBAY_APP_ID}:${process.env.EBAY_CERT_ID}`).toString('base64');
  const res   = await fetch(`${EBAY_API}/identity/v1/oauth2/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${creds}` },
    body:    new URLSearchParams({ grant_type: 'client_credentials', scope: 'https://api.ebay.com/oauth/api_scope' }),
  });
  if (!res.ok) throw new Error(`App token failed: ${await res.text()}`);
  const d   = await res.json();
  _appToken  = d.access_token;
  _appExpiry = Date.now() + (d.expires_in || 7200) * 1000;
  return _appToken;
}

// ── User token (authorization code grant with automatic refresh) ───────────────
const USER_SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.account',
  'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.finances',
  'https://api.ebay.com/oauth/api_scope/commerce.identity.readonly',
].join(' ');

export async function getUserToken(userId) {
  const { data, error } = await supabase
    .from('ebay_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    throw new Error('No eBay account connected. Please connect your eBay account in My Account.');
  }

  // Still valid
  if (Date.now() < new Date(data.expires_at).getTime() - 300000) return data.access_token;

  // Refresh
  const creds = Buffer.from(`${process.env.EBAY_APP_ID}:${process.env.EBAY_CERT_ID}`).toString('base64');
  const res   = await fetch(`${EBAY_API}/identity/v1/oauth2/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${creds}` },
    body:    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: data.refresh_token, scope: USER_SCOPES }),
  });

  if (!res.ok) {
    throw new Error('eBay token expired and refresh failed. Please reconnect your eBay account in My Account.');
  }

  const t         = await res.json();
  const expiresAt = new Date(Date.now() + t.expires_in * 1000).toISOString();
  await supabase.from('ebay_tokens').update({
    access_token: t.access_token,
    expires_at:   expiresAt,
    updated_at:   new Date().toISOString(),
  }).eq('user_id', userId);

  return t.access_token;
}
