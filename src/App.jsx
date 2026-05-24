import { useState, useEffect, useMemo } from "react";

// ── Storage abstraction ─────────────────────────────────────────────────────
// Uses localStorage for web deployment (data stays in the user's browser).
// If running inside a Claude artifact, swap the two lines below with:
//   get: k => window.storage.get('rt-'+k).catch(()=>null).then(r=>r?r.value:null),
//   set: (k,v) => window.storage.set('rt-'+k, String(v)).catch(()=>{}),
const store = {
  get: k => Promise.resolve(localStorage.getItem('rt-'+k)),
  set: (k,v) => Promise.resolve(localStorage.setItem('rt-'+k, String(v))),
};

// ── Helpers ─────────────────────────────────────────────────────────────────
const nowStr = () => new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'});
const ebayUrl = name => `https://www.ebay.co.uk/sch/i.html?_nkw=${encodeURIComponent(name)}&LH_Sold=1&LH_Complete=1`;
const money = (n,sym) => (n<0?'-':'')+sym+Math.abs(n).toFixed(2);

const DEFAULTS = {
  businessName: 'My eBay Store',
  currency: '£',
  baseFee: 15,       // percent — starting point before enough sales data
  postage: 1.00,     // default postage cost per item
  initialSpend: 0,   // stock spend before using this app
  taxCountry: 'UK',
};

const SORT_OPTS = [['price-desc','Price ↓'],['price-asc','Price ↑'],['name','Name A–Z']];

// ── Small shared components ──────────────────────────────────────────────────
function NavBtn({active,onClick,children}){
  return(
    <button onClick={onClick} style={{
      padding:'8px 14px',border:'1px solid transparent',borderBottom:'none',
      borderRadius:'6px 6px 0 0',background:active?'#0d1117':'transparent',
      color:active?'#e6edf3':'#8b949e',cursor:'pointer',fontSize:13,
      display:'flex',alignItems:'center',gap:6,marginBottom:-1,
      borderColor:active?'#30363d':'transparent',fontFamily:'system-ui,sans-serif',
      whiteSpace:'nowrap',
    }}>{children}</button>
  );
}

function IBtn({href,onClick,title,col,children}){
  const base={
    width:26,height:26,border:'1px solid #30363d',borderRadius:5,
    background:'transparent',cursor:'pointer',display:'flex',alignItems:'center',
    justifyContent:'center',color:col||'#8b949e',textDecoration:'none',flexShrink:0,fontSize:13,
  };
  if(href) return <a href={href} target="_blank" rel="noreferrer" style={base} title={title}>{children}</a>;
  return <button style={base} onClick={onClick} title={title}>{children}</button>;
}

function Modal({title,onClose,children,wide}){
  return(
    <div style={{position:'fixed',inset:0,background:'rgba(1,4,9,0.8)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:'#161b22',border:'1px solid #30363d',borderRadius:12,padding:20,
        width:wide?520:360,maxWidth:'95vw',maxHeight:'90vh',overflowY:'auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
          <span style={{fontSize:15,fontWeight:600,color:'#e6edf3'}}>{title}</span>
          <button style={{padding:'3px 8px',border:'1px solid #30363d',background:'transparent',
            cursor:'pointer',fontSize:13,color:'#e6edf3',borderRadius:5}} onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App(){

  // Core data
  const [cfg,setCfg]       = useState(DEFAULTS);
  const [cats,setCats]     = useState([]);   // [{id,name}]
  const [items,setItems]   = useState([]);   // [{id,name,categoryId,price,buyCost,status,dateStr}]
  const [sales,setSales]   = useState([]);   // [{id,itemId,itemName,categoryId,listedPrice,soldPrice,actualFees,feeWasEstimated,moneyIn,postage,profit,date}]
  const [extraSpend,setExtraSpend] = useState(0);
  const [ready,setReady]   = useState(false);

  // Nav + tab UI
  const [tab,setTab]       = useState('inventory');

  // Inventory state
  const [invCat,setInvCat]       = useState(null);
  const [invSearch,setInvSearch] = useState('');
  const [invSort,setInvSort]     = useState('price-desc');

  // Listings state
  const [lstCat,setLstCat]       = useState(null);
  const [lstSearch,setLstSearch] = useState('');
  const [lstSort,setLstSort]     = useState('price-desc');

  // Settings modal
  const [showCfg,setShowCfg]   = useState(false);
  const [cfgForm,setCfgForm]   = useState(DEFAULTS);

  // Add category modal
  const [showAddCat,setShowAddCat] = useState(false);
  const [newCatName,setNewCatName] = useState('');

  // Add item modal
  const [showAddItem,setShowAddItem] = useState(false);
  const [addName,setAddName]   = useState('');
  const [addPrice,setAddPrice] = useState('');
  const [addBuy,setAddBuy]     = useState('');

  // Sell modal
  const [sellItem,setSellItem]   = useState(null);
  const [soldP,setSoldP]         = useState('');
  const [actualFee,setActualFee] = useState('');
  const [postageP,setPostageP]   = useState('');

  // Buy calculator
  const [bundle,setBundle]     = useState([]);
  const [bundleIn,setBundleIn] = useState('');

  // ── Load from storage ───────────────────────────────────────────────────────
  useEffect(()=>{
    const load = async () => {
      try {
        const [c,ca,it,sa,es] = await Promise.all(
          ['cfg','cats','items','sales','extraspend'].map(k=>store.get(k))
        );
        if(c){ const p=JSON.parse(c); setCfg({...DEFAULTS,...p}); setCfgForm({...DEFAULTS,...p}); }
        if(ca) setCats(JSON.parse(ca));
        if(it) setItems(JSON.parse(it));
        if(sa) setSales(JSON.parse(sa));
        if(es) setExtraSpend(parseFloat(es)||0);
      } catch{}
      setReady(true);
    };
    load();
  },[]);

  useEffect(()=>{ if(ready) store.set('cfg',JSON.stringify(cfg)); },[cfg,ready]);
  useEffect(()=>{ if(ready) store.set('cats',JSON.stringify(cats)); },[cats,ready]);
  useEffect(()=>{ if(ready) store.set('items',JSON.stringify(items)); },[items,ready]);
  useEffect(()=>{ if(ready) store.set('sales',JSON.stringify(sales)); },[sales,ready]);
  useEffect(()=>{ if(ready) store.set('extraspend',String(extraSpend)); },[extraSpend,ready]);

  // ── Dynamic fee rate ────────────────────────────────────────────────────────
  // Starts at the user's base rate (default 15%).
  // Once 3+ sales have been logged with ACTUAL fees entered (not estimated),
  // it switches to the real average rate derived from your own sales data.
  const effectiveFeeRate = useMemo(()=>{
    const actual = sales.filter(s=>s.soldPrice>0&&s.actualFees>0&&!s.feeWasEstimated);
    if(actual.length<3) return null;
    return +(actual.reduce((sum,s)=>sum+(s.actualFees/s.soldPrice),0)/actual.length).toFixed(4);
  },[sales]);

  const baseFeeRate   = (cfg.baseFee||15)/100;
  const activeFeeRate = effectiveFeeRate ?? baseFeeRate;
  const calcFees      = p => +(p*activeFeeRate).toFixed(2);
  const sym           = cfg.currency || '£';
  const fmt           = n => money(n,sym);
  const feeLabel      = effectiveFeeRate
    ? `${(effectiveFeeRate*100).toFixed(1)}% (from your sales)`
    : `${cfg.baseFee||15}% (base rate)`;

  // ── Resolved category selections ────────────────────────────────────────────
  const curInvCat = invCat ?? cats[0]?.id ?? null;
  const curLstCat = lstCat ?? cats[0]?.id ?? null;

  // ── Filtered item lists ─────────────────────────────────────────────────────
  const filteredItems = useMemo(()=>{
    let l = items.filter(it=>it.categoryId===curInvCat&&it.status==='stock');
    if(invSearch) l = l.filter(it=>it.name.toLowerCase().includes(invSearch.toLowerCase()));
    l.sort((a,b)=>invSort==='price-asc'?a.price-b.price:invSort==='name'?a.name.localeCompare(b.name):b.price-a.price);
    return l;
  },[items,curInvCat,invSearch,invSort]);

  const filteredListed = useMemo(()=>{
    let l = items.filter(it=>it.categoryId===curLstCat&&it.status==='listed');
    if(lstSearch) l = l.filter(it=>it.name.toLowerCase().includes(lstSearch.toLowerCase()));
    l.sort((a,b)=>lstSort==='price-asc'?a.price-b.price:lstSort==='name'?a.name.localeCompare(b.name):b.price-a.price);
    return l;
  },[items,curLstCat,lstSearch,lstSort]);

  // ── Stats ───────────────────────────────────────────────────────────────────
  const stats = useMemo(()=>({
    inStock:  items.filter(it=>it.status==='stock').length,
    listed:   items.filter(it=>it.status==='listed').length,
    sold:     sales.length,
    totalSpent: +(Number(cfg.initialSpend||0)+extraSpend).toFixed(2),
    totalProfit: +sales.reduce((s,sa)=>s+sa.profit,0).toFixed(2),
  }),[items,sales,cfg.initialSpend,extraSpend]);

  // ── Sell modal live calculations ────────────────────────────────────────────
  const spNum     = parseFloat(soldP)||0;
  const afNum     = parseFloat(actualFee);
  const poNum     = parseFloat(postageP)||0;
  const feeIsEst  = isNaN(afNum)||actualFee==='';
  const feesUsed  = feeIsEst ? calcFees(spNum) : +afNum.toFixed(2);
  const moneyIn   = spNum>0 ? +(spNum-feesUsed).toFixed(2) : 0;
  const sellProfit= spNum>0 ? +(moneyIn-poNum-0.15).toFixed(2) : 0;

  // ── Bundle calculator ───────────────────────────────────────────────────────
  const bundleGross    = +bundle.reduce((s,p)=>s+p,0).toFixed(2);
  const bundleFeeTotal = +bundle.reduce((s,p)=>s+calcFees(p),0).toFixed(2);
  const bundlePostage  = +(bundle.length*(cfg.postage||1)).toFixed(2);
  const bundleNet      = +(bundleGross-bundleFeeTotal-bundlePostage).toFixed(2);
  const bundlePay      = +(bundleNet*0.6).toFixed(2);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const addCat = () => {
    if(!newCatName.trim()){ alert('Enter a category name'); return; }
    const cat = { id:'cat_'+Date.now(), name:newCatName.trim() };
    setCats(p=>[...p,cat]);
    setInvCat(cat.id); setLstCat(cat.id);
    setNewCatName(''); setShowAddCat(false);
  };

  const addItem = () => {
    if(!addName.trim()){ alert('Enter an item name'); return; }
    const price = parseFloat(addPrice)||0;
    if(price<=0){ alert('Enter a price'); return; }
    const bc = parseFloat(addBuy)||0;
    const it = { id:Date.now(), name:addName.trim(), categoryId:curInvCat, price, buyCost:bc, status:'stock', dateStr:nowStr() };
    setItems(p=>[it,...p]);
    if(bc>0) setExtraSpend(p=>+(p+bc).toFixed(2));
    setAddName(''); setAddPrice(''); setAddBuy(''); setShowAddItem(false);
  };

  const confirmSell = () => {
    if(spNum<=0){ alert('Enter a sale price'); return; }
    const it = sellItem;
    const sale = {
      id:Date.now(), itemId:it.id, itemName:it.name, categoryId:it.categoryId,
      listedPrice:it.price, soldPrice:spNum, actualFees:feesUsed,
      feeWasEstimated:feeIsEst, moneyIn, postage:poNum, profit:sellProfit, date:nowStr(),
    };
    setSales(p=>[sale,...p]);
    setItems(p=>p.map(x=>x.id===it.id?{...x,status:'sold'}:x));
    setSellItem(null); setSoldP(''); setActualFee(''); setPostageP('');
  };

  const saveCfg = () => {
    const updated = {...cfgForm, baseFee:Number(cfgForm.baseFee)||15, postage:Number(cfgForm.postage)||1, initialSpend:Number(cfgForm.initialSpend)||0 };
    setCfg(updated); setCfgForm(updated); setShowCfg(false);
  };

  // ── Styles ───────────────────────────────────────────────────────────────────
  const S = {
    app:      {fontFamily:'system-ui,sans-serif',background:'#0d1117',color:'#e6edf3',minHeight:'100vh',display:'flex',flexDirection:'column'},
    nav:      {display:'flex',gap:2,padding:'10px 16px 0',background:'#161b22',borderBottom:'1px solid #30363d',flexWrap:'wrap',alignItems:'flex-end'},
    navRight: {display:'flex',alignItems:'center',gap:8,marginLeft:'auto',paddingBottom:10},
    sRow:     {display:'grid',gap:8,padding:'12px 16px',background:'#161b22',borderBottom:'1px solid #30363d'},
    sCard:    {background:'#21262d',borderRadius:6,padding:'10px 14px',border:'1px solid #30363d'},
    sV:       {fontSize:20,fontWeight:600,display:'block',lineHeight:1.2},
    sL:       {fontSize:11,color:'#8b949e',marginTop:2,display:'block'},
    main:     {flex:1,padding:16,overflowY:'auto'},
    toolbar:  {display:'flex',gap:8,marginBottom:10,flexWrap:'wrap',alignItems:'center'},
    sWrap:    {position:'relative',flex:1,minWidth:160},
    sInput:   {width:'100%',padding:'7px 10px 7px 30px',border:'1px solid #30363d',borderRadius:6,background:'#21262d',color:'#e6edf3',fontSize:13,fontFamily:'system-ui'},
    sIcon:    {position:'absolute',left:9,top:'50%',transform:'translateY(-50%)',color:'#8b949e',fontSize:13,pointerEvents:'none'},
    sel:      {padding:'6px 8px',border:'1px solid #30363d',borderRadius:6,background:'#21262d',color:'#e6edf3',fontSize:12,fontFamily:'system-ui'},
    addBtn:   {display:'flex',alignItems:'center',gap:5,padding:'6px 12px',border:'1px solid #238636',borderRadius:6,background:'#238636',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:500,fontFamily:'system-ui',whiteSpace:'nowrap'},
    catTab:   {padding:'5px 11px',border:'1px solid #30363d',borderRadius:6,background:'transparent',color:'#8b949e',cursor:'pointer',fontSize:12,fontFamily:'system-ui',whiteSpace:'nowrap'},
    catTabA:  {background:'#1f6feb',color:'#fff',borderColor:'#1f6feb',fontWeight:500},
    tWrap:    {border:'1px solid #30363d',borderRadius:8,overflow:'hidden'},
    tbl:      {width:'100%',borderCollapse:'collapse',fontSize:12,tableLayout:'fixed'},
    th:       {padding:'8px 10px',textAlign:'left',fontWeight:500,fontSize:11,color:'#8b949e',background:'#161b22',borderBottom:'1px solid #30363d',whiteSpace:'nowrap'},
    td:       {padding:'6px 10px',borderBottom:'1px solid #21262d',verticalAlign:'middle'},
    fRow:     {fontSize:11,color:'#8b949e',padding:'8px 0 0',textAlign:'right'},
    acts:     {display:'flex',gap:3,alignItems:'center'},
    field:    {marginBottom:10},
    fLbl:     {display:'block',fontSize:11,color:'#8b949e',marginBottom:4,fontWeight:500},
    fInp:     {width:'100%',padding:'7px 10px',border:'1px solid #30363d',borderRadius:6,background:'#21262d',color:'#e6edf3',fontSize:13,fontFamily:'system-ui'},
    mBtn:     {padding:'7px 14px',borderRadius:6,border:'1px solid #30363d',background:'transparent',cursor:'pointer',fontSize:13,color:'#e6edf3',fontFamily:'system-ui'},
    mBtnP:    {padding:'7px 14px',borderRadius:6,border:'1px solid #238636',background:'#238636',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:500,fontFamily:'system-ui'},
    mActs:    {display:'flex',gap:8,marginTop:16,justifyContent:'flex-end'},
    cCard:    {background:'#161b22',border:'1px solid #30363d',borderRadius:8,padding:16,marginBottom:10},
    cH:       {fontSize:11,fontWeight:500,color:'#8b949e',marginBottom:10,textTransform:'uppercase',letterSpacing:'0.06em'},
    bRow:     {display:'flex',justifyContent:'space-between',padding:'5px 0',fontSize:13,borderBottom:'1px solid #21262d'},
    empty:    {textAlign:'center',padding:'40px 20px',color:'#8b949e',fontSize:13,lineHeight:1.7},
    iCard:    {background:'#161b22',border:'1px solid #30363d',borderRadius:8,padding:'14px 16px',marginBottom:10},
  };

  if(!ready) return <div style={{...S.app,alignItems:'center',justifyContent:'center',fontSize:14,color:'#8b949e'}}>Loading…</div>;

  // ── First-run welcome ───────────────────────────────────────────────────────
  if(cats.length===0){
    return(
      <div style={{...S.app,alignItems:'center',justifyContent:'center'}}>
        <div style={{maxWidth:440,textAlign:'center',padding:32}}>
          <div style={{fontSize:52,marginBottom:16}}>📦</div>
          <h1 style={{fontSize:26,fontWeight:700,marginBottom:8,color:'#e6edf3'}}>ResellerTrack</h1>
          <p style={{fontSize:14,color:'#8b949e',lineHeight:1.7,marginBottom:4}}>Track your stock, active listings, sales and profit.</p>
          <p style={{fontSize:13,color:'#6e7681',marginBottom:28}}>Built for eBay resellers of anything — from trading cards to vintage tech.</p>
          <p style={{fontSize:13,color:'#e6edf3',marginBottom:12,fontWeight:500}}>Start by creating a category for what you sell:</p>
          <div style={{display:'flex',gap:8,marginBottom:16,maxWidth:360,margin:'0 auto 16px'}}>
            <input style={{...S.fInp,flex:1}} placeholder="e.g. Trading Cards, Clothing…" value={newCatName}
              onChange={e=>setNewCatName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addCat()} autoFocus/>
            <button style={S.addBtn} onClick={addCat}>Create</button>
          </div>
          <button style={{...S.mBtn,fontSize:12,margin:'0 auto'}} onClick={()=>{setCfgForm(cfg);setShowCfg(true);}}>⚙️ Configure settings first</button>
        </div>
        {showCfg&&<SettingsModal cfg={cfgForm} onChange={setCfgForm} onSave={saveCfg} onClose={()=>setShowCfg(false)} S={S} feeLabel={feeLabel} effectiveFeeRate={effectiveFeeRate}/>}
      </div>
    );
  }

  // ── Tax year helpers ─────────────────────────────────────────────────────────
  const parseDateStr = str => {
    if(!str) return null;
    const mo={Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
    const p=str.split(' ');
    if(p.length!==3) return null;
    return new Date(2000+parseInt(p[2]),mo[p[1]],parseInt(p[0]));
  };
  const now = new Date();
  const tyYear = (now.getMonth()>3||(now.getMonth()===3&&now.getDate()>=6)) ? now.getFullYear() : now.getFullYear()-1;
  const tyStart = new Date(tyYear,3,6);
  const tyLabel = `${tyYear}–${(tyYear+1).toString().slice(2)}`;
  const tySales = sales.filter(s=>{ const d=parseDateStr(s.date); return d&&d>=tyStart; });
  const tyGross  = +tySales.reduce((a,s)=>a+s.soldPrice,0).toFixed(2);
  const tyFees   = +tySales.reduce((a,s)=>a+s.actualFees,0).toFixed(2);
  const tyPost   = +tySales.reduce((a,s)=>a+s.postage,0).toFixed(2);
  const tyPack   = +(tySales.length*0.15).toFixed(2);
  const tyNet    = +(tyGross-tyFees-tyPost-tyPack).toFixed(2);
  const tyPct    = Math.min(100,(tyGross/1000)*100);
  const tyOver   = tyGross>=1000;

  // ── Main render ──────────────────────────────────────────────────────────────
  return(
    <div style={S.app}>

      {/* Nav */}
      <nav style={S.nav}>
        {[
          ['inventory','📦 Inventory',''],
          ['listings','🏷️ Active Listings', stats.listed>0?` (${stats.listed})`:''],
          ['buying','🧮 Buy Calculator',''],
          ['sales','💰 Sales Log',''],
          ['taxes','💷 Taxes',''],
        ].map(([t,l,badge])=>(
          <NavBtn key={t} active={tab===t} onClick={()=>setTab(t)}>{l}{badge}</NavBtn>
        ))}
        <div style={S.navRight}>
          {effectiveFeeRate&&(
            <span style={{fontSize:11,color:'#3fb950',whiteSpace:'nowrap'}}>
              ✓ Fee rate: {(effectiveFeeRate*100).toFixed(1)}%
            </span>
          )}
          <button style={{...S.mBtn,fontSize:12,padding:'5px 10px',whiteSpace:'nowrap'}}
            onClick={()=>{setCfgForm(cfg);setShowCfg(true);}}>⚙️ Settings</button>
        </div>
      </nav>

      {/* Stats bar */}
      <div style={{...S.sRow,gridTemplateColumns:'repeat(5,1fr)'}}>
        {[
          ['In stock',    stats.inStock,    '#8b949e'],
          ['Listed',      stats.listed,     '#f0883e'],
          ['Total spent', fmt(stats.totalSpent), '#f85149'],
          ['Sold',        stats.sold,       '#e6edf3'],
          ['Total profit',fmt(stats.totalProfit), stats.totalProfit>=0?'#3fb950':'#f85149'],
        ].map(([l,v,c])=>(
          <div key={l} style={S.sCard}><span style={{...S.sV,color:c}}>{v}</span><span style={S.sL}>{l}</span></div>
        ))}
      </div>

      {/* Main content */}
      <div style={S.main}>

        {/* ── INVENTORY ── */}
        {tab==='inventory'&&(()=>{
          const counts = Object.fromEntries(cats.map(c=>[c.id,items.filter(it=>it.categoryId===c.id&&it.status==='stock').length]));
          return <>
            <div style={{display:'flex',gap:6,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
              {cats.map(c=>(
                <button key={c.id} style={{...S.catTab,...(curInvCat===c.id?S.catTabA:{})}}
                  onClick={()=>{setInvCat(c.id);setInvSearch('');}}>
                  {c.name} <span style={{opacity:.6}}>({counts[c.id]||0})</span>
                </button>
              ))}
              <button style={{...S.catTab,marginLeft:'auto',color:'#58a6ff',borderColor:'#1f6feb'}}
                onClick={()=>{setNewCatName('');setShowAddCat(true);}}>＋ New category</button>
            </div>
            <div style={S.toolbar}>
              <div style={S.sWrap}>
                <span style={S.sIcon}>🔍</span>
                <input style={S.sInput} placeholder={`Search ${cats.find(c=>c.id===curInvCat)?.name||''}…`}
                  value={invSearch} onChange={e=>setInvSearch(e.target.value)}/>
              </div>
              <select style={S.sel} value={invSort} onChange={e=>setInvSort(e.target.value)}>
                {SORT_OPTS.map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select>
              <button style={S.addBtn} onClick={()=>{setAddName('');setAddPrice('');setAddBuy('');setShowAddItem(true);}}>
                ＋ Add item
              </button>
            </div>
            <div style={S.tWrap}>
              <table style={S.tbl}>
                <thead><tr>
                  <th style={{...S.th,width:'44%'}}>Item</th>
                  <th style={{...S.th,width:'13%'}}>Added</th>
                  <th style={{...S.th,width:'12%',textAlign:'right'}}>Value</th>
                  <th style={{...S.th,width:'13%',textAlign:'right'}}>Net (est. {(activeFeeRate*100).toFixed(0)}%)</th>
                  <th style={{...S.th,width:'18%'}}>Actions</th>
                </tr></thead>
                <tbody>
                  {filteredItems.length===0&&<tr><td colSpan={5} style={S.empty}>No items yet — click ＋ Add item to get started</td></tr>}
                  {filteredItems.map((it,i)=>(
                    <tr key={it.id} style={{background:i%2===0?'transparent':'#161b22'}}>
                      <td style={S.td}><span style={{display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={it.name}>{it.name}</span></td>
                      <td style={{...S.td,color:'#8b949e',fontSize:11}}>{it.dateStr}</td>
                      <td style={{...S.td,textAlign:'right',color:'#f0883e',fontWeight:600}}>{fmt(it.price)}</td>
                      <td style={{...S.td,textAlign:'right',color:'#8b949e',fontSize:11}}>{fmt(it.price-calcFees(it.price))}</td>
                      <td style={S.td}><div style={S.acts}>
                        <IBtn href={ebayUrl(it.name)} title="Search eBay sold listings">🔍</IBtn>
                        <IBtn onClick={()=>setItems(p=>p.map(x=>x.id===it.id?{...x,status:'listed'}:x))} title="Move to Active Listings" col="#58a6ff">→</IBtn>
                        <IBtn onClick={()=>{if(confirm('Remove this item?'))setItems(p=>p.filter(x=>x.id!==it.id));}} title="Remove" col="#f85149">✕</IBtn>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={S.fRow}>Showing {filteredItems.length} of {items.filter(it=>it.categoryId===curInvCat&&it.status==='stock').length} items</div>
          </>;
        })()}

        {/* ── ACTIVE LISTINGS ── */}
        {tab==='listings'&&(()=>{
          const counts   = Object.fromEntries(cats.map(c=>[c.id,items.filter(it=>it.categoryId===c.id&&it.status==='listed').length]));
          const totalAll = items.filter(it=>it.status==='listed').length;
          const listVal  = filteredListed.reduce((s,it)=>s+it.price,0);
          return <>
            {totalAll===0&&lstSearch===''
              ? <div style={S.empty}>
                  <div style={{fontSize:32,marginBottom:8}}>🏷️</div>
                  No active listings yet.<br/>
                  Go to <span style={{color:'#58a6ff',cursor:'pointer'}} onClick={()=>setTab('inventory')}>Inventory</span> and press → on an item to list it.
                </div>
              : <>
                  <div style={{display:'flex',gap:6,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
                    {cats.map(c=>(
                      <button key={c.id} style={{...S.catTab,...(curLstCat===c.id?S.catTabA:{})}}
                        onClick={()=>{setLstCat(c.id);setLstSearch('');}}>
                        {c.name} <span style={{opacity:.6}}>({counts[c.id]||0})</span>
                      </button>
                    ))}
                  </div>
                  <div style={S.toolbar}>
                    <div style={S.sWrap}>
                      <span style={S.sIcon}>🔍</span>
                      <input style={S.sInput} placeholder="Search listings…" value={lstSearch} onChange={e=>setLstSearch(e.target.value)}/>
                    </div>
                    <select style={S.sel} value={lstSort} onChange={e=>setLstSort(e.target.value)}>
                      {SORT_OPTS.map(([v,l])=><option key={v} value={v}>{l}</option>)}
                    </select>
                    <span style={{fontSize:12,color:'#8b949e',marginLeft:'auto',whiteSpace:'nowrap'}}>
                      Listed value: <strong style={{color:'#f0883e'}}>{fmt(listVal)}</strong>
                    </span>
                  </div>
                  <div style={S.tWrap}>
                    <table style={S.tbl}>
                      <thead><tr>
                        <th style={{...S.th,width:'40%'}}>Item</th>
                        <th style={{...S.th,width:'13%'}}>Added</th>
                        <th style={{...S.th,width:'12%',textAlign:'right'}}>Listed price</th>
                        <th style={{...S.th,width:'12%',textAlign:'right'}}>Net (est.)</th>
                        <th style={{...S.th,width:'23%'}}>Actions</th>
                      </tr></thead>
                      <tbody>
                        {filteredListed.length===0&&<tr><td colSpan={5} style={S.empty}>No listed items in this category</td></tr>}
                        {filteredListed.map((it,i)=>(
                          <tr key={it.id} style={{background:i%2===0?'transparent':'#161b22'}}>
                            <td style={S.td}><span style={{display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={it.name}>{it.name}</span></td>
                            <td style={{...S.td,color:'#8b949e',fontSize:11}}>{it.dateStr}</td>
                            <td style={{...S.td,textAlign:'right',color:'#f0883e',fontWeight:600}}>{fmt(it.price)}</td>
                            <td style={{...S.td,textAlign:'right',color:'#8b949e',fontSize:11}}>{fmt(it.price-calcFees(it.price))}</td>
                            <td style={S.td}><div style={S.acts}>
                              <IBtn href={ebayUrl(it.name)} title="Search eBay sold listings">🔍</IBtn>
                              <IBtn onClick={()=>{setSellItem(it);setSoldP(it.price.toFixed(2));setActualFee('');setPostageP('');}} title="Log sale" col="#3fb950">£</IBtn>
                              <IBtn onClick={()=>setItems(p=>p.map(x=>x.id===it.id?{...x,status:'stock'}:x))} title="Move back to inventory" col="#8b949e">←</IBtn>
                              <IBtn onClick={()=>{if(confirm('Remove this item?'))setItems(p=>p.filter(x=>x.id!==it.id));}} title="Remove" col="#f85149">✕</IBtn>
                            </div></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={S.fRow}>{filteredListed.length} item{filteredListed.length!==1?'s':''} in this category</div>
                </>
            }
          </>;
        })()}

        {/* ── BUY CALCULATOR ── */}
        {tab==='buying'&&<>
          <div style={S.cCard}>
            <div style={S.cH}>Bundle entry — fee rate: {feeLabel}</div>
            <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
              <span style={{fontSize:13,color:'#8b949e',whiteSpace:'nowrap'}}>Item value ({sym})</span>
              <input style={{...S.fInp,width:120}} type="number" step="0.01" min="0" value={bundleIn}
                onChange={e=>setBundleIn(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter'){ const v=parseFloat(bundleIn); if(v>0){setBundle(p=>[...p,v]);setBundleIn('');} }}}
                placeholder="0.00"/>
              <button style={S.addBtn} onClick={()=>{ const v=parseFloat(bundleIn); if(v>0){setBundle(p=>[...p,v]);setBundleIn('');} }}>＋ Add</button>
              {bundle.length>0&&<button style={{...S.mBtn,fontSize:12,padding:'5px 10px'}} onClick={()=>setBundle([])}>Clear all</button>}
              {bundle.length>0&&<span style={{fontSize:12,color:'#8b949e',marginLeft:'auto'}}>{bundle.length} item{bundle.length!==1?'s':''}</span>}
            </div>
          </div>
          {bundle.length===0
            ? <div style={{...S.empty,paddingTop:48}}>
                <div style={{fontSize:28,marginBottom:8}}>🛒</div>
                Enter each item's value from the listing and press Enter or Add.<br/>
                <span style={{fontSize:11}}>We calculate what you should pay based on fees, postage, and a 60% margin.</span>
              </div>
            : <>
                <div style={S.tWrap}>
                  <table style={S.tbl}>
                    <thead><tr>
                      <th style={{...S.th,width:'6%'}}>#</th>
                      <th style={{...S.th,width:'23%',textAlign:'right'}}>Item value</th>
                      <th style={{...S.th,width:'23%',textAlign:'right'}}>eBay fees ({(activeFeeRate*100).toFixed(0)}%)</th>
                      <th style={{...S.th,width:'20%',textAlign:'right'}}>Postage</th>
                      <th style={{...S.th,width:'22%',textAlign:'right'}}>Net value</th>
                      <th style={{...S.th,width:'6%'}}></th>
                    </tr></thead>
                    <tbody>
                      {bundle.map((p,i)=>{
                        const fee=calcFees(p);
                        const net=+(p-fee-(cfg.postage||1)).toFixed(2);
                        return(
                          <tr key={i} style={{background:i%2===0?'transparent':'#161b22'}}>
                            <td style={{...S.td,color:'#8b949e',fontSize:11}}>{i+1}</td>
                            <td style={{...S.td,textAlign:'right',color:'#f0883e',fontWeight:600}}>{sym}{p.toFixed(2)}</td>
                            <td style={{...S.td,textAlign:'right',color:'#f85149',fontSize:12}}>−{sym}{fee.toFixed(2)}</td>
                            <td style={{...S.td,textAlign:'right',color:'#f85149',fontSize:12}}>−{sym}{(cfg.postage||1).toFixed(2)}</td>
                            <td style={{...S.td,textAlign:'right',fontWeight:600,color:net>=0?'#e6edf3':'#f85149'}}>{sym}{net.toFixed(2)}</td>
                            <td style={S.td}><IBtn onClick={()=>setBundle(p2=>p2.filter((_,j)=>j!==i))} col="#f85149">✕</IBtn></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{...S.cCard,marginTop:12}}>
                  <div style={S.cH}>Summary</div>
                  {[
                    [`Total listed value`,`${sym}${bundleGross.toFixed(2)}`,null],
                    [`eBay fees (${(activeFeeRate*100).toFixed(1)}% × ${bundle.length})`,`−${sym}${bundleFeeTotal.toFixed(2)}`,'#f85149'],
                    [`Postage (${sym}${(cfg.postage||1).toFixed(2)} × ${bundle.length})`,`−${sym}${bundlePostage.toFixed(2)}`,'#f85149'],
                  ].map(([l,v,c])=>(
                    <div key={l} style={S.bRow}><span style={{color:'#8b949e'}}>{l}</span><span style={c?{color:c}:{}}>{v}</span></div>
                  ))}
                  <div style={{...S.bRow,borderBottom:'none',paddingTop:8,marginTop:4,borderTop:'1px solid #30363d'}}>
                    <span style={{fontWeight:600}}>Total net value</span>
                    <span style={{fontWeight:700}}>{sym}{bundleNet.toFixed(2)}</span>
                  </div>
                </div>
                <div style={{marginTop:10,background:'#1a2f1a',border:'1px solid #238636',borderRadius:8,padding:'14px 18px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div>
                    <div style={{fontSize:12,color:'#7ee787',fontWeight:500,marginBottom:2}}>Amount you should pay</div>
                    <div style={{fontSize:11,color:'#3fb950',opacity:.8}}>60% of net value after fees and postage</div>
                  </div>
                  <div style={{fontSize:32,fontWeight:700,color:'#3fb950'}}>{sym}{bundlePay.toFixed(2)}</div>
                </div>
              </>
          }
        </>}

        {/* ── SALES LOG ── */}
        {tab==='sales'&&(()=>{
          if(sales.length===0) return(
            <div style={S.empty}><div style={{fontSize:32,marginBottom:8}}>💰</div>No sales yet.<br/>Log a sale from the Active Listings tab.</div>
          );
          const tIn   = sales.reduce((s,sa)=>s+sa.moneyIn,0);
          const tPost = sales.reduce((s,sa)=>s+sa.postage,0);
          const tProf = sales.reduce((s,sa)=>s+sa.profit,0);
          return <>
            <div style={{...S.sRow,padding:0,marginBottom:12,gridTemplateColumns:'repeat(4,1fr)'}}>
              <div style={S.sCard}><span style={S.sV}>{sales.length}</span><span style={S.sL}>Sales</span></div>
              <div style={S.sCard}><span style={{...S.sV,color:'#f0883e'}}>{fmt(tIn)}</span><span style={S.sL}>Money in</span></div>
              <div style={S.sCard}><span style={{...S.sV,color:'#f85149'}}>{fmt(tPost)}</span><span style={S.sL}>Postage paid</span></div>
              <div style={S.sCard}><span style={{...S.sV,color:tProf>=0?'#3fb950':'#f85149'}}>{fmt(tProf)}</span><span style={S.sL}>Total profit</span></div>
            </div>
            {effectiveFeeRate&&(
              <div style={{fontSize:11,color:'#3fb950',background:'#1a2f1a',border:'1px solid #238636',borderRadius:6,padding:'6px 10px',marginBottom:10}}>
                ✓ Fee rate auto-updated to {(effectiveFeeRate*100).toFixed(1)}% based on {sales.filter(s=>!s.feeWasEstimated).length} sales with actual fees entered.
              </div>
            )}
            <div style={S.tWrap}>
              <table style={S.tbl}>
                <thead><tr>
                  <th style={{...S.th,width:'29%'}}>Item</th>
                  <th style={{...S.th,width:'10%'}}>Date</th>
                  <th style={{...S.th,width:'11%',textAlign:'right'}}>Sale price</th>
                  <th style={{...S.th,width:'11%',textAlign:'right'}}>eBay fees</th>
                  <th style={{...S.th,width:'11%',textAlign:'right'}}>Money in</th>
                  <th style={{...S.th,width:'11%',textAlign:'right'}}>Postage</th>
                  <th style={{...S.th,width:'11%',textAlign:'right'}}>Profit</th>
                  <th style={{...S.th,width:'6%'}}></th>
                </tr></thead>
                <tbody>
                  {sales.map((sa,i)=>(
                    <tr key={sa.id} style={{background:i%2===0?'transparent':'#161b22'}}>
                      <td style={S.td}><span style={{display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={sa.itemName}>{sa.itemName}</span></td>
                      <td style={{...S.td,color:'#8b949e',fontSize:11}}>{sa.date}</td>
                      <td style={{...S.td,textAlign:'right',color:'#8b949e'}}>{fmt(sa.soldPrice)}</td>
                      <td style={{...S.td,textAlign:'right',color:'#f85149',fontSize:11}}>
                        −{fmt(sa.actualFees)}{sa.feeWasEstimated&&<span style={{color:'#6e7681'}}> est.</span>}
                      </td>
                      <td style={{...S.td,textAlign:'right',color:'#f0883e',fontWeight:600}}>{fmt(sa.moneyIn)}</td>
                      <td style={{...S.td,textAlign:'right',color:sa.postage>0?'#f85149':'#8b949e',fontSize:11}}>
                        {sa.postage>0?'−'+fmt(sa.postage):'—'}
                      </td>
                      <td style={{...S.td,textAlign:'right',fontWeight:700,color:sa.profit>=0?'#3fb950':'#f85149'}}>{fmt(sa.profit)}</td>
                      <td style={S.td}><IBtn onClick={()=>{if(confirm('Delete sale?'))setSales(p=>p.filter(x=>x.id!==sa.id));}} col="#f85149">✕</IBtn></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>;
        })()}

        {/* ── TAXES ── */}
        {tab==='taxes'&&(()=>{
          const IC=({title,children,acc})=>(
            <div style={{...S.iCard,border:`1px solid ${acc||'#30363d'}`}}>
              <div style={{fontSize:13,fontWeight:600,marginBottom:10,color:'#e6edf3'}}>{title}</div>
              {children}
            </div>
          );
          const P=({c,children})=><p style={{fontSize:12,color:c||'#8b949e',lineHeight:1.7,margin:'0 0 6px'}}>{children}</p>;
          const LI=({children})=><li style={{fontSize:12,color:'#8b949e',lineHeight:1.7,marginBottom:3}}>{children}</li>;
          const statusC=tyGross<1000?'#3fb950':tyGross<5000?'#d29922':'#f85149';
          return <div>
            {cfg.taxCountry!=='UK'&&(
              <div style={{...S.iCard,border:'1px solid #9e6a03',background:'#2d1c00',marginBottom:10}}>
                <P c="#d29922">⚠️ This tax guide is based on UK tax rules. If you're not in the UK, the thresholds and rates will be different — please check with your local tax authority or an accountant.</P>
              </div>
            )}
            <IC title={`Your tax snapshot — ${tyLabel}`}>
              <div style={{fontSize:11,color:'#8b949e',marginBottom:12}}>Tax year: 6 Apr {tyYear} to 5 Apr {tyYear+1} · {tySales.length} sale{tySales.length!==1?'s':''} this year</div>
              <div style={{marginBottom:14}}>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#8b949e',marginBottom:5}}>
                  <span>Gross revenue toward £1,000 allowance</span>
                  <span style={{color:statusC,fontWeight:600}}>{fmt(tyGross)} / £1,000</span>
                </div>
                <div style={{background:'#21262d',borderRadius:4,height:10,overflow:'hidden'}}>
                  <div style={{width:`${tyPct}%`,height:'100%',background:statusC,borderRadius:4}}/>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:8,marginBottom:12}}>
                {[['Gross revenue',fmt(tyGross),'#e6edf3'],['eBay fees paid','−'+fmt(tyFees),'#f85149'],['Postage paid','−'+fmt(tyPost),'#f85149'],['Net (before stock cost)',fmt(tyNet),tyNet>=0?'#3fb950':'#f85149']].map(([l,v,c])=>(
                  <div key={l} style={{background:'#21262d',borderRadius:6,padding:'8px 10px'}}>
                    <div style={{fontSize:10,color:'#8b949e',marginBottom:3,lineHeight:1.4}}>{l}</div>
                    <div style={{fontSize:14,fontWeight:700,color:c}}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{fontSize:12,padding:'9px 12px',borderRadius:6,background:tyOver?'#2d1c1c':'#1a2f1a',color:statusC,fontWeight:500}}>
                {tyOver?'⚠️ Over £1,000 gross — you may need to register for Self Assessment':'✅ Under the £1,000 trading allowance — no tax action needed this year'}
              </div>
              {tySales.length===0&&<P c="#6e7681">No sales logged for this tax year yet.</P>}
              <P c="#6e7681">This covers eBay fees and postage. Also deduct the cost of stock you've sold for your true taxable profit.</P>
            </IC>
            <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:10}}>
              <IC title="📋 How reselling is taxed">
                <P>When you regularly buy and sell items to make a profit, HMRC treats you as a trader. Your profits are taxed as trading income — the same as self-employment — not as personal sales.</P>
                <P>The good news: you're only taxed on profit, not revenue. Every genuine business cost reduces your taxable amount.</P>
              </IC>
              <IC title="🎁 The £1,000 Trading Allowance">
                <P>If your gross sales are under £1,000 in a tax year, you pay no tax and don't need to do anything.</P>
                <P>Over £1,000? Register for Self Assessment and choose either:</P>
                <ul style={{paddingLeft:16,margin:'4px 0 6px'}}><LI>Deduct the flat £1,000 allowance (simple)</LI><LI>Deduct your actual costs — usually much better</LI></ul>
              </IC>
              <IC title="🧾 What you can deduct">
                <ul style={{paddingLeft:16,margin:'4px 0'}}>
                  <LI>Cost of items purchased (stock)</LI>
                  <LI>eBay selling fees</LI>
                  <LI>Postage and packaging materials</LI>
                  <LI>Proportion of internet costs used for the business</LI>
                  <LI>Any tools or subscriptions used for reselling</LI>
                </ul>
                <P>You can only deduct cost of goods you've actually sold — not unsold stock.</P>
              </IC>
              <IC title="📊 Do you need to register?">
                <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:8}}>
                  {[['Under £1,000 gross','No action needed','#3fb950'],['£1,000–£12,570 profit','Register + file return. Likely no tax if within personal allowance*','#d29922'],['Over £12,570 profit','Register, file return, pay Income Tax + NICs','#f85149']].map(([r,a,c])=>(
                    <div key={r} style={{background:'#21262d',borderRadius:6,padding:'7px 10px'}}>
                      <div style={{fontSize:11,fontWeight:600,color:c,marginBottom:2}}>{r}</div>
                      <div style={{fontSize:11,color:'#8b949e'}}>{a}</div>
                    </div>
                  ))}
                </div>
                <P>*Assumes no other income using up your personal allowance. If you have a job, check with an accountant.</P>
              </IC>
              <IC title="💷 Income Tax rates (2025–26)">
                <table style={{...S.tbl,tableLayout:'auto',marginTop:4}}>
                  <thead><tr>
                    <th style={{...S.th,background:'#21262d'}}>Band</th>
                    <th style={{...S.th,background:'#21262d',textAlign:'right'}}>Profit</th>
                    <th style={{...S.th,background:'#21262d',textAlign:'right'}}>Rate</th>
                  </tr></thead>
                  <tbody>
                    {[['Personal Allowance','£0 – £12,570','0%','#3fb950'],['Basic Rate','£12,571 – £50,270','20%','#d29922'],['Higher Rate','£50,271 – £125,140','40%','#f85149'],['Additional Rate','Over £125,140','45%','#f85149']].map(([b,r,rt,c])=>(
                      <tr key={b}><td style={S.td}>{b}</td><td style={{...S.td,textAlign:'right',color:'#8b949e',fontSize:11}}>{r}</td><td style={{...S.td,textAlign:'right',fontWeight:700,color:c}}>{rt}</td></tr>
                    ))}
                  </tbody>
                </table>
                <P>Self-employed traders also pay Class 4 NI (6%) on profits between £12,570 and £50,270.</P>
              </IC>
              <IC title="📅 Key dates">
                <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:8}}>
                  {[['6 Apr','New tax year begins'],['5 Oct','Register for Self Assessment (if first time)'],['31 Jan','Online return deadline + pay tax owed'],['31 Jul','Second payment on account (if applicable)']].map(([d,desc])=>(
                    <div key={d} style={{display:'flex',gap:12,alignItems:'flex-start'}}>
                      <div style={{fontSize:11,fontWeight:700,color:'#f0883e',minWidth:36,flexShrink:0}}>{d}</div>
                      <div style={{fontSize:12,color:'#8b949e'}}>{desc}</div>
                    </div>
                  ))}
                </div>
                <P>The January 2027 filing covers the April 2026–April 2027 tax year.</P>
              </IC>
            </div>
            <IC title="🔔 eBay reports your sales to HMRC" acc="#9e6a03">
              <P>Since January 2024, platforms like eBay must report seller data directly to HMRC under DAC7 rules. If you make 30+ sales or earn over ~£1,700 in a year, eBay will automatically pass your details to HMRC.</P>
              <P>HMRC may already know about your sales. If what you declare doesn't match what eBay reports, they may contact you. Keep good records — this app helps with that — and register if you're over the threshold.</P>
            </IC>
            <div style={{fontSize:11,color:'#6e7681',padding:'10px 0',textAlign:'center',borderTop:'1px solid #21262d'}}>
              General guide only — not professional tax advice. Laws change. Check{' '}
              <a href="https://www.gov.uk/working-for-yourself" target="_blank" style={{color:'#58a6ff'}}>gov.uk</a>
              {' '}or speak to an accountant for advice specific to your situation.
            </div>
          </div>;
        })()}

      </div>{/* end main */}

      {/* ── MODALS ────────────────────────────────────────────────────────── */}

      {/* Settings */}
      {showCfg&&<SettingsModal cfg={cfgForm} onChange={setCfgForm} onSave={saveCfg} onClose={()=>setShowCfg(false)} S={S} feeLabel={feeLabel} effectiveFeeRate={effectiveFeeRate} salesCount={sales.filter(s=>!s.feeWasEstimated).length}/>}

      {/* New category */}
      {showAddCat&&(
        <Modal title="New category" onClose={()=>setShowAddCat(false)}>
          <p style={{fontSize:12,color:'#8b949e',marginBottom:12}}>Create a new category for your inventory. You can include an emoji at the start.</p>
          <div style={S.field}>
            <label style={S.fLbl}>Category name</label>
            <input style={S.fInp} type="text" value={newCatName} onChange={e=>setNewCatName(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&addCat()} placeholder="e.g. 🎮 Video Games, 👟 Trainers…" autoFocus/>
          </div>
          <div style={S.mActs}>
            <button style={S.mBtn} onClick={()=>setShowAddCat(false)}>Cancel</button>
            <button style={S.mBtnP} onClick={addCat}>Create</button>
          </div>
        </Modal>
      )}

      {/* Add item */}
      {showAddItem&&(
        <Modal title={`Add item — ${cats.find(c=>c.id===curInvCat)?.name||''}`} onClose={()=>setShowAddItem(false)}>
          <div style={S.field}><label style={S.fLbl}>Item name / description</label>
            <input style={S.fInp} type="text" value={addName} onChange={e=>setAddName(e.target.value)} placeholder="Item name" autoFocus/></div>
          <div style={S.field}><label style={S.fLbl}>Listing price ({sym})</label>
            <input style={S.fInp} type="number" step="0.01" min="0" value={addPrice} onChange={e=>setAddPrice(e.target.value)} placeholder="0.00"/></div>
          <div style={S.field}><label style={S.fLbl}>What you paid ({sym}) — adds to your total spend</label>
            <input style={S.fInp} type="number" step="0.01" min="0" value={addBuy} onChange={e=>setAddBuy(e.target.value)} placeholder="0.00"/></div>
          <div style={S.mActs}>
            <button style={S.mBtn} onClick={()=>setShowAddItem(false)}>Cancel</button>
            <button style={S.mBtnP} onClick={addItem}>Add item</button>
          </div>
        </Modal>
      )}

      {/* Log sale */}
      {sellItem&&(
        <Modal title="Log eBay sale" onClose={()=>setSellItem(null)}>
          <p style={{fontSize:12,color:'#8b949e',marginBottom:14,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={sellItem.name}>{sellItem.name}</p>
          <div style={S.field}>
            <label style={S.fLbl}>What it sold for on eBay ({sym})</label>
            <input style={S.fInp} type="number" step="0.01" min="0" value={soldP} onChange={e=>setSoldP(e.target.value)} placeholder="0.00" autoFocus/>
          </div>
          <div style={S.field}>
            <label style={S.fLbl}>Actual eBay fees charged ({sym}) — leave blank to estimate at {(activeFeeRate*100).toFixed(1)}%</label>
            <input style={S.fInp} type="number" step="0.01" min="0" value={actualFee} onChange={e=>setActualFee(e.target.value)} placeholder={`Est. ${sym}${spNum>0?calcFees(spNum).toFixed(2):'0.00'}`}/>
          </div>
          <div style={S.field}>
            <label style={S.fLbl}>Postage you paid ({sym})</label>
            <input style={S.fInp} type="number" step="0.01" min="0" value={postageP} onChange={e=>setPostageP(e.target.value)} placeholder="0.00"/>
          </div>
          {spNum>0&&(
            <div style={{background:'#21262d',borderRadius:6,padding:'10px 12px',marginTop:4,fontSize:12}}>
              {[
                ['Sale price', fmt(spNum), null],
                [`eBay fees${feeIsEst?' (estimated)':' (actual)'}`, '−'+fmt(feesUsed), '#f85149'],
                ...(poNum>0?[['Postage paid','−'+fmt(poNum),'#f85149']]:[]),
                ['Packaging','−£0.15','#f85149'],
              ].map(([l,v,c])=>(
                <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'3px 0',borderBottom:'1px solid #30363d'}}>
                  <span style={{color:'#8b949e'}}>{l}</span><span style={c?{color:c}:{}}>{v}</span>
                </div>
              ))}
              <div style={{display:'flex',justifyContent:'space-between',padding:'6px 0 3px',fontWeight:700,fontSize:14,marginTop:4}}>
                <span>Profit</span>
                <span style={{color:sellProfit>=0?'#3fb950':'#f85149'}}>{fmt(sellProfit)}</span>
              </div>
              {feeIsEst&&<div style={{fontSize:10,color:'#6e7681',marginTop:4}}>💡 Enter the actual eBay fees to improve future fee estimates.</div>}
            </div>
          )}
          <div style={S.mActs}>
            <button style={S.mBtn} onClick={()=>setSellItem(null)}>Cancel</button>
            <button style={S.mBtnP} onClick={confirmSell}>Log sale</button>
          </div>
        </Modal>
      )}

    </div>
  );
}

// ── Settings modal component ─────────────────────────────────────────────────
function SettingsModal({cfg,onChange,onSave,onClose,S,feeLabel,effectiveFeeRate,salesCount=0}){
  const f=(key,val)=>onChange(p=>({...p,[key]:val}));
  return(
    <Modal title="⚙️ Settings" onClose={onClose} wide>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <div style={{gridColumn:'1 / -1',...S.field}}>
          <label style={S.fLbl}>Business / store name</label>
          <input style={S.fInp} value={cfg.businessName||''} onChange={e=>f('businessName',e.target.value)} placeholder="My eBay Store"/>
        </div>
        <div style={S.field}>
          <label style={S.fLbl}>Currency symbol</label>
          <select style={{...S.fInp}} value={cfg.currency||'£'} onChange={e=>f('currency',e.target.value)}>
            {['£','$','€','A$','C$','¥'].map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={S.field}>
          <label style={S.fLbl}>Default postage per item</label>
          <input style={S.fInp} type="number" step="0.01" min="0" value={cfg.postage||''} onChange={e=>f('postage',e.target.value)} placeholder="1.00"/>
        </div>
        <div style={{...S.field,gridColumn:'1 / -1'}}>
          <label style={S.fLbl}>Base eBay fee rate (%)</label>
          <input style={S.fInp} type="number" step="0.1" min="1" max="30" value={cfg.baseFee||15} onChange={e=>f('baseFee',e.target.value)}/>
          <div style={{fontSize:11,color:'#8b949e',marginTop:4}}>
            {effectiveFeeRate
              ? `✓ Auto-updated to ${(effectiveFeeRate*100).toFixed(1)}% from ${salesCount} sale${salesCount!==1?'s':''} with actual fees entered. Your base rate is used as fallback.`
              : `Currently using this base rate. The rate auto-updates once you've entered actual eBay fees on 3+ sales.`
            }
          </div>
        </div>
        <div style={S.field}>
          <label style={S.fLbl}>Stock spend before using this app ({cfg.currency||'£'})</label>
          <input style={S.fInp} type="number" step="0.01" min="0" value={cfg.initialSpend||''} onChange={e=>f('initialSpend',e.target.value)} placeholder="0.00"/>
          <div style={{fontSize:11,color:'#8b949e',marginTop:3}}>One-time entry — adds to your "Total spent" figure.</div>
        </div>
        <div style={S.field}>
          <label style={S.fLbl}>Tax country</label>
          <select style={{...S.fInp}} value={cfg.taxCountry||'UK'} onChange={e=>f('taxCountry',e.target.value)}>
            <option value="UK">🇬🇧 United Kingdom</option>
            <option value="Other">Other / International</option>
          </select>
        </div>
      </div>
      <div style={S.mActs}>
        <button style={S.mBtn} onClick={onClose}>Cancel</button>
        <button style={S.mBtnP} onClick={onSave}>Save settings</button>
      </div>
    </Modal>
  );
}
