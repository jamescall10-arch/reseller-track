// POST {userId, item} → create eBay listing via Inventory REST API
// Replaces deprecated Trading API AddItem (XML)
import { getUserToken, EBAY_API, MARKETPLACE_ID, ebayHeaders } from './_token.js';

const CONDITION_ENUM = {
  'New':'NEW','Open box':'NEW_OTHER','Seller refurbished':'MANUFACTURER_REFURBISHED',
  'Used \u2014 Like New':'LIKE_NEW','Near Mint or Better (NM/M)':'LIKE_NEW',
  'Used \u2014 Very Good':'USED_EXCELLENT','Lightly Played (LP)':'USED_EXCELLENT',
  'Used \u2014 Good':'USED_VERY_GOOD','Moderately Played (MP)':'USED_GOOD',
  'Used \u2014 Acceptable':'USED_ACCEPTABLE','Heavily Played (HP)':'USED_ACCEPTABLE',
  'Damaged (D)':'FOR_PARTS_OR_NOT_WORKING','For parts or not working':'FOR_PARTS_OR_NOT_WORKING',
};

function aspectsToDict(s) {
  const d={};(s||[]).forEach(x=>{if(x.name?.trim()&&x.value?.trim())d[x.name.trim()]=[x.value.trim()];});return d;
}

async function ensureLocation(token, postalCode) {
  const key='primary';
  const c=await fetch(EBAY_API+'/sell/inventory/v1/location/'+key,{headers:ebayHeaders(token)});
  if(c.ok) return key;
  if(!postalCode?.trim()) throw new Error('Please set your postal code in Settings before publishing to eBay.');
  const r=await fetch(EBAY_API+'/sell/inventory/v1/location/'+key,{method:'POST',headers:ebayHeaders(token),body:JSON.stringify({location:{address:{postalCode:postalCode.trim().toUpperCase(),country:'GB'}},merchantLocationStatus:'ENABLED',name:'My selling location',merchantLocationTypes:['WAREHOUSE']})});
  if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error('Could not create location: '+((e.errors||[]).map(x=>x.message).join(', ')||JSON.stringify(e)).slice(0,200));}
  return key;
}

function parseErrors(e) {
  return (e.errors||[]).map(x=>x.message+(x.parameters?.length?' ('+x.parameters.map(p=>p.value).join(',')+')'  :'')).join(' | ')||JSON.stringify(e).slice(0,300);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { userId, item } = req.body || {};
  if (!userId || !item) return res.status(400).json({ error: 'Missing userId or item' });
  if (!item.fulfillmentPolicyId) return res.status(400).json({ error: 'No fulfillment policy. Go to My Account → eBay Setup.' });
  if (!item.paymentPolicyId)     return res.status(400).json({ error: 'No payment policy. Go to My Account → eBay Setup.' });
  if (!item.returnPolicyId)      return res.status(400).json({ error: 'No return policy. Go to My Account → eBay Setup.' });
  try {
    const token       = await getUserToken(userId);
    const sku         = item.ebaySku || ('rt-'+item.id+'-'+Date.now());
    const qty         = Math.max(1,Math.floor(Number(item.qty))||1);
    const condition   = CONDITION_ENUM[item.condition]||'USED_GOOD';
    const aspects     = aspectsToDict(item.itemSpecifics);
    const description = (item.description||item.name||'').trim();
    const images      = (item.photos||[]).slice(0,24).filter(Boolean);
    const locationKey = await ensureLocation(token,item.postalCode);

    // Step 1: PUT inventory item
    const put=await fetch(EBAY_API+'/sell/inventory/v1/inventory_item/'+encodeURIComponent(sku),{method:'PUT',headers:ebayHeaders(token,{'Content-Language':'en-GB'}),body:JSON.stringify({availability:{shipToLocationAvailability:{quantity:qty}},condition,conditionDescription:item.conditionDescription||item.condition||'',product:{title:(item.name||'').slice(0,80),description,imageUrls:images.length?images:undefined,aspects:Object.keys(aspects).length?aspects:undefined}})});
    if(put.status>=400){const e=await put.json().catch(()=>({}));throw new Error('Inventory item: '+parseErrors(e));}

    // Step 2: POST offer
    const ofr=await fetch(EBAY_API+'/sell/inventory/v1/offer',{method:'POST',headers:ebayHeaders(token),body:JSON.stringify({sku,marketplaceId:MARKETPLACE_ID,format:'FIXED_PRICE',availableQuantity:qty,categoryId:item.ebayCategory||undefined,listingDescription:description,listingPolicies:{fulfillmentPolicyId:item.fulfillmentPolicyId,paymentPolicyId:item.paymentPolicyId,returnPolicyId:item.returnPolicyId},pricingSummary:{price:{value:Number(item.price).toFixed(2),currency:'GBP'}},merchantLocationKey:locationKey,includeCatalogProductDetails:false})});
    if(!ofr.ok){const e=await ofr.json().catch(()=>({}));throw new Error('Offer: '+parseErrors(e));}
    const {offerId}=await ofr.json();

    // Step 3: Publish
    const pub=await fetch(EBAY_API+'/sell/inventory/v1/offer/'+offerId+'/publish',{method:'POST',headers:ebayHeaders(token),body:'{}'});
    if(!pub.ok){const e=await pub.json().catch(()=>({}));throw new Error('Publish: '+parseErrors(e));}
    const {listingId}=await pub.json();
    console.log('[listing] Published',listingId,'sku',sku,'user',userId);
    return res.status(200).json({success:true,listingId,offerId,sku,listingUrl:'https://www.ebay.co.uk/itm/'+listingId});
  } catch(e) {
    console.error('[listing]',e.message);
    return res.status(500).json({error:e.message});
  }
}
