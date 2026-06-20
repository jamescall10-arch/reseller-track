/**
 * Creates eBay listings using the Inventory REST API.
 * Flow: PUT inventory_item → POST offer → POST offer/{id}/publish
 *
 * Trading card categories (183454, 183050, 261328) have special condition rules:
 * - Only LIKE_NEW (graded) or USED_VERY_GOOD (ungraded) are valid
 * - conditionDescriptors array required with numeric IDs
 * Docs: https://developer.ebay.com/api-docs/sell/inventory/static/overview.html
 */
import { getUserToken, getAppToken, EBAY_API, MARKETPLACE_ID, ebayHeaders } from './_token.js';

// In-memory cache for condition policies (fetched from Metadata API)
const COND_CACHE = {};

async function fetchConditionPolicies(categoryId) {
  if (COND_CACHE[categoryId]) return COND_CACHE[categoryId];
  try {
    const token = await getAppToken();
    const url   = `${EBAY_API}/sell/metadata/v1/marketplace/${MARKETPLACE_ID}/get_item_condition_policies?filter=categoryIds:{${categoryId}}`;
    const r     = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': MARKETPLACE_ID } });
    if (!r.ok) return null;
    const data  = await r.json();
    const pol   = (data.itemConditionPolicies || []).find(p => String(p.categoryId) === String(categoryId));
    COND_CACHE[categoryId] = pol || null;
    return pol || null;
  } catch { return null; }
}

// ── TCG category IDs that require special condition handling ───────────────────
const TCG_CATS = new Set(['183454', '183050', '261328']);

// ── Card Condition IDs for ungraded cards (descriptor name: "40001") ──────────
// Category 183454 (CCG Individual Cards) supports: NM, Excellent, Very Good, Poor
// Category 183050 (Non-Sport Trading Card Singles) supports LP/MP/HP variants too
const CARD_CONDITION_IDS = {
  '183454': {
    'Near Mint or Better (NM/M)': '400010',
    'Lightly Played (LP)':        '400011', // Excellent
    'Moderately Played (MP)':     '400012', // Very Good
    'Heavily Played (HP)':        '400013', // Poor
    'Damaged (D)':                '400013', // Poor (closest)
    // generic fallbacks
    'Near Mint':  '400010', 'Excellent': '400011',
    'Very Good':  '400012', 'Good':      '400012', 'Poor': '400013',
  },
  '183050': {
    'Near Mint or Better (NM/M)': '400010',
    'Lightly Played (LP)':        '400015',
    'Moderately Played (MP)':     '400016',
    'Heavily Played (HP)':        '400017',
    'Damaged (D)':                '400013',
    'Near Mint': '400010', 'Excellent': '400011',
    'Very Good': '400012', 'Poor':      '400013',
  },
  '261328': {
    'Near Mint or Better (NM/M)': '400010',
    'Lightly Played (LP)':        '400011',
    'Moderately Played (MP)':     '400012',
    'Heavily Played (HP)':        '400013',
    'Damaged (D)':                '400013',
    'Near Mint': '400010', 'Excellent': '400011',
    'Very Good': '400012', 'Poor':      '400013',
  },
};

// ── Professional Grader IDs (descriptor name: "27501") ───────────────────────
const GRADER_IDS = {
  'Professional Sports Authenticator (PSA)': '275010',
  'PSA': '275010',
  'Beckett Collectors Club Grading (BCCG)': '275011',
  'BCCG': '275011',
  'Beckett Vintage Grading (BVG)': '275012',
  'BVG': '275012',
  'Beckett Grading Services (BGS)': '275013',
  'BGS (Beckett)': '275013', 'BGS': '275013',
  'Certified Guaranty Company (CGC)': '275015',
  'CGC': '275015',
  'Sportscard Guaranty Corporation (SGC)': '275016',
  'SGC': '275016',
  'K Sportscard Authentication (KSA)': '275017',
  'KSA': '275017',
  'Gem Mint Authentication (GMA)': '275018',
  'GMA': '275018',
  'Hybrid Grading Approach (HGA)': '275019',
  'HGA': '275019',
  'International Sports Authentication (ISA)': '2750110',
  'ISA': '2750110',
  'Gold Standard Grading (GSG)': '2750112',
  'GSG': '2750112',
  'Platin Grading Service (PGS)': '2750113',
  'PGS': '2750113',
  'MNT Grading (MNT)': '2750114', 'MNT': '2750114',
  'Technical Authentication & Grading (TAG)': '2750115', 'TAG': '2750115',
  'Rare Edition (Rare)': '2750116',
  'Revolution Card Grading (RCG)': '2750117', 'RCG': '2750117',
  'Card Grading Australia (CGA)': '2750120', 'CGA': '2750120',
  'Other': '2750123',
};

// ── Grade IDs (descriptor name: "27502") ─────────────────────────────────────
const GRADE_IDS = {
  '10': '275020', '9.5': '275021', '9': '275022', '8.5': '275023',
  '8':  '275024', '7.5': '275025', '7': '275026', '6.5': '275027',
  '6':  '275028', '5.5': '275029', '5': '2750210', '4.5': '2750211',
  '4':  '2750212', '3.5': '2750213', '3': '2750214', '2.5': '2750215',
  '2':  '2750216', '1.5': '2750217', '1': '2750218',
  'Authentic': '2750219', 'Authentic Altered': '2750220',
  'Authentic - Trimmed': '2750221', 'Authentic - Coloured': '2750222',
};

// ── Standard condition enum for non-TCG categories ───────────────────────────
const CONDITION_ENUM = {
  'New': 'NEW', 'Open box': 'NEW_OTHER',
  'Used \u2014 Like New': 'LIKE_NEW', 'Near Mint or Better (NM/M)': 'LIKE_NEW',
  'Used \u2014 Very Good': 'USED_EXCELLENT', 'Lightly Played (LP)': 'USED_EXCELLENT',
  'Used \u2014 Good': 'USED_VERY_GOOD', 'Moderately Played (MP)': 'USED_GOOD',
  'Used \u2014 Acceptable': 'USED_ACCEPTABLE', 'Heavily Played (HP)': 'USED_ACCEPTABLE',
  'Damaged (D)': 'FOR_PARTS_OR_NOT_WORKING', 'For parts or not working': 'FOR_PARTS_OR_NOT_WORKING',
  'Seller refurbished': 'SELLER_REFURBISHED',
};

// ── Resolve condition + conditionDescriptors using Metadata API ───────────────
// App condition label → eBay condition name for matching
const APP_TO_EBAY_LABEL = {
  'Near Mint or Better (NM/M)': ['Near Mint or Better','Near Mint'],
  'Lightly Played (LP)':        ['Lightly Played','Excellent'],
  'Moderately Played (MP)':     ['Moderately Played','Very Good'],
  'Heavily Played (HP)':        ['Heavily Played','Poor'],
  'Damaged (D)':                ['Poor','Damaged'],
};

async function resolveCondition(categoryId, appCondition, itemSpecifics) {
  const catStr = String(categoryId || '');

  if (!TCG_CATS.has(catStr)) {
    return { condition: CONDITION_ENUM[appCondition] || 'USED_GOOD', conditionDescriptors: undefined };
  }

  const gradeVal  = itemSpecifics?.find(s => s.name === 'Grade')?.value || '';
  const graderVal = itemSpecifics?.find(s => s.name === 'Professional Grader')?.value || '';
  const isGraded  = gradeVal && gradeVal !== 'Ungraded' && gradeVal !== '';

  // Fetch actual valid IDs from Metadata API
  const policies = await fetchConditionPolicies(catStr);

  if (isGraded) {
    const gradedCond      = policies?.itemConditions?.find(c => c.conditionId === '2750');
    const graderDescVals  = gradedCond?.conditionDescriptors?.find(d => d.conditionDescriptorId === '27501')?.conditionDescriptorValues || [];
    const gradeDescVals   = gradedCond?.conditionDescriptors?.find(d => d.conditionDescriptorId === '27502')?.conditionDescriptorValues || [];

    // Find grader ID — try exact match then partial
    const graderId = graderDescVals.find(v => v.conditionDescriptorValueName === graderVal)?.conditionDescriptorValueId
                  || graderDescVals.find(v => v.conditionDescriptorValueName?.toLowerCase().includes(graderVal?.split('(')[0].trim().toLowerCase()))?.conditionDescriptorValueId
                  || GRADER_IDS[graderVal];
    const gradeId  = gradeDescVals.find(v => v.conditionDescriptorValueName === gradeVal)?.conditionDescriptorValueId
                  || GRADE_IDS[gradeVal];

    if (graderId && gradeId) {
      return {
        condition: 'LIKE_NEW',
        conditionDescriptors: [{ name: '27501', values: [graderId] }, { name: '27502', values: [gradeId] }],
      };
    }
  }

  // Ungraded — find Card Condition ID from Metadata API
  const ungradedCond = policies?.itemConditions?.find(c => c.conditionId === '4000');
  const cardCondVals = ungradedCond?.conditionDescriptors?.find(d => d.conditionDescriptorId === '40001')?.conditionDescriptorValues || [];

  // Find best matching value for this app condition
  const targetLabels = APP_TO_EBAY_LABEL[appCondition] || ['Near Mint or Better'];
  let bestVal = null;
  for (const label of targetLabels) {
    bestVal = cardCondVals.find(v => v.conditionDescriptorValueName?.toLowerCase().includes(label.toLowerCase()));
    if (bestVal) break;
  }
  // Final fallback: first value (should be NM), or hardcoded 400010
  const cardCondId = bestVal?.conditionDescriptorValueId || cardCondVals[0]?.conditionDescriptorValueId || '400010';

  console.log('[listing] TCG condition resolved:', { catStr, appCondition, condition: 'USED_VERY_GOOD', cardCondId, availableVals: cardCondVals.map(v=>v.conditionDescriptorValueName+':'+v.conditionDescriptorValueId) });

  return {
    condition: 'USED_VERY_GOOD',
    conditionDescriptors: [{ name: '40001', values: [cardCondId] }],
  };
}

// ── Aspects dict — exclude Grade/Professional Grader for TCG (go in conditionDescriptors) ──
function buildAspects(itemSpecifics, categoryId) {
  const catStr = String(categoryId || '');
  const isTCG  = TCG_CATS.has(catStr);
  const TCG_SKIP = new Set(['Grade', 'Professional Grader', 'Certification Number']);
  const dict = {};
  (itemSpecifics || []).forEach(s => {
    if (!s.name?.trim() || !s.value?.trim()) return;
    if (isTCG && TCG_SKIP.has(s.name)) return; // these go in conditionDescriptors
    dict[s.name.trim()] = [s.value.trim()];
  });
  return dict;
}

// ── Ensure inventory location ──────────────────────────────────────────────────
async function ensureLocation(token, postalCode) {
  const key   = 'primary';
  const check = await fetch(EBAY_API + '/sell/inventory/v1/location/' + key, { headers: ebayHeaders(token) });
  if (check.ok) return key;
  if (!postalCode?.trim()) throw new Error('Please set your postal code in Settings before publishing to eBay.');
  const r = await fetch(EBAY_API + '/sell/inventory/v1/location/' + key, {
    method: 'POST', headers: ebayHeaders(token),
    body: JSON.stringify({
      location: { address: { postalCode: postalCode.trim().toUpperCase(), country: 'GB' } },
      merchantLocationStatus: 'ENABLED', name: 'My selling location', merchantLocationTypes: ['WAREHOUSE'],
    }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error('Could not create location: ' + ((e.errors||[]).map(x=>x.message).join(', ')||'').slice(0,200)); }
  return key;
}

function parseErrors(data) {
  return (data.errors || [])
    .map(e => e.message + (e.parameters?.length ? ' (' + e.parameters.map(p=>p.value).join(',') + ')' : ''))
    .join(' | ') || JSON.stringify(data).slice(0, 400);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { userId, item, action } = req.body || {};
  if (!userId || !item) return res.status(400).json({ error: 'Missing userId or item' });

  if (!item.fulfillmentPolicyId) return res.status(400).json({ error: 'No fulfillment policy selected. Go to My Account → eBay Setup.' });
  if (!item.paymentPolicyId)     return res.status(400).json({ error: 'No payment policy selected. Go to My Account → eBay Setup.' });
  if (!item.returnPolicyId)      return res.status(400).json({ error: 'No return policy selected. Go to My Account → eBay Setup.' });

  if (action === 'update') return handleUpdate(req, res, userId, item);
  return handleCreate(req, res, userId, item);
}

// ── Build the shared inventory-item + offer payloads used by both create and update ──
async function buildPayloads(item) {
  const qty         = Math.max(1, Math.floor(Number(item.qty)) || 1);
  const description = (item.description || item.name || '').trim();
  const images      = (item.photos || []).slice(0, 24).filter(Boolean);

  const { condition, conditionDescriptors } = await resolveCondition(
    item.ebayCategory, item.condition, item.itemSpecifics
  );
  const aspects = buildAspects(item.itemSpecifics, item.ebayCategory);

  const inventoryBody = {
    availability:  { shipToLocationAvailability: { quantity: qty } },
    condition,
    product: {
      title:       (item.name || '').slice(0, 80),
      description: description || undefined,
      imageUrls:   images.length ? images : undefined,
      aspects:     Object.keys(aspects).length ? aspects : undefined,
    },
  };
  if (item.conditionDescription?.trim()) inventoryBody.conditionDescription = item.conditionDescription.trim();
  if (conditionDescriptors?.length)      inventoryBody.conditionDescriptors = conditionDescriptors;

  return { qty, description, condition, conditionDescriptors, inventoryBody };
}

// ── CREATE: PUT inventory_item → POST offer → POST publish ──────────────────────
async function handleCreate(req, res, userId, item) {
  try {
    const token       = await getUserToken(userId);
    const sku         = item.ebaySku || ('rt-' + item.id + '-' + Date.now());
    const locationKey = await ensureLocation(token, item.postalCode);
    const { qty, description, condition, conditionDescriptors, inventoryBody } = await buildPayloads(item);

    const put = await fetch(
      EBAY_API + '/sell/inventory/v1/inventory_item/' + encodeURIComponent(sku),
      { method: 'PUT', headers: ebayHeaders(token), body: JSON.stringify(inventoryBody) }
    );
    if (put.status >= 400) {
      const e = await put.json().catch(() => ({}));
      throw new Error('Inventory item: ' + parseErrors(e));
    }

    const ofr = await fetch(EBAY_API + '/sell/inventory/v1/offer', {
      method: 'POST', headers: ebayHeaders(token),
      body: JSON.stringify({
        sku, marketplaceId: MARKETPLACE_ID, format: 'FIXED_PRICE',
        availableQuantity: qty,
        categoryId:        item.ebayCategory || undefined,
        listingDescription: description || undefined,
        listingPolicies: {
          fulfillmentPolicyId: item.fulfillmentPolicyId,
          paymentPolicyId:     item.paymentPolicyId,
          returnPolicyId:      item.returnPolicyId,
        },
        pricingSummary: { price: { value: Number(item.price).toFixed(2), currency: 'GBP' } },
        merchantLocationKey: locationKey,
        includeCatalogProductDetails: false,
      }),
    });
    if (!ofr.ok) {
      const e = await ofr.json().catch(() => ({}));
      throw new Error('Offer: ' + parseErrors(e));
    }
    const { offerId } = await ofr.json();

    const pub = await fetch(
      EBAY_API + '/sell/inventory/v1/offer/' + offerId + '/publish',
      { method: 'POST', headers: ebayHeaders(token), body: '{}' }
    );
    if (!pub.ok) {
      const e = await pub.json().catch(() => ({}));
      throw new Error('Publish: ' + parseErrors(e));
    }
    const { listingId } = await pub.json();
    console.log('[listing] Published', listingId, 'sku', sku, 'condition', condition, 'descriptors', JSON.stringify(conditionDescriptors));

    return res.status(200).json({
      success: true, listingId, offerId, sku,
      listingUrl: 'https://www.ebay.co.uk/itm/' + listingId,
    });
  } catch (e) {
    console.error('[listing:create]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

// ── UPDATE: PUT inventory_item (same SKU) → PUT offer/{offerId} ─────────────────
// Only works for listings originally created through ResellerTrack (Inventory API
// SKU-backed). Listings imported from eBay that were created outside the app have
// no Inventory API offer object to update — those need an offerId lookup by SKU
// first, which only succeeds if the listing genuinely is Inventory-API-backed.
async function handleUpdate(req, res, userId, item) {
  try {
    if (!item.ebaySku) {
      throw new Error('This listing has no ResellerTrack SKU on record, so it can\'t be updated from here. Edit it directly on eBay, then use Sync to refresh the price/quantity shown in the app.');
    }
    const token = await getUserToken(userId);
    const sku   = item.ebaySku;

    // Resolve offerId — use the one saved at publish time if we have it, otherwise look it up
    let offerId = item.ebayOfferId;
    if (!offerId) {
      const lookup = await fetch(
        EBAY_API + '/sell/inventory/v1/offer?sku=' + encodeURIComponent(sku) + '&marketplace_id=' + MARKETPLACE_ID,
        { headers: ebayHeaders(token) }
      );
      if (!lookup.ok) {
        const e = await lookup.json().catch(() => ({}));
        throw new Error('Could not find this listing\'s eBay offer: ' + parseErrors(e));
      }
      const data = await lookup.json();
      offerId = data.offers?.[0]?.offerId;
      if (!offerId) throw new Error('No matching eBay offer found for SKU ' + sku + ' — this listing may not be Inventory-API-backed.');
    }

    const locationKey = await ensureLocation(token, item.postalCode);
    const { qty, description, condition, conditionDescriptors, inventoryBody } = await buildPayloads(item);

    // ── Step 1: revise the inventory item (title, photos, aspects, condition) ──
    const put = await fetch(
      EBAY_API + '/sell/inventory/v1/inventory_item/' + encodeURIComponent(sku),
      { method: 'PUT', headers: ebayHeaders(token), body: JSON.stringify(inventoryBody) }
    );
    if (put.status >= 400) {
      const e = await put.json().catch(() => ({}));
      throw new Error('Inventory item: ' + parseErrors(e));
    }

    // ── Step 2: revise the live offer (price, qty, category, policies, description) ──
    // updateOffer is a full replace, so every required field must be resent even if unchanged.
    const upd = await fetch(EBAY_API + '/sell/inventory/v1/offer/' + offerId, {
      method: 'PUT', headers: ebayHeaders(token),
      body: JSON.stringify({
        sku, marketplaceId: MARKETPLACE_ID, format: 'FIXED_PRICE',
        availableQuantity: qty,
        categoryId:        item.ebayCategory || undefined,
        listingDescription: description || undefined,
        listingPolicies: {
          fulfillmentPolicyId: item.fulfillmentPolicyId,
          paymentPolicyId:     item.paymentPolicyId,
          returnPolicyId:      item.returnPolicyId,
        },
        pricingSummary: { price: { value: Number(item.price).toFixed(2), currency: 'GBP' } },
        merchantLocationKey: locationKey,
        includeCatalogProductDetails: false,
      }),
    });
    if (!upd.ok) {
      const e = await upd.json().catch(() => ({}));
      throw new Error('Offer update: ' + parseErrors(e));
    }
    console.log('[listing] Updated live offer', offerId, 'sku', sku, 'condition', condition);

    return res.status(200).json({
      success: true, offerId, sku,
      listingUrl: item.ebayItemId ? 'https://www.ebay.co.uk/itm/' + item.ebayItemId : '',
    });
  } catch (e) {
    console.error('[listing:update]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
