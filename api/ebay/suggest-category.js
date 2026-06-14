import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://hrpzkakrvgigtxtcyjzk.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getAccessToken(userId) {
  const { data } = await supabase
    .from('ebay_tokens').select('access_token,refresh_token,expires_at')
    .eq('user_id', userId).maybeSingle();
  if (!data) throw new Error('No eBay account connected');
  if (Date.now() < new Date(data.expires_at).getTime() - 300000) return data.access_token;
  const creds = Buffer.from(`${process.env.EBAY_APP_ID}:${process.env.EBAY_CERT_ID}`).toString('base64');
  const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded','Authorization':`Basic ${creds}`},
    body: new URLSearchParams({ grant_type:'refresh_token', refresh_token:data.refresh_token, scope:'https://api.ebay.com/oauth/api_scope' }),
  });
  const t = await r.json();
  await supabase.from('ebay_tokens').update({ access_token:t.access_token, expires_at:new Date(Date.now()+t.expires_in*1000).toISOString(), updated_at:new Date().toISOString() }).eq('user_id', userId);
  return t.access_token;
}

const esc = s => String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const extractAll = (xml, tag) => [...xml.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'g'))].map(m => m[1].trim());
const extractFirst = (xml, tag) => extractAll(xml, tag)[0] || '';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' });
  const { query, userId } = req.body || {};
  if (!query || !userId) return res.status(400).json({ error:'Missing query or userId' });

  try {
    const token = await getAccessToken(userId);

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetSuggestedCategoriesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
  <Query>${esc(query)}</Query>
</GetSuggestedCategoriesRequest>`;

    const r = await fetch('https://api.ebay.com/ws/api.dll', {
      method:'POST',
      headers:{
        'X-EBAY-API-CALL-NAME':'GetSuggestedCategories',
        'X-EBAY-API-SITEID':'3',
        'X-EBAY-API-APP-NAME':process.env.EBAY_APP_ID,
        'X-EBAY-API-DEV-NAME':process.env.EBAY_DEV_ID,
        'X-EBAY-API-CERT-NAME':process.env.EBAY_CERT_ID,
        'X-EBAY-API-COMPATIBILITY-LEVEL':'1113',
        'Content-Type':'text/xml',
      },
      body: xml,
    });
    const text = await r.text();

    const blocks = [...text.matchAll(/<SuggestedCategory>([\s\S]*?)<\/SuggestedCategory>/g)];
    const suggestions = blocks.map(b => {
      const body = b[1];
      const categoryId   = extractFirst(body, 'CategoryID');
      const categoryName = extractFirst(body, 'CategoryName');
      const pct          = parseInt(extractFirst(body, 'PercentItemFound') || '0', 10);
      const pathParts    = extractAll(body, 'string').filter(Boolean);
      return { categoryId, categoryName, path:[...pathParts, categoryName], percentItemFound: pct };
    }).filter(s => s.categoryId);

    return res.status(200).json({ suggestions: suggestions.slice(0, 10) });
  } catch(e) {
    console.error('[suggest-category]', e);
    return res.status(500).json({ error: e.message });
  }
}
