// Fetches seller's business policies — required by Inventory API for listing creation
// Account REST API: GET /sell/account/v1/{type}_policy?marketplace_id=EBAY_GB
import { getUserToken, EBAY_API, MARKETPLACE_ID, ebayHeaders } from './_token.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  try {
    const token = await getUserToken(userId);

    const fetch_policy = async (type) => {
      const r = await fetch(
        `${EBAY_API}/sell/account/v1/${type}_policy?marketplace_id=${MARKETPLACE_ID}`,
        { headers: ebayHeaders(token) }
      );
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        const msg = (e.errors||[]).map(x=>x.message).join(', ') || r.statusText;
        // 404 = no policies of this type — return empty
        if (r.status === 404) return [];
        throw new Error(`${type} policies: ${r.status} — ${msg}`);
      }
      const d = await r.json();
      return d[`${type}Policies`] || [];
    };

    const [fulfillment, payment, returns] = await Promise.all([
      fetch_policy('fulfillment'),
      fetch_policy('payment'),
      fetch_policy('return'),
    ]);

    return res.status(200).json({ fulfillment, payment, returns });
  } catch (e) {
    console.error('[business-policies]', e);
    return res.status(500).json({ error: e.message });
  }
}
