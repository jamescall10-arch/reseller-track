import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://hrpzkakrvgigtxtcyjzk.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getAccessToken(userId) {
  const { data } = await supabase
    .from('ebay_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (!data) throw new Error('No eBay account connected');

  const needsRefresh = Date.now() >= new Date(data.expires_at).getTime() - 5 * 60 * 1000;
  if (!needsRefresh) return data.access_token;

  const creds = Buffer.from(`${process.env.EBAY_APP_ID}:${process.env.EBAY_CERT_ID}`).toString('base64');
  const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${creds}` },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: data.refresh_token,
      scope: 'https://api.ebay.com/oauth/api_scope',
    }),
  });
  const tokens = await res.json();
  await supabase.from('ebay_tokens').update({
    access_token: tokens.access_token,
    expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId);
  return tokens.access_token;
}

// Simple XML text extraction
const extractAll = (xml, tag) => {
  const re = new RegExp(`<${tag}>(.*?)<\\/${tag}>`, 'gs');
  return [...xml.matchAll(re)].map(m => m[1].trim());
};
const extractFirst = (xml, tag) => extractAll(xml, tag)[0] || '';

// Extract NameRecommendation blocks
function parseSpecifics(xml) {
  const specifics = [];
  const nameRecBlocks = [...xml.matchAll(/<NameRecommendation>([\s\S]*?)<\/NameRecommendation>/g)];

  for (const block of nameRecBlocks) {
    const body = block[1];
    const name = extractFirst(body, 'Name');
    if (!name) continue;

    // Check if required
    const minValues  = parseInt(extractFirst(body, 'MinValues') || '0', 10);
    const selectionMode = extractFirst(body, 'SelectionMode'); // FreeText or SelectionOnly

    // Extract accepted values
    const values = extractAll(body, 'Value').filter(Boolean);

    specifics.push({
      name,
      required:  minValues > 0,
      freeText:  selectionMode !== 'SelectionOnly',
      values,    // empty array means any text is acceptable
    });
  }

  return specifics;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { categoryId, userId } = req.query;
  if (!categoryId || !userId) return res.status(400).json({ error: 'Missing categoryId or userId' });

  try {
    const accessToken = await getAccessToken(userId);

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetCategorySpecificsRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials><eBayAuthToken>${accessToken}</eBayAuthToken></RequesterCredentials>
  <CategorySpecific>
    <CategoryID>${categoryId}</CategoryID>
    <MaxValuesPerName>20</MaxValuesPerName>
  </CategorySpecific>
</GetCategorySpecificsRequest>`;

    const ebayRes = await fetch('https://api.ebay.com/ws/api.dll', {
      method: 'POST',
      headers: {
        'X-EBAY-API-CALL-NAME':           'GetCategorySpecifics',
        'X-EBAY-API-SITEID':              '3',
        'X-EBAY-API-APP-NAME':            process.env.EBAY_APP_ID,
        'X-EBAY-API-DEV-NAME':            process.env.EBAY_DEV_ID,
        'X-EBAY-API-CERT-NAME':           process.env.EBAY_CERT_ID,
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1113',
        'Content-Type':                   'text/xml',
      },
      body: xml,
    });

    const text = await ebayRes.text();
    const ack  = extractFirst(text, 'Ack');

    if (ack !== 'Success' && ack !== 'Warning') {
      const error = extractFirst(text, 'ShortMessage');
      return res.status(400).json({ error: error || 'Failed to fetch category specifics' });
    }

    const specifics = parseSpecifics(text);
    return res.status(200).json({ specifics });

  } catch (e) {
    console.error('[category-specifics]', e);
    return res.status(500).json({ error: e.message });
  }
}
