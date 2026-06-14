// GET ?userId=XXX → fetch recent eBay orders (last 90 days) via Fulfillment REST API
import { getUserToken, EBAY_API, ebayHeaders } from './_token.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });
  try {
    const token = await getUserToken(userId);
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
    return res.status(200).json({ orders: results });
  } catch(e) {
    console.error('[sync]',e.message);
    return res.status(500).json({ error: e.message });
  }
}
