// GET ?userId=XXX → fetch recent eBay orders (Fulfillment REST API)
//                    + currently active listings (Trading API GetMyeBaySelling — read-only)
//
// Note: the REST Inventory API has no single bulk "list all active offers" call —
// getOffers requires a known SKU per request. For a read-only bulk fetch of active
// listings, GetMyeBaySelling (Trading API) remains the practical approach; eBay's own
// docs note Traditional APIs are usable, just not preferred for *new build-out* of
// create/update flows. We only read here, never write, so this is safe.
import { getUserToken, EBAY_API, ebayHeaders } from './_token.js';

const extractFirst = (xml, tag) => {
  // Tag may carry attributes, e.g. <CurrentPrice currencyID="GBP">12.34</CurrentPrice>
  const m = xml.match(new RegExp('<'+tag+'[^>]*>([^<]*)<\\/'+tag+'>'));
  return m ? m[1].trim() : '';
};

async function fetchActiveListings(token) {
  const xml = '<?xml version="1.0" encoding="utf-8"?>'
    + '<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">'
    + '<ActiveList><Include>true</Include><Sort>TimeLeft</Sort>'
    + '<Pagination><EntriesPerPage>200</EntriesPerPage><PageNumber>1</PageNumber></Pagination>'
    + '</ActiveList><DetailLevel>ReturnAll</DetailLevel>'
    + '</GetMyeBaySellingRequest>';

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
    const shortMsg = extractFirst(text, 'ShortMessage');
    const longMsg  = extractFirst(text, 'LongMessage');
    const errCode  = extractFirst(text, 'ErrorCode');
    throw new Error(
      'GetMyeBaySelling ' + (ack||'failed') + (errCode?' (code '+errCode+')':'') + ': ' + (shortMsg||longMsg||text.slice(0,200))
    );
  }

  const blocks = [...text.matchAll(/<Item>([\s\S]*?)<\/Item>/g)];
  const items = blocks.map(b => {
    const body = b[1];
    const get  = tag => extractFirst(body, tag);
    const itemId = get('ItemID');
    return {
      ebayItemId: itemId,
      ebaySku:    get('SKU'),
      title:      get('Title'),
      price:      parseFloat(get('CurrentPrice') || get('ConvertedCurrentPrice') || get('StartPrice') || '0') || 0,
      qty:        parseInt(get('QuantityAvailable') || get('Quantity') || '1', 10) || 1,
      listingUrl: get('ViewItemURL') || (itemId ? 'https://www.ebay.co.uk/itm/'+itemId : ''),
    };
  }).filter(it => it.ebayItemId);

  const totalEntries = parseInt(extractFirst(text, 'TotalNumberOfEntries') || '0', 10);
  console.log('[sync] GetMyeBaySelling: ack='+ack+', items parsed='+items.length+', eBay reports total='+totalEntries);

  return items;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { userId, days, historyOnly } = req.query;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });
  try {
    const token = await getUserToken(userId);

    // ── Orders (sold items) — Fulfillment REST API ─────────────────────────
    // eBay supports up to 2 years of order history. Default quick-sync stays at
    // 90 days; pass ?days=730 for a one-off full history import. Paginated with
    // a safe cap to stay inside serverless function time limits.
    const lookbackDays = Math.min(parseInt(days, 10) || 90, 730);
    const from  = new Date(Date.now()-lookbackDays*24*60*60*1000).toISOString();
    const PAGE_SIZE  = 100;
    const MAX_PAGES  = lookbackDays > 90 ? 5 : 2; // cap: up to 500 orders on a full-history pull (timeout safety)
    let offset = 0;
    let allOrders = [];
    let totalAvailable = 0;
    let pagesFetched = 0;

    for (let page = 0; page < MAX_PAGES; page++) {
      const r = await fetch(
        EBAY_API+'/sell/fulfillment/v1/order?limit='+PAGE_SIZE+'&offset='+offset+'&filter=creationdate:['+from+'..]',
        {headers:ebayHeaders(token)}
      );
      if (!r.ok) { const e=await r.json().catch(()=>({})); throw new Error('Fulfillment API: '+r.status+' — '+((e.errors||[]).map(x=>x.message).join(', ')||r.statusText)); }
      const pageData = await r.json();
      allOrders = allOrders.concat(pageData.orders||[]);
      totalAvailable = pageData.total || allOrders.length;
      pagesFetched++;
      offset += PAGE_SIZE;
      if (offset >= totalAvailable || !pageData.orders?.length) break;
    }

    const results = [];
    allOrders.forEach(order => {
      const orderTotal    = parseFloat(order.pricingSummary?.total?.value||0);
      const totalFees     = parseFloat(order.totalMarketplaceFee?.value||0);
      const totalToSeller = parseFloat(order.paymentSummary?.totalDueSeller?.value||0);
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

    const truncated = totalAvailable > allOrders.length;
    console.log('[sync] orders: fetched='+allOrders.length+' of total='+totalAvailable+' across '+pagesFetched+' page(s), lookbackDays='+lookbackDays);

    // ── Active listings — skip on a history-only pull to keep it fast ──────────
    let activeListings = [];
    let activeListingsError = null;
    if (historyOnly !== 'true') {
      try {
        activeListings = await fetchActiveListings(token);
      } catch (e) {
        console.error('[sync] active listings fetch failed:', e.message);
        activeListingsError = e.message;
      }
    }

    return res.status(200).json({
      orders: results,
      activeListings,
      activeListingsError,
      totalOrdersAvailable: totalAvailable,
      ordersFetched: allOrders.length,
      truncated,
    });
  } catch(e) {
    console.error('[sync]',e.message);
    return res.status(500).json({ error: e.message });
  }
}
