/**
 * Creates eBay listings using the Inventory REST API (not the deprecated Trading API XML).
 * Flow: PUT inventory_item -> POST offer -> POST offer/{id}/publish
 * Docs: https://developer.ebay.com/api-docs/sell/inventory/static/overview.html
 */
import { getUserToken, EBAY_API, MARKETPLACE_ID, ebayHeaders } from './_token.js';

const CONDITION_ENUM = {
  'New':                           'NEW',
  'Open box':                      'NEW_OTHER',
  'Seller refurbished':            'MANUFACTURER_REFURBISHED',
  'Used - Like New':               'LIKE_NEW',
  'Used - Very Good':              'USED_EXCELLENT',
  'Used - Good':                   'USED_VERY_GOOD',
  'Used - Acceptable':             'USED_ACCEPTABLE',
  'Used — Like New':               'LIKE_NEW',
  'Near Mint or Better (NM/M)':    'LIKE_NEW',
  'Used — Very Good':              'USED_EXCELLENT',
  'Lightly Played (LP)':           'USED_EXCELLENT',
  'Used — Good':                   'USED_VERY_GOOD',
  'Moderately Played (MP)':        'USED_GOOD',
  'Used — Acceptable':             'USED_ACCEPTABLE',
  'Heavily Played (HP)':           'USED_ACCEPTABLE',
  'Damaged (D)':                   'FOR_PARTS_OR_NOT_WORKING',
  'For parts or not working':      'FOR_PARTS_OR_NOT_WORKING',
};

function aspectsToDict(specifics) {
  const dict = {};
  (specifics || []).forEach(s => {
    if (s.name?.trim() && s.value?.trim()) dict[s.name.trim()] = [s.value.trim()];
  });
  return dict;
}

async function ensureLocation(token, postalCode) {
  const key   = 'primary';
  const check = await fetch(`${EBAY_API}/sell/inventory/v1/location/${key}`, { headers: ebayHeaders(token) });
  if (check.ok) return key;
  if (!postalCode?.trim()) throw new Error('Please set your postal code in Settings before publishing to eBay.');
  const create = await fetch(`${EBAY_API}/sell/inventory/v1/location/${key}`, {
    method:  'POST',
    headers: ebayHeaders(token),
    body:    JSON.stringify({
      location: { address: { postalCode: postalCode.trim().toUpperCase(), country: 'GB' } },
      merchantLocationStatus: 'ENABLED',
      name: 'My selling location',
      merchantLocationTypes: ['WAREHOUSE'],
    }),
  });
  if (!create.ok) {
    const e = await create.json().catch(() => ({}));
    throw new Error('Could not create inventory location: ' + ((e.errors||[]).map(x=>x.message).join(', ')||JSON.stringify(e)));
  }
  return key;
}

function parseErrors(data) {
  return (data.errors || [])
    .map(e => e.message + (e.parameters?.length ? ' ('+e.parameters.map(p=>p.value).join(', ')+')' : ''))
    .join(' | ') || JSON.stringify(data).slice(0,400);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { userId, item } = req.body || {};
  if (!userId || !item) return res.status(400).json({ error: 'Missing userId or item' });

  if (!item.fulfillmentPolicyId) return res.status(400).json({ error: 'No fulfillment policy selected. Go to My Account to set one up.' });
  if (!item.paymentPolicyId)     return res.status(400).json({ error: 'No payment policy selected. Go to My Account to set one up.' });
  if (!item.returnPolicyId)      return res.status(400).json({ error: 'No return policy selected. Go to My Account to set one up.' });

  try {
    const token       = await getUserToken(userId);
    const sku         = item.ebaySku || ('rt-' + item.id + '-' + Date.now());
    const qty         = Math.max(1, Math.floor(Number(item.qty)) || 1);
    const condition   = CONDITION_ENUM[item.condition] || 'USED_GOOD';
    const aspects     = aspectsToDict(item.itemSpecifics);
    const description = (item.description || item.name || '').trim();
    const images      = (item.photos || []).slice(0, 24).filter(Boolean);
    const locationKey = await ensureLocation(token, item.postalCode);

    // Step 1: PUT inventory item
    const putRes = await fetch(
      EBAY_API + '/sell/inventory/v1/inventory_item/' + encodeURIComponent(sku),
      {
        method:  'PUT',
        headers: ebayHeaders(token),
        body:    JSON.stringify({
          availability: { shipToLocationAvailability: { quantity: qty } },
          condition,
          conditionDescription: item.condition || '',
          product: {
            title:       (item.name || '').slice(0, 80),
            description: description,
            imageUrls:   images.length ? images : undefined,
            aspects:     Object.keys(aspects).length ? aspects : undefined,
          },
        }),
      }
    );
    if (putRes.status >= 400) {
      const e = await putRes.json().catch(() => ({}));
      throw new Error('Inventory item: ' + parseErrors(e));
    }

    // Step 2: POST offer
    const offerRes = await fetch(EBAY_API + '/sell/inventory/v1/offer', {
      method:  'POST',
      headers: ebayHeaders(token),
      body:    JSON.stringify({
        sku,
        marketplaceId:    MARKETPLACE_ID,
        format:           'FIXED_PRICE',
        availableQuantity: qty,
        categoryId:       item.ebayCategory || undefined,
        listingDescription: description,
        listingPolicies:  {
          fulfillmentPolicyId: item.fulfillmentPolicyId,
          paymentPolicyId:     item.paymentPolicyId,
          returnPolicyId:      item.returnPolicyId,
        },
        pricingSummary: { price: { value: Number(item.price).toFixed(2), currency: 'GBP' } },
        merchantLocationKey: locationKey,
        includeCatalogProductDetails: false,
      }),
    });
    if (!offerRes.ok) {
      const e = await offerRes.json().catch(() => ({}));
      throw new Error('Offer creation: ' + parseErrors(e));
    }
    const { offerId } = await offerRes.json();

    // Step 3: Publish offer
    const pubRes = await fetch(EBAY_API + '/sell/inventory/v1/offer/' + offerId + '/publish', {
      method: 'POST', headers: ebayHeaders(token), body: '{}',
    });
    if (!pubRes.ok) {
      const e = await pubRes.json().catch(() => ({}));
      throw new Error('Publish: ' + parseErrors(e));
    }
    const { listingId } = await pubRes.json();
    console.log('[create-listing] Listed', listingId, 'sku', sku, 'user', userId);

    return res.status(200).json({
      success: true, listingId, offerId, sku,
      listingUrl: 'https://www.ebay.co.uk/itm/' + listingId,
    });

  } catch (e) {
    console.error('[create-listing]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
