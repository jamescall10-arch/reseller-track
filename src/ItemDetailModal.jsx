import { useState } from 'react';
import PhotoUpload from './PhotoUpload.jsx';
import { EBAY_CATEGORIES, EBAY_CONDITIONS } from './ebayData.js';
import { isListingDeadZone } from './bundleUtils.js';

const S = {
  overlay: { position:'fixed',inset:0,background:'rgba(1,4,9,0.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200,padding:'16px' },
  box:     { background:'#161b22',border:'1px solid #30363d',borderRadius:12,width:'100%',maxWidth:680,maxHeight:'92vh',overflowY:'auto',display:'flex',flexDirection:'column' },
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
  btnR:    { padding:'8px 16px',borderRadius:6,border:'1px solid #1f6feb',background:'transparent',color:'#58a6ff',cursor:'pointer',fontSize:13,fontFamily:'system-ui',whiteSpace:'nowrap' },
  note:    { background:'#1c2128',border:'1px solid #9e6a03',color:'#d29922',borderRadius:6,padding:'7px 10px',fontSize:11,display:'flex',gap:8 },
  preview: { background:'#0d1117',border:'1px solid #30363d',borderRadius:8,padding:'14px 16px' },
  preH:    { fontSize:11,fontWeight:500,color:'#8b949e',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:10 },
  badge:   { display:'inline-block',background:'rgba(240,136,62,0.12)',color:'#f0883e',border:'1px solid rgba(240,136,62,0.25)',borderRadius:20,padding:'2px 10px',fontSize:11,fontWeight:600 },
};

export default function ItemDetailModal({ item, cats, sym='£', cfg={}, calcFees, onSave, onClose }){
  const [form, setForm] = useState({
    name:        item.name || '',
    price:       String(item.price || ''),
    qty:         String(Math.max(1, Math.floor(Number(item.qty)) || 1)),
    buyCost:     (item.buyCost > 0) ? String(item.buyCost) : '',
    condition:   item.condition    || '',
    ebayCategory:item.ebayCategory || '',
    photos:      item.photos       || [],
  });

  const [showPreview, setShowPreview] = useState(false);

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const priceNum   = parseFloat(form.price) || 0;
  const buyCostNum = parseFloat(form.buyCost) || 0;
  const fees       = calcFees ? calcFees(priceNum) : +(priceNum * 0.129 + 0.30).toFixed(2);
  const estProfit  = +(priceNum - fees - buyCostNum).toFixed(2);
  const deadZone   = isListingDeadZone(form.price);

  const catName = EBAY_CATEGORIES.flatMap(g => g.items).find(c => c.id === form.ebayCategory)?.name || '';
  const catLabel = cats?.find(c => c.id === item.categoryId)?.name || '';

  const descParts = [];
  if (form.condition) descParts.push(`Condition: ${form.condition}`);
  if (cfg?.listingDescription?.trim()) descParts.push(cfg.listingDescription.trim());
  const previewDesc = descParts.join('\n\n');

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
    });
    onClose();
  };

  const statusBadge = item.status === 'listed'
    ? { label:'Active listing', color:'#f0883e' }
    : { label:'In stock', color:'#8b949e' };

  return (
    <div style={S.overlay} onClick={e => { if(e.target===e.currentTarget) onClose(); }}>
      <div style={S.box}>

        {/* Header */}
        <div style={S.header}>
          <div style={{display:'flex',alignItems:'center',gap:10,overflow:'hidden'}}>
            <span style={{fontSize:15,fontWeight:600,color:'#e6edf3',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{form.name||'Unnamed item'}</span>
            <span style={{...S.badge,color:statusBadge.color,borderColor:`${statusBadge.color}40`,background:`${statusBadge.color}15`,flexShrink:0}}>{statusBadge.label}</span>
          </div>
          <button style={{...S.btn,padding:'3px 8px',flexShrink:0}} onClick={onClose}>✕</button>
        </div>

        <div style={S.body}>

          {/* Photos */}
          <div style={S.field}>
            <label style={S.lbl}>Photos ({form.photos.length}/12)</label>
            <PhotoUpload photos={form.photos} onChange={v => f('photos', v)}/>
          </div>

          {/* Name */}
          <div style={S.field}>
            <label style={S.lbl}>Item name</label>
            <input style={S.inp} value={form.name} onChange={e => f('name', e.target.value)} placeholder="Item name"/>
          </div>

          {/* Price / Qty / Buy cost */}
          <div style={S.row3}>
            <div style={S.field}>
              <label style={S.lbl}>Price ({sym})</label>
              <input style={S.inp} type="number" step="0.01" min="0" value={form.price} onChange={e => f('price', e.target.value)} placeholder="0.00"/>
            </div>
            <div style={S.field}>
              <label style={S.lbl}>Quantity</label>
              <input style={S.inp} type="number" step="1" min="1" value={form.qty} onChange={e => f('qty', e.target.value)}/>
            </div>
            <div style={S.field}>
              <label style={S.lbl}>Item cost ({sym})</label>
              <input style={S.inp} type="number" step="0.01" min="0" value={form.buyCost} onChange={e => f('buyCost', e.target.value)} placeholder="0.00"/>
            </div>
          </div>

          {/* Dead zone warning */}
          {deadZone && (
            <div style={S.note}>⚠️ Prices between £10 and £12.30 often earn less after extra postage. Consider pricing above or below this range.</div>
          )}

          {/* Profit estimate */}
          {priceNum > 0 && (
            <div style={{background:'#21262d',borderRadius:6,padding:'8px 12px',fontSize:12,display:'flex',gap:16,flexWrap:'wrap'}}>
              <span style={{color:'#8b949e'}}>Est. fees: <strong style={{color:'#f85149'}}>{sym}{fees.toFixed(2)}</strong></span>
              <span style={{color:'#8b949e'}}>Est. profit: <strong style={{color:estProfit>=0?'#3fb950':'#f85149'}}>{sym}{estProfit.toFixed(2)}</strong></span>
              {catLabel&&<span style={{color:'#8b949e'}}>Category: <strong style={{color:'#e6edf3'}}>{catLabel}</strong></span>}
            </div>
          )}

          {/* Condition */}
          <div style={S.row2}>
            <div style={S.field}>
              <label style={S.lbl}>Condition</label>
              <select style={S.inp} value={form.condition} onChange={e => f('condition', e.target.value)}>
                <option value="">Select condition…</option>
                {EBAY_CONDITIONS.map(g => (
                  <optgroup key={g.group} label={g.group}>
                    {g.items.map(c => <option key={c} value={c}>{c}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div style={S.field}>
              <label style={S.lbl}>eBay category</label>
              <select style={S.inp} value={form.ebayCategory} onChange={e => f('ebayCategory', e.target.value)}>
                <option value="">Select category…</option>
                {EBAY_CATEGORIES.map(g => (
                  <optgroup key={g.group} label={g.group}>
                    {g.items.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>

          {/* eBay listing preview */}
          <div>
            <button
              type="button"
              style={{...S.btn,fontSize:12,padding:'5px 10px',marginBottom:8}}
              onClick={() => setShowPreview(p => !p)}
            >
              {showPreview ? '▲ Hide' : '▼ Show'} eBay listing preview
            </button>
            {showPreview && (
              <div style={S.preview}>
                <div style={S.preH}>eBay listing preview</div>
                {form.photos.length > 0 && (
                  <div style={{display:'flex',gap:8,marginBottom:12,overflowX:'auto',paddingBottom:4}}>
                    {form.photos.map((url,i) => (
                      <img key={i} src={url} alt="" style={{width:80,height:80,objectFit:'cover',borderRadius:6,flexShrink:0,border:'1px solid #30363d'}}/>
                    ))}
                  </div>
                )}
                {!form.photos.length && (
                  <div style={{background:'#21262d',borderRadius:6,height:80,display:'flex',alignItems:'center',justifyContent:'center',color:'#6e7681',fontSize:12,marginBottom:12}}>No photos yet — add photos above</div>
                )}
                <div style={{fontSize:17,fontWeight:700,color:'#e6edf3',marginBottom:6,lineHeight:1.3}}>{form.name||'Item name'}</div>
                <div style={{display:'flex',gap:12,marginBottom:8,flexWrap:'wrap'}}>
                  <span style={{fontSize:22,fontWeight:700,color:'#f0883e'}}>{sym}{priceNum.toFixed(2)}</span>
                  {form.condition&&<span style={{fontSize:12,color:'#8b949e',alignSelf:'center'}}>{form.condition}</span>}
                  {catName&&<span style={{fontSize:11,color:'#6e7681',alignSelf:'center'}}>{catName}</span>}
                </div>
                {previewDesc && (
                  <div style={{fontSize:12,color:'#8b949e',lineHeight:1.7,whiteSpace:'pre-wrap',borderTop:'1px solid #30363d',paddingTop:8}}>{previewDesc}</div>
                )}
                {!previewDesc && (
                  <div style={{fontSize:11,color:'#6e7681',borderTop:'1px solid #30363d',paddingTop:8}}>No description — add a standard listing description in ⚙️ Settings</div>
                )}
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div style={S.footer}>
          <span style={{fontSize:11,color:'#6e7681',alignSelf:'center',marginRight:'auto'}}>Added {item.dateStr}{item.listedAt?` · Listed ${item.listedAt}`:''}</span>
          <button style={S.btn} onClick={onClose}>Cancel</button>
          <button style={S.btnP} onClick={handleSave}>Save changes</button>
        </div>

      </div>
    </div>
  );
}
