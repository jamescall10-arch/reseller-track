import { useState, useEffect } from 'react';
import PhotoUpload from './PhotoUpload.jsx';
import { EBAY_CONDITIONS, SHIPPING_SERVICES, EBAY_CATEGORIES, getDefaultItemSpecifics } from './ebayData.js';
import EbayCategoryPicker from './EbayCategoryPicker.jsx';

// Trading card categories requiring graded/ungraded UI
const TCG_CATS_MODAL = new Set(['183454','183050','261328']);
// Grader options for graded card UI
const GRADER_OPTIONS = ['PSA','BGS (Beckett)','CGC','SGC','GMA','HGA','BVG','BCCG','ISA','GSG','PGS','MNT Grading (MNT)','TAG','Rare Edition (Rare)','RCG','CGA','Other'];
const GRADE_OPTIONS  = ['10','9.5','9','8.5','8','7.5','7','6.5','6','5.5','5','4.5','4','3.5','3','2.5','2','1.5','1','Authentic'];

// Fallback values for aspects eBay returns as free-text or with incomplete value lists
// These mirror what eBay's own listing form shows
const ASPECT_FALLBACKS = {
  'Game': [
    'Pokémon TCG','Magic: The Gathering','Yu-Gi-Oh! TCG','Dragon Ball Super',
    'One Piece TCG','Disney Lorcana','Flesh and Blood','Cardfight!! Vanguard',
    'Digimon Card Game','Weiss Schwarz','Force of Will','Other',
  ],
  'Grade': [
    'Ungraded','10','9.5','9','8.5','8','7.5','7','6.5','6','5.5',
    '5','4.5','4','3.5','3','2.5','2','1.5','1','0.5','Authentic',
  ],
  'Professional Grader': [
    'Not Professionally Graded','PSA','BGS (Beckett)','CGC','SGC','HGA','GMA','ACE',
  ],
  'Type': ['Card'],
  'Signed': ['No','Yes'],
  'Modified Item': ['No','Yes'],
  'Country/Region of Manufacture': ['Japan','United States','United Kingdom'],
};

// Aspects that are auto-filled and hidden from the visible list (users never need to change them)
const AUTO_HIDDEN_ASPECTS = new Set(['Sport']);

// Aspects managed by graded/ungraded panel or auto-filled — hide from visible specifics list
const TCG_PANEL_ASPECTS = new Set(['Grade', 'Professional Grader', 'Certification Number']);

function shouldHideAspect(name, itemSpecifics, categoryId) {
  if (AUTO_HIDDEN_ASPECTS.has(name)) return true;
  // For TCG categories: Grade/Professional Grader are managed by the graded/ungraded panel
  if (TCG_PANEL_ASPECTS.has(name) && TCG_CATS_MODAL.has(String(categoryId || ''))) return true;
  return false;
}
import { isListingDeadZone } from './bundleUtils.js';

const S = {
  overlay: { position:'fixed',inset:0,background:'rgba(1,4,9,0.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200,padding:'16px' },
  box:     { background:'#161b22',border:'1px solid #30363d',borderRadius:12,width:'100%',maxWidth:700,maxHeight:'92vh',overflowY:'auto',display:'flex',flexDirection:'column' },
  header:  { display:'flex',justifyContent:'space-between',alignItems:'center',padding:'16px 20px',borderBottom:'1px solid #30363d',flexShrink:0 },
  body:    { padding:'20px',display:'flex',flexDirection:'column',gap:14,flex:1 },
  footer:  { padding:'14px 20px',borderTop:'1px solid #30363d',display:'flex',gap:8,justifyContent:'flex-end',flexShrink:0,flexWrap:'wrap' },
  field:   { display:'flex',flexDirection:'column',gap:4 },
  lbl:     { fontSize:11,color:'#8b949e',fontWeight:500 },
  inp:     { padding:'8px 10px',border:'1px solid #30363d',borderRadius:6,background:'#21262d',color:'#e6edf3',fontSize:13,fontFamily:'system-ui',width:'100%',boxSizing:'border-box' },
  row2:    { display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 },
  row3:    { display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12 },
  btn:     { padding:'8px 16px',borderRadius:6,border:'1px solid #30363d',background:'transparent',cursor:'pointer',fontSize:13,color:'#e6edf3',fontFamily:'system-ui',whiteSpace:'nowrap' },
  btnP:    { padding:'8px 16px',borderRadius:6,border:'1px solid #238636',background:'#238636',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:500,fontFamily:'system-ui',whiteSpace:'nowrap' },
  btnE:    { padding:'8px 16px',borderRadius:6,border:'1px solid #f0883e',background:'#f0883e',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:600,fontFamily:'system-ui',whiteSpace:'nowrap' },
  btnSm:   { padding:'4px 10px',borderRadius:5,border:'1px solid #30363d',background:'transparent',cursor:'pointer',fontSize:11,color:'#8b949e',fontFamily:'system-ui' },
  note:    { background:'#1c2128',border:'1px solid #9e6a03',color:'#d29922',borderRadius:6,padding:'7px 10px',fontSize:11,display:'flex',gap:8,alignItems:'flex-start' },
  success: { background:'#1a2f1a',border:'1px solid #238636',color:'#3fb950',borderRadius:6,padding:'10px 14px',fontSize:12 },
  error:   { background:'#2d1c00',border:'1px solid #f85149',color:'#f85149',borderRadius:6,padding:'10px 14px',fontSize:12 },
  section: { background:'#0d1117',border:'1px solid #30363d',borderRadius:8,padding:'16px' },
  badge:   (color) => ({ display:'inline-block',background:`${color}15`,color,border:`1px solid ${color}40`,borderRadius:20,padding:'2px 10px',fontSize:11,fontWeight:600,flexShrink:0 }),
};

export default function ItemDetailModal({ item, cats, sym='£', cfg={}, calcFees, ebayConnected, userId, returnPolicy, fulfillmentPolicyId, paymentPolicyId, returnPolicyId, fulfillmentPolicies=[], onSave, onClose, todayEnGB }){
  const [form, setForm] = useState({
    name:         item.name         || '',
    price:        String(item.price || ''),
    qty:          String(Math.max(1, Math.floor(Number(item.qty)) || 1)),
    buyCost:      (item.buyCost > 0) ? String(item.buyCost) : '',
    condition:    item.condition    || '',
    ebayCategory: item.ebayCategory || '',
    photos:       item.photos       || [],
  });

  // Item specifics — pre-populate defaults for known categories
  const [itemSpecifics, setItemSpecifics] = useState(
    item.itemSpecifics?.length
      ? item.itemSpecifics
      : getDefaultItemSpecifics(item.ebayCategory)
  );

  const [categorySpecifics, setCategorySpecifics] = useState(null);
  const [categoryPath,      setCategoryPath]      = useState(item.categoryPath || []);
  const [loadingSpecifics,  setLoadingSpecifics]  = useState(false);

  // Sync grader/grade into itemSpecifics whenever graded state changes
  const syncGradedSpecifics = (graded, grader, grade) => {
    setItemSpecifics(prev => {
      let next = prev.filter(s => s.name !== 'Grade' && s.name !== 'Professional Grader');
      if (graded) {
        next = [...next, { name:'Grade', value: grade }, { name:'Professional Grader', value: grader }];
      } else {
        next = [...next, { name:'Grade', value:'Ungraded' }];
      }
      return next;
    });
  };

  const handleSpecificsLoaded = (specifics) => {
    setCategorySpecifics(specifics);
    setItemSpecifics(prev => {
      const existing = new Set(prev.map(s => s.name.toLowerCase()));
      const toAdd = [];

      specifics.forEach(s => {
        if (existing.has(s.name.toLowerCase())) return; // already set

        // Merge eBay values with our fallbacks so we always have options
        const allValues = s.values?.length
          ? s.values
          : (ASPECT_FALLBACKS[s.name] || []);

        let value = '';

        if (s.name === 'Sport') {
          // Auto-fill Sport silently; it will be hidden from the visible list
          value = allValues.find(v => v.toLowerCase().includes('non-sport')) || allValues[0] || 'Non-Sport Trading Cards';
          toAdd.push({ name: s.name, value });
          return;
        }

        if (s.name === 'Grade' || s.name === 'Professional Grader' || s.name === 'Certification Number') {
          // For TCG categories: managed by graded/ungraded panel — don't auto-add to visible specifics
          // For non-TCG: add normally below
          if (TCG_CATS_MODAL.has(String(form?.ebayCategory || ''))) return;
        }

        if (!s.required) return; // skip non-required aspects

        // Required aspect — add with first sensible value
        value = allValues[0] || '';
        toAdd.push({ name: s.name, value });
      });

      return toAdd.length ? [...prev, ...toAdd] : prev;
    });
  };

  const fetchCategorySpecifics = async (catId) => {
    if (!catId || !userId) return;
    setLoadingSpecifics(true);
    try {
      const res  = await fetch('/api/ebay/categories?categoryId='+catId);
      const data = await res.json();
      if (data.specifics) {
        setCategorySpecifics(data.specifics);
        setItemSpecifics(prev => {
          const existing = new Set(prev.map(s => s.name.toLowerCase()));
          const toAdd = data.specifics
            .filter(s => s.required && !existing.has(s.name.toLowerCase()))
            .map(s => ({ name: s.name, value: s.values[0] || '' }));
          return toAdd.length ? [...prev, ...toAdd] : prev;
        });
      }
    } catch(e) { console.error('category-specifics error:', e); }
    finally { setLoadingSpecifics(false); }
  };

  // Auto-fetch required fields from eBay when modal opens with a category set
  useEffect(() => {
    if (form.ebayCategory && userId && ebayConnected) {
      fetchCategorySpecifics(form.ebayCategory);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [showPreview,     setShowPreview]     = useState(false);
  const [showPublish,     setShowPublish]      = useState(false);
  const [shippingService, setShippingService]  = useState(item.shippingService || (SHIPPING_SERVICES.find(s=>s.default)?.id || SHIPPING_SERVICES[0].id));
  const [postageCost,     setPostageCost]      = useState(String(cfg?.postage || '1.00'));
  const [sellerPostage,   setSellerPostage]    = useState(String(item.sellerPostageCost || cfg?.postage || '1.00'));
  const [itemFulfilmentId, setItemFulfilmentId] = useState(item.fulfillmentPolicyId || fulfillmentPolicyId || '');
  const [conditionDesc,   setConditionDesc]    = useState(item.conditionDescription || '');
  const [specificSearch,  setSpecificSearch]   = useState({}); // {index: searchText}
  const [cardGraded,      setCardGraded]       = useState(
    // Initialise as graded if existing Grade specific is a numeric value
    () => { const g = item.itemSpecifics?.find(s=>s.name==='Grade')?.value; return !!(g && g !== 'Ungraded' && g !== ''); }
  );
  const [graderVal,       setGraderVal]        = useState(item.itemSpecifics?.find(s=>s.name==='Professional Grader')?.value || 'PSA');
  const [gradeVal,        setGradeVal]         = useState(item.itemSpecifics?.find(s=>s.name==='Grade' && s.value !== 'Ungraded')?.value || '9');
  const [postalCode,      setPostalCode]       = useState(item.postalCode || cfg?.postalCode || '');
  const [publishing,      setPublishing]       = useState(false);
  const [publishResult,   setPublishResult]    = useState(null);

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // When category changes, re-populate item specifics if currently empty / only defaults
  const handleCategoryChange = (newCatId, path) => {
    f('ebayCategory', newCatId);
    if (path) setCategoryPath(path);
  };

  const addSpecific = () => setItemSpecifics(p => [...p, { name:'', value:'' }]);
  const removeSpecific = (i) => setItemSpecifics(p => p.filter((_,idx) => idx !== i));
  const updateSpecific = (i, key, val) => setItemSpecifics(p => p.map((s,idx) => idx===i ? {...s,[key]:val} : s));

  const priceNum   = parseFloat(form.price)   || 0;
  const buyCostNum = parseFloat(form.buyCost) || 0;
  const fees       = calcFees ? calcFees(priceNum) : +(priceNum * 0.129 + 0.30).toFixed(2);
  const estProfit  = +(priceNum - fees - buyCostNum).toFixed(2);
  const deadZone   = isListingDeadZone(form.price);

  const catName  = EBAY_CATEGORIES.flatMap(g=>g.items).find(c=>c.id===form.ebayCategory)?.name || '';
  const catLabel = cats?.find(c=>c.id===item.categoryId)?.name || '';

  const descParts = [];
  if (cfg?.listingDescription?.trim()) descParts.push(cfg.listingDescription.trim());
  const previewDesc = descParts.join('\n\n');

  const validSpecifics = itemSpecifics.filter(s => s.name?.trim() && s.value?.trim());

  const checks = [
    { label:'At least 1 photo',                ok: form.photos.length > 0 },
    { label:'Condition selected',               ok: !!form.condition },
    { label:'eBay category selected',           ok: !!form.ebayCategory },
    { label:'Postal code set',                  ok: !!postalCode.trim() },
    { label:'Fulfillment, payment & return policies set', ok: !!(fulfillmentPolicyId&&paymentPolicyId&&returnPolicyId) },
    { label:'eBay account connected',           ok: !!ebayConnected },
    { label:'Item specifics complete',          ok: itemSpecifics.every(s => s.name?.trim() && s.value?.trim()) },
  ];
  const readyToPublish = checks.every(c => c.ok);

  const handleSave = () => {
    if (!form.name.trim()) { alert('Name required'); return; }
    if (priceNum <= 0)     { alert('Price required'); return; }
    onSave({
      ...item,
      name:         form.name.trim(),
      price:        priceNum,
      qty:          Math.max(1, parseInt(form.qty, 10) || 1),
      buyCost:      +buyCostNum.toFixed(2),
      condition:    form.condition,
      ebayCategory: form.ebayCategory,
      photos:       form.photos,
      itemSpecifics,
      categoryPath,
    });
  };

  const handlePublish = async () => {
    if (!readyToPublish) return;
    setPublishing(true);
    setPublishResult(null);
    try {
      const res = await fetch('/api/ebay/listing', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({
          userId,
          item: {
            ...item,
            name:                form.name.trim(),
            price:               priceNum,
            qty:                 Math.max(1, parseInt(form.qty, 10) || 1),
            condition:           form.condition,
            ebayCategory:        form.ebayCategory,
            photos:              form.photos,
            description:         previewDesc,
            itemSpecifics:       validSpecifics,
            postalCode:          postalCode.trim(),
            fulfillmentPolicyId: itemFulfilmentId || fulfillmentPolicyId,
            paymentPolicyId,
            returnPolicyId,
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPublishResult({ success:true, ebayItemId:data.ebayItemId, listingUrl:data.listingUrl });
        onSave({
          ...item,
          name:           form.name.trim(),
          price:          priceNum,
          qty:            Math.max(1, parseInt(form.qty, 10) || 1),
          buyCost:        +buyCostNum.toFixed(2),
          condition:      form.condition,
          ebayCategory:   form.ebayCategory,
          photos:         form.photos,
          itemSpecifics,
          ebayItemId:     data.ebayItemId,
          ebayListingUrl: data.listingUrl,
          status:           'listed',
          listedAt:         todayEnGB ? todayEnGB() : new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'}),
          ebaySku:            data.sku,
          fulfillmentPolicyId: itemFulfilmentId || fulfillmentPolicyId,
          ebayOfferId:      data.offerId,
          sellerPostageCost: parseFloat(sellerPostage)||0,
        }, true);
      } else {
        setPublishResult({ success:false, error: data.error || 'Unknown error' });
      }
    } catch (e) {
      setPublishResult({ success:false, error: e.message });
    } finally {
      setPublishing(false);
    }
  };

  const statusBadge = item.status === 'listed'
    ? { label:'Active listing', color:'#f0883e' }
    : { label:'In stock', color:'#8b949e' };

  return (
    <div style={S.overlay} onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div style={S.box}>

        <div style={S.header}>
          <div style={{display:'flex',alignItems:'center',gap:10,overflow:'hidden'}}>
            <span style={{fontSize:15,fontWeight:600,color:'#e6edf3',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{form.name||'Unnamed item'}</span>
            <span style={S.badge(statusBadge.color)}>{statusBadge.label}</span>
            {item.ebayItemId&&<span style={S.badge('#3fb950')}>Live on eBay</span>}
          </div>
          <button style={{...S.btn,padding:'3px 8px',flexShrink:0}} onClick={onClose}>✕</button>
        </div>

        <div style={S.body}>

          {/* Photos */}
          <div style={S.field}>
            <label style={S.lbl}>Photos ({form.photos.length}/12)</label>
            <PhotoUpload photos={form.photos} onChange={v=>f('photos',v)}/>
          </div>

          {/* Name */}
          <div style={S.field}>
            <label style={S.lbl}>Item name <span style={{color:'#6e7681'}}>(max 80 characters on eBay)</span></label>
            <input style={S.inp} value={form.name} onChange={e=>f('name',e.target.value)} placeholder="Item name" maxLength={80}/>
            <div style={{fontSize:10,color:form.name.length>70?'#d29922':'#6e7681'}}>{form.name.length}/80 characters</div>
          </div>

          {/* Price / Qty / Buy cost */}
          <div style={S.row3}>
            <div style={S.field}>
              <label style={S.lbl}>Price ({sym})</label>
              <input style={S.inp} type="number" step="0.01" min="0" value={form.price} onChange={e=>f('price',e.target.value)} placeholder="0.00"/>
            </div>
            <div style={S.field}>
              <label style={S.lbl}>Quantity</label>
              <input style={S.inp} type="number" step="1" min="1" value={form.qty} onChange={e=>f('qty',e.target.value)}/>
            </div>
            <div style={S.field}>
              <label style={S.lbl}>Item cost ({sym})</label>
              <input style={S.inp} type="number" step="0.01" min="0" value={form.buyCost} onChange={e=>f('buyCost',e.target.value)} placeholder="0.00"/>
            </div>
          </div>

          {deadZone&&<div style={S.note}>⚠️ Prices between £10–£12.30 often earn less after signed postage. Consider pricing above or below this range.</div>}
          {priceNum>0&&(
            <div style={{background:'#21262d',borderRadius:6,padding:'8px 12px',fontSize:12,display:'flex',gap:16,flexWrap:'wrap'}}>
              <span style={{color:'#8b949e'}}>Est. fees: <strong style={{color:'#f85149'}}>{sym}{fees.toFixed(2)}</strong></span>
              <span style={{color:'#8b949e'}}>Est. profit after cost: <strong style={{color:estProfit>=0?'#3fb950':'#f85149'}}>{sym}{estProfit.toFixed(2)}</strong></span>
              {catLabel&&<span style={{color:'#8b949e'}}>App category: <strong style={{color:'#e6edf3'}}>{catLabel}</strong></span>}
            </div>
          )}

          {/* Condition — filtered by category type */}
          {!(TCG_CATS_MODAL.has(form.ebayCategory) && cardGraded) && (
            <div style={S.field}>
              <label style={S.lbl}>Condition</label>
              <select style={S.inp} value={form.condition} onChange={e=>f('condition',e.target.value)}>
                <option value="">Select condition…</option>
                {EBAY_CONDITIONS
                  .filter(g => !form.ebayCategory || (
                    TCG_CATS_MODAL.has(form.ebayCategory)
                      ? g.group === 'Trading Cards (TCG)'
                      : g.group !== 'Trading Cards (TCG)'
                  ))
                  .map(g=>(
                    <optgroup key={g.group} label={g.group}>
                      {g.items.map(c=><option key={c} value={c}>{c}</option>)}
                    </optgroup>
                  ))
                }
              </select>
            </div>
          )}

          {/* TCG Graded/Ungraded panel */}
          {TCG_CATS_MODAL.has(form.ebayCategory) && (
            <div style={{background:'#1c2128',border:'1px solid #30363d',borderRadius:8,padding:'12px'}}>
              <div style={{fontSize:12,fontWeight:600,marginBottom:10}}>Card type</div>
              <div style={{display:'flex',gap:8,marginBottom:10}}>
                {['Ungraded','Graded'].map(opt=>(
                  <button key={opt} type="button"
                    style={{padding:'6px 16px',borderRadius:6,border:`1px solid ${cardGraded===(opt==='Graded')?'#1f6feb':'#30363d'}`,background:cardGraded===(opt==='Graded')?'#1f6feb':'transparent',color:'#e6edf3',cursor:'pointer',fontSize:12,fontWeight:cardGraded===(opt==='Graded')?600:400}}
                    onClick={()=>{ const g=opt==='Graded'; setCardGraded(g); syncGradedSpecifics(g,graderVal,gradeVal); }}
                  >{opt}</button>
                ))}
              </div>
              {cardGraded ? (
                <div style={S.row2}>
                  <div style={S.field}>
                    <label style={S.lbl}>Grading company</label>
                    <select style={S.inp} value={graderVal} onChange={e=>{setGraderVal(e.target.value);syncGradedSpecifics(true,e.target.value,gradeVal);}}>
                      {GRADER_OPTIONS.map(g=><option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                  <div style={S.field}>
                    <label style={S.lbl}>Grade</label>
                    <select style={S.inp} value={gradeVal} onChange={e=>{setGradeVal(e.target.value);syncGradedSpecifics(true,graderVal,e.target.value);}}>
                      {GRADE_OPTIONS.map(g=><option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                </div>
              ) : (
                <div style={{fontSize:11,color:'#8b949e'}}>
                  Card condition maps from the <strong style={{color:'#e6edf3'}}>Condition</strong> field above
                </div>
              )}
            </div>
          )}

          {/* eBay category */}
          <div style={S.field}>
            <label style={S.lbl}>eBay category</label>
            <EbayCategoryPicker
              value={form.ebayCategory}
              valuePath={categoryPath}
              onChange={handleCategoryChange}
              userId={userId}
              itemName={form.name}
              ebayConnected={ebayConnected}
              onSpecificsLoaded={handleSpecificsLoaded}
            />
          </div>

          {/* Item specifics — auto-loaded from eBay when category is selected */}
          {(form.ebayCategory || itemSpecifics.filter(s=>!shouldHideAspect(s.name,itemSpecifics,form.ebayCategory)).length > 0) && (
          <div style={S.field}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
              <label style={S.lbl}>Required listing details</label>
              {loadingSpecifics
                ? <span style={{fontSize:11,color:'#8b949e'}}>⏳ Loading…</span>
                : form.ebayCategory&&ebayConnected&&<button type="button" style={S.btnSm} onClick={()=>fetchCategorySpecifics(form.ebayCategory)}>↻ Refresh</button>
              }
            </div>
            {!form.ebayCategory && (
              <div style={{fontSize:11,color:'#6e7681'}}>Select an eBay category above to load required fields</div>
            )}
            {itemSpecifics.map((s,i)=>{
              const spec = categorySpecifics?.find(cs=>cs.name.toLowerCase()===s.name.toLowerCase());
              // Merge eBay API values with our curated fallbacks, deduplicated
              const apiVals      = spec?.values || [];
              const fallbackVals = ASPECT_FALLBACKS[s.name] || [];
              const merged       = [...new Set([...fallbackVals, ...apiVals])];
              const displayValues = s.name === 'Grade' && !merged.includes('Ungraded')
                ? ['Ungraded', ...merged]
                : merged.length ? merged : apiVals;
              const hasValues = displayValues.length > 0;
              const isRequired = spec?.required;
              // Hide Sport (auto-filled) and Professional Grader when Grade=Ungraded
              if (shouldHideAspect(s.name, itemSpecifics, form.ebayCategory)) return null;
              return(
                <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:6,marginBottom:4}}>
                  <div style={{position:'relative'}}>
                    <div style={{...S.inp,borderColor:isRequired?'#d29922':'#30363d',color:'#8b949e',display:'flex',alignItems:'center',paddingRight:36,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.name}</div>
                    {isRequired&&<span style={{position:'absolute',right:6,top:'50%',transform:'translateY(-50%)',fontSize:9,color:'#d29922',background:'#1c2128',padding:'1px 3px',borderRadius:3}}>REQ</span>}
                  </div>
                  {hasValues && displayValues.length > 25
                    ? (() => {
                        const q = specificSearch[i] ?? s.value ?? '';
                        const norm = str => str.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
                        const filtered = q.trim()
                          ? displayValues.filter(v => norm(v).includes(norm(q)))
                          : displayValues.slice(0, 8);
                        return (
                          <div style={{position:'relative'}}>
                            <input
                              style={S.inp}
                              value={q}
                              placeholder={`Search ${s.name}…`}
                              onChange={e => setSpecificSearch(p=>({...p,[i]:e.target.value}))}
                              onFocus={e => setSpecificSearch(p=>({...p,[i]:p[i]??s.value??''}))}
                              onBlur={() => setTimeout(()=>setSpecificSearch(p=>{const n={...p};delete n[i];return n;}), 150)}
                            />
                            {specificSearch[i] !== undefined && filtered.length > 0 && (
                              <div style={{position:'absolute',top:'100%',left:0,right:0,background:'#1c2128',border:'1px solid #30363d',borderRadius:6,zIndex:99,maxHeight:180,overflowY:'auto',marginTop:2}}>
                                {filtered.map(v=>(
                                  <div key={v}
                                    style={{padding:'7px 10px',cursor:'pointer',fontSize:12,borderBottom:'1px solid #21262d'}}
                                    onMouseDown={()=>{updateSpecific(i,'value',v);setSpecificSearch(p=>{const n={...p};delete n[i];return n;});}}
                                  >{v}</div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()
                    : hasValues
                    ? <select style={S.inp} value={s.value} onChange={e=>updateSpecific(i,'value',e.target.value)}>
                        <option value="">Select…</option>
                        {displayValues.map(v=><option key={v} value={v}>{v}</option>)}
                        {s.value&&!displayValues.includes(s.value)&&
                          <option value={s.value}>{s.value}</option>}
                      </select>
                    : <input style={S.inp} value={s.value} onChange={e=>updateSpecific(i,'value',e.target.value)} placeholder="Enter value"/>
                  }
                  <button type="button" style={{...S.btnSm,color:'#f85149',padding:'4px 8px'}} onClick={()=>removeSpecific(i)}>X</button>
                </div>
              );
            })}
          </div>
          )}

          {/* eBay listing preview */}
          <button type="button" style={{...S.btn,fontSize:12,padding:'5px 10px',alignSelf:'flex-start'}} onClick={()=>setShowPreview(p=>!p)}>
            {showPreview?'▲ Hide':'▼ Show'} eBay listing preview
          </button>
          {showPreview&&(
            <div style={{background:'#0d1117',border:'1px solid #30363d',borderRadius:8,padding:'14px 16px'}}>
              {form.photos.length>0
                ? <div style={{display:'flex',gap:8,marginBottom:12,overflowX:'auto',paddingBottom:4}}>
                    {form.photos.map((url,i)=><img key={i} src={url} alt="" style={{width:80,height:80,objectFit:'cover',borderRadius:6,flexShrink:0,border:'1px solid #30363d'}}/>)}
                  </div>
                : <div style={{background:'#21262d',borderRadius:6,height:80,display:'flex',alignItems:'center',justifyContent:'center',color:'#6e7681',fontSize:12,marginBottom:12}}>No photos — add photos above</div>
              }
              <div style={{fontSize:17,fontWeight:700,color:'#e6edf3',marginBottom:6,lineHeight:1.3}}>{form.name||'Item name'}</div>
              <div style={{display:'flex',gap:12,marginBottom:8,flexWrap:'wrap'}}>
                <span style={{fontSize:22,fontWeight:700,color:'#f0883e'}}>{sym}{priceNum.toFixed(2)}</span>
                {form.condition&&<span style={{fontSize:12,color:'#8b949e',alignSelf:'center'}}>{form.condition}</span>}
                {catName&&<span style={{fontSize:11,color:'#6e7681',alignSelf:'center'}}>{catName}</span>}
              </div>
              {validSpecifics.length>0&&(
                <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:8}}>
                  {validSpecifics.map(s=>(
                    <span key={s.name} style={{background:'#21262d',borderRadius:4,padding:'2px 8px',fontSize:11,color:'#8b949e'}}><strong>{s.name}:</strong> {s.value}</span>
                  ))}
                </div>
              )}
              {previewDesc
                ? <div style={{fontSize:12,color:'#8b949e',lineHeight:1.7,whiteSpace:'pre-wrap',borderTop:'1px solid #30363d',paddingTop:8}}>{previewDesc}</div>
                : <div style={{fontSize:11,color:'#6e7681',borderTop:'1px solid #30363d',paddingTop:8}}>No description — add one in ⚙️ Settings</div>
              }
            </div>
          )}

          {/* Publish to eBay */}
          <div style={S.section}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:showPublish?14:0}}>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:'#e6edf3'}}>🏷 Publish to eBay</div>
                <div style={{fontSize:11,color:'#8b949e',marginTop:2}}>Create a live listing directly from ResellerTrack</div>
              </div>
              <button style={{...S.btn,fontSize:12,padding:'5px 10px'}} onClick={()=>setShowPublish(p=>!p)}>
                {showPublish?'▲ Hide':'▼ Show'}
              </button>
            </div>

            {showPublish&&(
              <div style={{display:'flex',flexDirection:'column',gap:12}}>

                {/* Readiness checklist */}
                <div style={{display:'flex',flexDirection:'column',gap:5}}>
                  {checks.map(c=>(
                    <div key={c.label} style={{display:'flex',alignItems:'center',gap:8,fontSize:12}}>
                      <span style={{color:c.ok?'#3fb950':'#f85149',fontSize:14,minWidth:14}}>{c.ok?'✓':'✗'}</span>
                      <span style={{color:c.ok?'#8b949e':'#e6edf3'}}>{c.label}</span>
                    </div>
                  ))}
                </div>

                {/* Disclaimer */}
                <div style={{...S.note,borderColor:'#30363d',color:'#8b949e',background:'#161b22'}}>
                  <span style={{marginRight:4}}>ℹ️</span>
                  You are responsible for ensuring your listing complies with eBay's{' '}
                  <a href="https://www.ebay.co.uk/help/policies/listing-policies/listing-policies?id=4213" target="_blank" rel="noreferrer" style={{color:'#58a6ff'}}>listing policies</a>,
                  {' '}item descriptions are accurate, and items are permitted to be sold on eBay.
                </div>

                {/* Shipping service */}
                <div style={S.row2}>
                  <div style={S.field}>
                    <label style={S.lbl}>Shipping service</label>
                    <select style={S.inp} value={shippingService} onChange={e=>setShippingService(e.target.value)}>
                      {SHIPPING_SERVICES.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </div>
                  <div style={S.field}>
                    <label style={S.lbl}>Postage cost ({sym}) charged to buyer</label>
                    <input style={S.inp} type="number" step="0.01" min="0" value={postageCost} onChange={e=>setPostageCost(e.target.value)} placeholder="0.00"/>
                  </div>
                </div>

                {/* Postage policy + seller cost */}
                <div style={S.row2}>
                  <div style={S.field}>
                    <label style={S.lbl}>Postage policy for this listing</label>
                    {fulfillmentPolicies.length > 0
                      ? <select style={S.inp} value={itemFulfilmentId} onChange={e=>setItemFulfilmentId(e.target.value)}>
                          <option value="">Use default ({fulfillmentPolicies.find(p=>p.fulfillmentPolicyId===fulfillmentPolicyId)?.name||'none set'})</option>
                          {fulfillmentPolicies.map(p=><option key={p.fulfillmentPolicyId} value={p.fulfillmentPolicyId}>{p.name}</option>)}
                        </select>
                      : <div style={{fontSize:11,color:'#6e7681'}}>Set up postage policies in My Account → eBay Setup first</div>
                    }
                  </div>
                  <div style={S.field}>
                    <label style={S.lbl}>Your actual postage cost ({sym})</label>
                    <input style={S.inp} type="number" step="0.01" min="0" value={sellerPostage} onChange={e=>setSellerPostage(e.target.value)} placeholder="e.g. 0.91"/>
                    <div style={{fontSize:10,color:'#6e7681',marginTop:2}}>What YOU pay — even if buyer gets free postage</div>
                  </div>
                </div>
                <div style={S.field}>
                  <label style={S.lbl}>Condition description (optional)</label>
                  <input style={S.inp} value={conditionDesc} onChange={e=>setConditionDesc(e.target.value)} placeholder="e.g. Light scratch on corner"/>
                </div>

                {/* Postal code */}
                <div style={S.field}>
                  <label style={S.lbl}>Your postal code (item location shown on eBay)</label>
                  <input style={{...S.inp,maxWidth:160}} value={postalCode} onChange={e=>setPostalCode(e.target.value)} placeholder="e.g. LE11 1AA"/>
                  <div style={{fontSize:10,color:'#6e7681',marginTop:2}}>Set once in ⚙️ Settings so you don't have to enter it each time</div>
                </div>

                {/* Policy status */}
                <div style={{fontSize:11,color:'#8b949e'}}>
                  Policies: {(fulfillmentPolicyId&&paymentPolicyId&&returnPolicyId)
                    ? <span style={{color:'#3fb950'}}>✓ Configured</span>
                    : <span style={{color:'#f85149'}}>✗ Not configured — go to My Account → eBay Setup</span>
                  }
                </div>

                {/* Publish result */}
                {publishResult?.success&&(
                  <div style={S.success}>
                    <div style={{fontWeight:600,marginBottom:4}}>✓ Listed on eBay!</div>
                    <div>Listing ID: {publishResult.ebayItemId} · <a href={publishResult.listingUrl} target="_blank" rel="noreferrer" style={{color:'#3fb950'}}>View listing on eBay ↗</a></div>
                  </div>
                )}
                {publishResult?.error&&(
                  <div style={S.error}>
                    <div style={{fontWeight:600,marginBottom:4}}>✗ Listing failed</div>
                    <div>{publishResult.error}</div>
                    <div style={{marginTop:6,fontSize:11,color:'#f85149',opacity:.7}}>Check the checklist above, review item specifics, and ensure your eBay account is in good standing.</div>
                  </div>
                )}

                {!publishResult?.success&&(
                  <button
                    style={{...S.btnE,opacity:(!readyToPublish||publishing)?0.5:1,cursor:(!readyToPublish||publishing)?'not-allowed':'pointer'}}
                    disabled={!readyToPublish||publishing}
                    onClick={handlePublish}
                  >
                    {publishing?'Publishing…':'🏷 Publish listing on eBay'}
                  </button>
                )}
                {publishResult?.success&&<button style={S.btn} onClick={onClose}>Done</button>}
              </div>
            )}
          </div>

        </div>

        <div style={S.footer}>
          <span style={{fontSize:11,color:'#6e7681',alignSelf:'center',marginRight:'auto'}}>
            Added {item.dateStr}{item.listedAt?` · Listed ${item.listedAt}`:''}
            {item.ebayItemId&&<> · <a href={item.ebayListingUrl} target="_blank" rel="noreferrer" style={{color:'#58a6ff'}}>View on eBay ↗</a></>}
          </span>
          <button style={S.btn} onClick={onClose}>Cancel</button>
          <button style={S.btnP} onClick={handleSave}>Save changes</button>
        </div>

      </div>
    </div>
  );
}
