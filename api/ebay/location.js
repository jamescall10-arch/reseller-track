// Manages seller inventory locations — required by Inventory API
// GET  — list locations
// POST — create primary location if none exists
import { getUserToken, EBAY_API, ebayHeaders } from './_token.js';

const LOCATION_KEY = 'primary';

export default async function handler(req, res) {
  const { userId } = req.method === 'GET' ? req.query : (req.body || {});
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  try {
    const token = await getUserToken(userId);

    if (req.method === 'GET') {
      const r = await fetch(`${EBAY_API}/sell/inventory/v1/location`, { headers: ebayHeaders(token) });
      const d = await r.json().catch(() => ({}));
      return res.status(200).json({ locations: d.locations || [] });
    }

    if (req.method === 'POST') {
      const { postalCode, locationName } = req.body || {};
      if (!postalCode) return res.status(400).json({ error: 'Missing postalCode — set it in Settings first' });

      // Check if already exists
      const check = await fetch(`${EBAY_API}/sell/inventory/v1/location/${LOCATION_KEY}`, { headers: ebayHeaders(token) });
      if (check.ok) return res.status(200).json({ merchantLocationKey: LOCATION_KEY, created: false });

      const create = await fetch(`${EBAY_API}/sell/inventory/v1/location/${LOCATION_KEY}`, {
        method:  'POST',
        headers: ebayHeaders(token),
        body:    JSON.stringify({
          location: { address: { postalCode: postalCode.trim().toUpperCase(), country: 'GB' } },
          merchantLocationStatus: 'ENABLED',
          name:                   locationName || 'My selling location',
          merchantLocationTypes:  ['WAREHOUSE'],
        }),
      });

      if (!create.ok) {
        const e = await create.json().catch(() => ({}));
        const msg = (e.errors||[]).map(x=>x.message).join(', ') || JSON.stringify(e);
        throw new Error(`Could not create location: ${msg}`);
      }

      return res.status(201).json({ merchantLocationKey: LOCATION_KEY, created: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('[location]', e);
    return res.status(500).json({ error: e.message });
  }
}
