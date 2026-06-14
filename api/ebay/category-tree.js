import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://hrpzkakrvgigtxtcyjzk.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getAccessToken(userId) {
  const { data } = await supabase
    .from('ebay_tokens').select('access_token,refresh_token,expires_at')
    .eq('user_id', userId).maybeSingle();
  if (!data) throw new Error('No eBay account connected');
  if (Date.now() < new Date(data.expires_at).getTime() - 300000) return data.access_token;
  const creds = Buffer.from(`${process.env.EBAY_APP_ID}:${process.env.EBAY_CERT_ID}`).toString('base64');
  const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded','Authorization':`Basic ${creds}`},
    body: new URLSearchParams({ grant_type:'refresh_token', refresh_token:data.refresh_token, scope:'https://api.ebay.com/oauth/api_scope' }),
  });
  const t = await r.json();
  await supabase.from('ebay_tokens').update({ access_token:t.access_token, expires_at:new Date(Date.now()+t.expires_in*1000).toISOString(), updated_at:new Date().toISOString() }).eq('user_id', userId);
  return t.access_token;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error:'Method not allowed' });
  const { parentId = '0', userId } = req.query;
  if (!userId) return res.status(400).json({ error:'Missing userId' });

  try {
    const token = await getAccessToken(userId);

    // parentId '0' means root — don't specify CategoryParent, just limit level
    const parentXml = parentId === '0'
      ? '<LevelLimit>1</LevelLimit>'
      : `<CategoryParent>${parentId}</CategoryParent><LevelLimit>2</LevelLimit>`;

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetCategoriesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
  ${parentXml}
  <ViewAllNodes>true</ViewAllNodes>
  <DetailLevel>ReturnAll</DetailLevel>
</GetCategoriesRequest>`;

    const r = await fetch('https://api.ebay.com/ws/api.dll', {
      method:'POST',
      headers:{
        'X-EBAY-API-CALL-NAME':'GetCategories',
        'X-EBAY-API-SITEID':'3',
        'X-EBAY-API-APP-NAME':process.env.EBAY_APP_ID,
        'X-EBAY-API-DEV-NAME':process.env.EBAY_DEV_ID,
        'X-EBAY-API-CERT-NAME':process.env.EBAY_CERT_ID,
        'X-EBAY-API-COMPATIBILITY-LEVEL':'1113',
        'Content-Type':'text/xml',
      },
      body: xml,
    });
    const text = await r.text();

    // Parse Category blocks
    const blocks = [...text.matchAll(/<Category>([\s\S]*?)<\/Category>/g)];
    const allCats = blocks.map(b => {
      const body   = b[1];
      const getId  = tag => (body.match(new RegExp(`<${tag}>([^<]+)<\/${tag}>`))||[])[1]?.trim() || '';
      return {
        categoryId:       getId('CategoryID'),
        categoryName:     getId('CategoryName'),
        categoryParentId: getId('CategoryParentID'),
        categoryLevel:    parseInt(getId('CategoryLevel') || '1', 10),
        isLeaf:           getId('LeafCategory') === 'true',
      };
    });

    let categories;
    if (parentId === '0') {
      // Root: return only level-1 categories (those whose parent is themselves)
      categories = allCats.filter(c => c.categoryParentId === c.categoryId || c.categoryLevel === 1);
    } else {
      // Children: return direct children of parentId, excluding the parent itself
      categories = allCats.filter(c => c.categoryParentId === parentId && c.categoryId !== parentId);
    }

    categories.sort((a, b) => a.categoryName.localeCompare(b.categoryName));
    return res.status(200).json({ categories });

  } catch(e) {
    console.error('[category-tree]', e);
    return res.status(500).json({ error: e.message });
  }
}
