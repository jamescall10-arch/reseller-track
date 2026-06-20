// GET ?userId=XXX → fetch recent eBay orders (Fulfillment REST API)
//                    + currently active listings (Trading API GetMyeBaySelling — read-only)
//
// Note: the REST Inventory API has no single bulk "list all active offers" call —
// getOffers requires a known SKU per request. For a read-only bulk fetch of active
// listings, GetMyeBaySelling (Trading API) remains the practical approach; eBay's own
// docs note Traditional APIs are usable, just not preferred for *new build-out* of
// create/update flows. We only read here, never write, so this is safe.
import { getUserToken, EBAY_API, ebayHeaders } from './_token.js';

const extractAll   = (xml, tag) => [...xml.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'g'))].map(m => m[1].trim());
const extractFirst = (xml, tag) => extractAll(xml, tag)[0] || '';

async function fetchActiveListings(token) {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ActiveList>
    <Sort>TimeLeft</Sort>
    <Pagination><EntriesPerPage>200</EntriesPerPage><PageNumber>1</PageNumber></Pagination>
  </ActiveList>
  <DetailLevel>ReturnAll</DetailLevel>
</GetMyeBaySellingRequest>`;

  const r = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME':          'GetMyeBaySelling',
      'X-EBAY-API-SITEID':             '3',
      'X-EBAY-API-COMPATIBILITY-LEVEL':'1113',
      'X-EBAY-API-IAF-TOKEN':          token,
      'Content-Type':                  'text/xml',
    },
    body: xml,
  });
  const text = await r.text();
  const ack  = extractFirst(text, 'Ack');
  if (ack !== 'Success' && ack !== 'Warning') {
    const msg = extractFirst(text, 'ShortMessage') || 'GetMyeBaySelling failed';
    throw new Error(msg);
  }

  const blocks = [...text.matchAll(/<Item>([\s\S]*?)<\/Item>/g)];
  return blocks.map(b => {
    const body = b[1];
    const get  = tag => (body.match(new RegExp(`<${tag}>([^<]*)<\/${tag}>`)) || [])[1]?.trim() || '';
    return {
      ebayItemId: get('ItemID'),
      ebaySku:    get('SKU'),
      title:      get('Title'),
      price:      parseFloat(get('CurrentPrice') || get('StartPrice') || '0'),
      qty:        parseInt(get('QuantityAvailable') || get('Quantity') || '1', 10),
      listingUrl: get('ViewItemURL') || (get('ItemID') ? `https://www.ebay.co.uk/itm/${get('ItemID')}` : ''),
    };
  }).filter(it => it.ebayItemId);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });
  try {
    const token = await getUserToken(userId);

    // ── Orders (sold items) — Fulfillment REST API ─────────────────────────
    const from  = new Date(Date.now()-90*24*60*60*1000).toISOString();
    const r     = await fetch(EBAY_API+'/sell/fulfillment/v1/order?limit=50&filter=creationdate:['+from+'...]', {headers:ebayHeaders(token)});
    if (!r.ok) { const e=await r.json().catch(()=>({})); throw new Error('Fulfillment API: '+r.status+' — '+((e.errors||[]).map(x=>x.message).join(', ')||r.statusText)); }
    const data   = await r.json();
    const results = [];
    (data.orders||[]).forEach(order => {
      const orderTotal    = parseFloat(order.pricingSummary?.total?.value||0);
      const totalFees     = parseFloat(order.totalMarketplaceFee?.value||0);
      const totalToSeller = parseFloat(order.paymentSummary?.totalDueToSeller?.value||0);
      const buyerShipping = parseFloat(order.pricingSummary?.deliveryCost?.value||0);
      (order.lineItems||[]).forEach(line => {
        const lineTotal  = parseFloat(line.total?.value||line.lineItemCost?.value||0);
        const proportion = orderTotal>0 ? lineTotal/orderTotal : 1;
        const saleDate   = order.creationDate ? new Date(order.creationDate).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'}) : '';
        results.push({
          orderId:           order.orderId,
          ebayItemId:        line.legacyItemId||'',
          ebaySku:           line.sku||'',
          title:             line.title||'',
          qty:               line.quantity||1,
          soldPrice:         lineTotal,
          ebayFees:          +(totalFees*proportion).toFixed(2),
          moneyIn:           +(totalToSeller*proportion).toFixed(2),
          buyerPaidShipping: +(buyerShipping*proportion).toFixed(2),
          saleDate,
          orderStatus:       order.orderFulfillmentStatus||'',
        });
      });
    });

    // ── Active listings — best-effort; sync still returns orders if this fails ──
    let activeListings = [];
    try { activeListings = await fetchActiveListings(token); }
    catch (e) { console.error('[sync] active listings fetch failed:', e.message); }

    return res.status(200).json({ orders: results, activeListings });
  } catch(e) {
    console.error('[sync]',e.message);
    return res.status(500).json({ error: e.message });
  }
}

