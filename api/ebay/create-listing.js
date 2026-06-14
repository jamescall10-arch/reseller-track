import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://hrpzkakrvgigtxtcyjzk.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CONDITION_IDS = {
  'New':                           1000,
  'Open box':                      1500,
  'Seller refurbished':            2500,
  'Used — Like New':               2750,
  'Near Mint or Better (NM/M)':    2750,
  'Used — Very Good':              3000,
  'Lightly Played (LP)':           3000,
  'Used — Good':                   4000,
  'Moderately Played (MP)':        4000,
  'Used — Acceptable':             5000,
  'Heavily Played (HP)':           5000,
  'Damaged (D)':                   6000,
  'For parts or not working':      7000,
};

// ── Get a valid access token, refreshing if expired ───────────────────────────
async function getAccessToken(userId) {
  const { data, error } = await supabase
    .from('ebay_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) throw new Error('No eBay account connected. Please connect your eBay account in My Account.');

  const expiresAt  = new Date(data.expires_at);
  const bufferMs   = 5 * 60 * 1000; // refresh 5 minutes early
  const needsRefresh = Date.now() >= expiresAt.getTime() - bufferMs;

  if (!needsRefresh) return data.access_token;

  // Refresh the token
  const clientId  = process.env.EBAY_APP_ID;
  const certId    = process.env.EBAY_CERT_ID;
  const creds     = Buffer.from(`${clientId}:${certId}`).toString('base64');

  const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      'Authorization': `Basic ${creds}`,
    },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: data.refresh_token,
      scope: [
        'https://api.ebay.com/oauth/api_scope',
        'https://api.ebay.com/oauth/api_scope/sell.inventory',
        'https://api.ebay.com/oauth/api_scope/sell.account',
      ].join(' '),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`eBay token refresh failed: ${err}`);
  }

  const tokens     = await res.json();
  const newExpires = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  await supabase.from('ebay_tokens').update({
    access_token: tokens.access_token,
    expires_at:   newExpires,
    updated_at:   new Date().toISOString(),
  }).eq('user_id', userId);

  return tokens.access_token;
}

// ── Escape XML special characters ─────────────────────────────────────────────
function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Build the AddItem XML request body ────────────────────────────────────────
function buildXml(item, accessToken) {
  const conditionId     = CONDITION_IDS[item.condition] ?? 3000;
  const categoryId      = item.ebayCategory || '1281';
  const qty             = Math.max(1, Math.floor(Number(item.qty)) || 1);
  const price           = Number(item.price).toFixed(2);
  const postageCost     = Number(item.postageCost  || 0).toFixed(2);
  const shippingService = item.shippingService || 'UK_RoyalMailSecondClassStandard';
  const postalCode      = esc(item.postalCode  || 'LE11 1AA');
  const title           = esc(String(item.name || '').slice(0, 80));
  const photos          = (item.photos || []).slice(0, 12);

  const pictureXml = photos.length
    ? `<PictureDetails>${photos.map(u => `<PictureURL>${esc(u)}</PictureURL>`).join('')}</PictureDetails>`
    : '';

  const description = [
    item.condition ? `Condition: ${item.condition}` : '',
    item.description || '',
  ].filter(Boolean).join('\n\n') || item.name;

  return `<?xml version="1.0" encoding="utf-8"?>
<AddItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials><eBayAuthToken>${accessToken}</eBayAuthToken></RequesterCredentials>
  <ErrorLanguage>en_GB</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <Item>
    <Title>${title}</Title>
    <Description><![CDATA[${description}]]></Description>
    <PrimaryCategory><CategoryID>${categoryId}</CategoryID></PrimaryCategory>
    <StartPrice>${price}</StartPrice>
    <CategoryMappingAllowed>true</CategoryMappingAllowed>
    <ConditionID>${conditionId}</ConditionID>
    <Country>GB</Country>
    <Currency>GBP</Currency>
    <DispatchTimeMax>3</DispatchTimeMax>
    <ListingDuration>GTC</ListingDuration>
    <ListingType>FixedPriceItem</ListingType>
    ${pictureXml}
    <PostalCode>${postalCode}</PostalCode>
    <Quantity>${qty}</Quantity>
    <ReturnPolicy>
      <ReturnsAcceptedOption>ReturnsAccepted</ReturnsAcceptedOption>
      <RefundOption>MoneyBack</RefundOption>
      <ReturnsWithinOption>Days_30</ReturnsWithinOption>
      <ShippingCostPaidByOption>Buyer</ShippingCostPaidByOption>
    </ReturnPolicy>
    <ShippingDetails>
      <ShippingType>Flat</ShippingType>
      <ShippingServiceOptions>
        <ShippingServicePriority>1</ShippingServicePriority>
        <ShippingService>${shippingService}</ShippingService>
        <ShippingServiceCost>${postageCost}</ShippingServiceCost>
      </ShippingServiceOptions>
    </ShippingDetails>
    <Site>UK</Site>
  </Item>
</AddItemRequest>`;
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, item } = req.body || {};
  if (!userId || !item) return res.status(400).json({ error: 'Missing userId or item' });

  try {
    const accessToken = await getAccessToken(userId);
    const xml = buildXml(item, accessToken);

    const ebayRes = await fetch('https://api.ebay.com/ws/api.dll', {
      method: 'POST',
      headers: {
        'X-EBAY-API-CALL-NAME':              'AddItem',
        'X-EBAY-API-SITEID':                 '3',
        'X-EBAY-API-APP-NAME':               process.env.EBAY_APP_ID,
        'X-EBAY-API-DEV-NAME':               process.env.EBAY_DEV_ID,
        'X-EBAY-API-CERT-NAME':              process.env.EBAY_CERT_ID,
        'X-EBAY-API-COMPATIBILITY-LEVEL':    '1113',
        'Content-Type':                      'text/xml',
      },
      body: xml,
    });

    const text = await ebayRes.text();
    const ack  = text.match(/<Ack>(.*?)<\/Ack>/)?.[1];

    if (ack === 'Success' || ack === 'Warning') {
      const ebayItemId = text.match(/<ItemID>(\d+)<\/ItemID>/)?.[1];
      const listingUrl = `https://www.ebay.co.uk/itm/${ebayItemId}`;

      console.log(`[create-listing] Listed ${ebayItemId} for user ${userId}: ${item.name}`);
      return res.status(200).json({ success:true, ebayItemId, listingUrl, hasWarnings: ack==='Warning' });
    }

    // Extract eBay error messages
    const errors = [...text.matchAll(/<ShortMessage>(.*?)<\/ShortMessage>/g)]
      .map(m => m[1]).join(' | ');
    console.error(`[create-listing] eBay error for user ${userId}: ${errors}`);
    return res.status(400).json({ error: errors || 'eBay rejected the listing', raw: text.slice(0, 500) });

  } catch (e) {
    console.error('[create-listing] Error:', e);
    return res.status(500).json({ error: e.message || 'Internal server error' });
  }
}
