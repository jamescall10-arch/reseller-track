/**
 * Fetches recent eBay orders using the Fulfillment REST API.
 * Returns normalised order data so the app can auto-log matched sales.
 * Docs: https://developer.ebay.com/api-docs/sell/fulfillment/overview.html
 */
import { getUserToken, EBAY_API, ebayHeaders } from './_token.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  try {
    const token = await getUserToken(userId);

    // Fetch orders from last 90 days — all statuses
    const from  = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const url   = EBAY_API + '/sell/fulfillment/v1/order?limit=50&filter=creationdate:[' + from + '..]';

    const r = await fetch(url, { headers: ebayHeaders(token) });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      const msg = (e.errors||[]).map(x=>x.message).join(', ') || r.statusText;
      throw new Error('Fulfillment API: ' + r.status + ' — ' + msg);
    }

    const data   = await r.json();
    const orders = data.orders || [];

    // Normalise to a flat list of line-item sale records
    const results = [];

    orders.forEach(order => {
      const orderTotal    = parseFloat(order.pricingSummary?.total?.value || 0);
      const totalFees     = parseFloat(order.totalMarketplaceFee?.value || 0);
      const totalToSeller = parseFloat(order.paymentSummary?.totalDueToSeller?.value || 0);
      const buyerShipping = parseFloat(order.pricingSummary?.deliveryCost?.value || 0);

      (order.lineItems || []).forEach(line => {
        const lineTotal  = parseFloat(line.total?.value || line.lineItemCost?.value || 0);
        const proportion = orderTotal > 0 ? lineTotal / orderTotal : 1;
        const lineFees   = +( totalFees * proportion).toFixed(2);
        const lineNet    = +(totalToSeller * proportion).toFixed(2);
        const lineShip   = +(buyerShipping * proportion).toFixed(2);

        const saleDate = order.creationDate
          ? new Date(order.creationDate).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'2-digit' })
          : '';

        results.push({
          orderId:           order.orderId,
          ebayItemId:        line.legacyItemId || '',
          ebaySku:           line.sku           || '',
          title:             line.title          || '',
          qty:               line.quantity        || 1,
          soldPrice:         lineTotal,           // what buyer paid for item
          ebayFees:          lineFees,            // eBay marketplace fees
          moneyIn:           lineNet,             // what seller receives (after fees incl. buyer shipping)
          buyerPaidShipping: lineShip,            // what buyer paid for postage
          saleDate,
          orderStatus:       order.orderFulfillmentStatus || '',
        });
      });
    });

    return res.status(200).json({ orders: results });

  } catch (e) {
    console.error('[sync-orders]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
