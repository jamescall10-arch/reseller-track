// eBay Taxonomy REST API — getCategorySuggestions
// Uses application access token (no user login required)
// GET /commerce/taxonomy/v1/category_tree/3/get_category_suggestions?q=QUERY
import { getAppToken } from './_token.js';

const TAXONOMY = 'https://api.ebay.com/commerce/taxonomy/v1';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { query } = req.body || {};
  if (!query?.trim()) return res.status(400).json({ error: 'Missing query' });

  try {
    const token   = await getAppToken();
    const url     = TAXONOMY + '/category_tree/3/get_category_suggestions?q=' + encodeURIComponent(query.trim());
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
    const suggestions = (data.categorySuggestions || []).map(s => {
      const ancestors = (s.categoryTreeNodeAncestors || [])
        .sort((a,b) => a.categoryTreeNodeLevel - b.categoryTreeNodeLevel)
        .map(a => a.categoryName);
      return {
        categoryId:   s.category?.categoryId,
        categoryName: s.category?.categoryName,
        path:         [...ancestors, s.category?.categoryName].filter(Boolean),
        relevancy:    s.relevancy || '',
      };
    }).filter(s => s.categoryId);

    return res.status(200).json({ suggestions: suggestions.slice(0,10) });
  } catch (e) {
    console.error('[suggest-category]', e);
    return res.status(500).json({ error: e.message });
  }
}
