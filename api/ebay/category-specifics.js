// eBay Taxonomy REST API — getItemAspectsForCategory
// Uses application access token (no user login required)
// GET /commerce/taxonomy/v1/category_tree/3/get_item_aspects_for_category?category_id=ID
import { getAppToken } from './_token.js';

const TAXONOMY = 'https://api.ebay.com/commerce/taxonomy/v1';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { categoryId } = req.query;
  if (!categoryId) return res.status(400).json({ error: 'Missing categoryId' });

  try {
    const token   = await getAppToken();
    const url     = TAXONOMY + '/category_tree/3/get_item_aspects_for_category?category_id=' + categoryId;
    const ebayRes = await fetch(url, {
      headers: {
        'Authorization':           'Bearer ' + token,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_GB',
        'Content-Language':        'en-GB',
      },
    });

    if (!ebayRes.ok) {
      const err = await ebayRes.text();
      return res.status(400).json({ error: 'eBay API ' + ebayRes.status, detail: err.slice(0,300) });
    }

    const data = await ebayRes.json();
    const specifics = (data.aspects || []).map(a => {
      const c         = a.aspectConstraint || {};
      const isRequired = c.aspectRequired === true;
      const isFreeText = !(c.aspectMode || []).includes('SELECTION_ONLY');
      const values     = (a.aspectValues || []).map(v => v.localizedValue).filter(Boolean).slice(0,30);
      return { name: a.localizedAspectName, required: isRequired, freeText: isFreeText, values };
    });

    specifics.sort((a,b) => (b.required?1:0) - (a.required?1:0));
    return res.status(200).json({ specifics });
  } catch (e) {
    console.error('[category-specifics]', e);
    return res.status(500).json({ error: e.message });
  }
}
