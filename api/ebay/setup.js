// GET ?userId=XXX         → fetch business policies (fulfillment/payment/return)
// POST {userId,postalCode} → create/check inventory location
import { getUserToken, EBAY_API, MARKETPLACE_ID, ebayHeaders } from './_token.js';

export default async function handler(req, res) {
  const userId = req.method==='GET' ? req.query.userId : req.body?.userId;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  try {
    const token = await getUserToken(userId);

    // ── GET: fetch business policies ───────────────────────────────────────
    if (req.method === 'GET') {
      const fetch_p = async (type) => {
        const r = await fetch(EBAY_API+'/sell/account/v1/'+type+'_policy?marketplace_id='+MARKETPLACE_ID, {headers:ebayHeaders(token)});
        if (r.status===404) return { policies:[], hint:'not_opted_in' };
        if (r.status===403) return { policies:[], hint:'missing_scope' };
        if (!r.ok) {
          const e=await r.json().catch(()=>({}));
          const msg=(e.errors||[]).map(x=>x.message).join(', ')||r.statusText;
          console.error('[setup] '+type+' policy error:',r.status,msg);
          return { policies:[], hint:'error', detail:msg };
        }
        const d = await r.json();
        return { policies: d[type+'Policies'] || [], hint: 'ok' };
      };
      const [ful,pay,ret] = await Promise.all([fetch_p('fulfillment'),fetch_p('payment'),fetch_p('return')]);
      // Surface the most useful hint to the frontend
      const hints = [ful.hint,pay.hint,ret.hint];
      const globalHint = hints.includes('missing_scope') ? 'missing_scope'
                       : hints.includes('not_opted_in')  ? 'not_opted_in'
                       : hints.includes('error')         ? 'error' : 'ok';
      return res.status(200).json({
        fulfillment: ful.policies, payment: pay.policies, returns: ret.policies,
        hint: globalHint,
        detail: [ful.detail,pay.detail,ret.detail].filter(Boolean).join(' | '),
      });
    }

    // ── POST: create/check inventory location ──────────────────────────────
    if (req.method === 'POST') {
      const { postalCode, locationName } = req.body || {};
      const key = 'primary';
      const check = await fetch(EBAY_API+'/sell/inventory/v1/location/'+key, {headers:ebayHeaders(token)});
      if (check.ok) return res.status(200).json({ merchantLocationKey:key, created:false });
      if (!postalCode) return res.status(400).json({ error:'Missing postalCode — set it in Settings first' });
      const create = await fetch(EBAY_API+'/sell/inventory/v1/location/'+key, {
        method:'POST', headers:ebayHeaders(token),
        body: JSON.stringify({location:{address:{postalCode:postalCode.trim().toUpperCase(),country:'GB'}},merchantLocationStatus:'ENABLED',name:locationName||'My selling location',merchantLocationTypes:['WAREHOUSE']}),
      });
      if (!create.ok) { const e=await create.json().catch(()=>({})); throw new Error('Create location: '+((e.errors||[]).map(x=>x.message).join(', ')||JSON.stringify(e)).slice(0,200)); }
      return res.status(201).json({ merchantLocationKey:key, created:true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch(e) {
    console.error('[setup]',e.message);
    return res.status(500).json({ error: e.message });
  }
}
