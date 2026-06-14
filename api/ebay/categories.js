// POST {query}       → getCategorySuggestions (Taxonomy REST API)
// GET ?categoryId=XX → getItemAspectsForCategory (Taxonomy REST API)
// Both use application access token — no user login required
import { getAppToken } from './_token.js';

const TAXONOMY = 'https://api.ebay.com/commerce/taxonomy/v1';
const HEADERS  = (token) => ({
  'Authorization':           'Bearer ' + token,
  'X-EBAY-C-MARKETPLACE-ID': 'EBAY_GB',
  'Content-Language':        'en-GB',
});

export default async function handler(req, res) {
  // ── POST: category suggestions ─────────────────────────────────────────────
  if (req.method === 'POST') {
    const { query } = req.body || {};
    if (!query?.trim()) return res.status(400).json({ error: 'Missing query' });
    try {
      const token   = await getAppToken();
      const url     = TAXONOMY + '/category_tree/3/get_category_suggestions?q=' + encodeURIComponent(query.trim());
      const r       = await fetch(url, { headers: HEADERS(token) });
      if (!r.ok) return res.status(400).json({ error: 'eBay ' + r.status, detail: (await r.text()).slice(0,200) });
      const data    = await r.json();
      const suggestions = (data.categorySuggestions || []).map(s => {
        const ancestors = (s.categoryTreeNodeAncestors || [])
          .sort((a,b) => a.categoryTreeNodeLevel - b.categoryTreeNodeLevel)
          .map(a => a.categoryName);
        return { categoryId:s.category?.categoryId, categoryName:s.category?.categoryName, path:[...ancestors,s.category?.categoryName].filter(Boolean), relevancy:s.relevancy||'' };
      }).filter(s=>s.categoryId);
      return res.status(200).json({ suggestions: suggestions.slice(0,10) });
    } catch(e) { return res.status(500).json({ error: e.message }); }
  }

  // ── GET: item aspects for category ─────────────────────────────────────────
  if (req.method === 'GET') {
    const { categoryId } = req.query;
    if (!categoryId) return res.status(400).json({ error: 'Missing categoryId' });
    try {
      const token   = await getAppToken();
      const url     = TAXONOMY + '/category_tree/3/get_item_aspects_for_category?category_id=' + categoryId;
      const r       = await fetch(url, { headers: HEADERS(token) });
      if (!r.ok) return res.status(400).json({ error: 'eBay ' + r.status, detail: (await r.text()).slice(0,200) });
      const data    = await r.json();
      const specifics = (data.aspects || []).map(a => {
        const c = a.aspectConstraint || {};
        return {
          name:     a.localizedAspectName,
          required: c.aspectRequired === true,
          freeText: !(c.aspectMode||[]).includes('SELECTION_ONLY'),
          values:   (a.aspectValues||[]).map(v=>v.localizedValue).filter(Boolean).slice(0,30),
        };
      }).sort((a,b)=>(b.required?1:0)-(a.required?1:0));
      return res.status(200).json({ specifics });
    } catch(e) { return res.status(500).json({ error: e.message }); }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
