import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth, useUser, useClerk, SignIn } from '@clerk/clerk-react';
import { getAuthClient } from './supabase';
import { todayEnGB, parseEnGBDate, monthKey, formatMonthLabel, currentTaxYearBounds, isInTaxYear } from './dateUtils.js';
import { EXPENSE_TYPES, expenseTotals, expenseShort, normalizePurchases, sumExpenses } from './expenses.js';
import { isListingDeadZone, bundlePostageSavings, splitPostageAcrossItems, POSTAGE_PER_ITEM_IF_ALONE } from './bundleUtils.js';
import { moneyReceived, feesFromInputs, saleFees } from './saleUtils.js';
import Dashboard from './Dashboard.jsx';
import { EBAY_CATEGORIES, EBAY_CONDITIONS } from './ebayData.js';
import PhotoUpload from './PhotoUpload.jsx';
import ItemDetailModal from './ItemDetailModal.jsx';
import Onboarding from './Onboarding.jsx';
import PageHints from './PageHints.jsx';

// ── mobile detection ─────────────────────────────────────────────────────────
const useIsMobile = () => {
  const [mob, setMob] = useState(()=>typeof window!=='undefined'&&window.innerWidth<=640);
  useEffect(()=>{
    const h = () => setMob(window.innerWidth<=640);
    window.addEventListener('resize',h);
    return ()=>window.removeEventListener('resize',h);
  },[]);
  return mob;
};

// ── helpers ──────────────────────────────────────────────────────────────────
const ebayUrl = n => `https://www.ebay.co.uk/sch/i.html?_nkw=${encodeURIComponent(n)}&LH_Sold=1&LH_Complete=1`;
const money = (n,sym) => (n<0?'-':'')+sym+Math.abs(n).toFixed(2);
const iq = it => Math.max(1,Math.floor(Number(it?.qty))||1);
const activeSales = sales => (sales||[]).filter(s=>!s.refunded);
const applyAfterSale = (item,soldQty) => {
  const left = iq(item)-soldQty;
  return left<=0 ? {...item,status:'sold'} : {...item,qty:left};
};
const findDuplicate = (name,catId,items) => {
  const n = name.trim().toLowerCase();
  return (items||[]).find(it=>it.categoryId===catId&&(it.status==='stock'||it.status==='listed')&&it.name.toLowerCase()===n);
};

const DEFAULTS = {
  businessName:'My eBay Store', currency:'£', baseFee:15,
  postage:1.00, initialSpend:0, taxCountry:'UK', listingDescription:'', postalCode:'',
  returnPolicy:{ enabled:false, accepted:true, refund:'MoneyBack', within:'Days_30', paidBy:'Buyer' },
  fulfillmentPolicyId:'', paymentPolicyId:'', returnPolicyId:'',
};
const SORT_OPTS = [['price-desc','Price ↓'],['price-asc','Price ↑'],['name','Name A–Z']];

// ── styles ───────────────────────────────────────────────────────────────────
const C = {
  bg:      'var(--bg)',
  surface: 'var(--surface)',
  sur2:    'var(--surface-2)',
  sur3:    'var(--surface-3)',
  border:  'var(--border)',
  bsub:    'var(--border-sub)',
  text1:   'var(--text-1)',
  text2:   'var(--text-2)',
  text3:   'var(--text-3)',
  accent:  'var(--accent)',
  green:   'var(--green)',
  red:     'var(--red)',
  amber:   'var(--amber)',
  blue:    'var(--blue)',
};
const S = {
  app:     {display:'flex',height:'100vh',overflow:'hidden',background:C.bg,color:C.text1,fontFamily:"'Inter',system-ui,sans-serif"},
  sCard:   {background:C.surface,borderRadius:'var(--radius)',padding:'14px 16px',border:`1px solid ${C.border}`},
  sV:      {fontSize:20,fontWeight:700,display:'block',lineHeight:1.2},
  sL:      {fontSize:11,color:C.text2,marginTop:3,display:'block'},
  toolbar: {display:'flex',gap:8,marginBottom:16,flexWrap:'wrap',alignItems:'center'},
  sWrap:   {position:'relative',width:220,flexShrink:0},
  sInput:  {width:'100%',padding:'7px 10px 7px 30px',border:`1px solid ${C.border}`,borderRadius:'var(--radius-sm)',background:C.sur2,color:C.text1,fontSize:12,fontFamily:'inherit',boxSizing:'border-box',outline:'none'},
  sIcon:   {position:'absolute',left:9,top:'50%',transform:'translateY(-50%)',color:C.text3,fontSize:13,pointerEvents:'none'},
  sClear:  {position:'absolute',right:4,top:'50%',transform:'translateY(-50%)',width:22,height:22,border:'none',borderRadius:4,background:'transparent',color:C.text3,cursor:'pointer',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center',padding:0},
  sel:     {padding:'6px 10px',border:`1px solid ${C.border}`,borderRadius:'var(--radius-sm)',background:C.sur2,color:C.text1,fontSize:12,fontFamily:'inherit',cursor:'pointer',outline:'none'},
  addBtn:  {display:'flex',alignItems:'center',gap:6,padding:'7px 14px',border:`1px solid ${C.accent}`,borderRadius:'var(--radius-sm)',background:C.accent,color:'#fff',cursor:'pointer',fontSize:13,fontWeight:600,fontFamily:'inherit',whiteSpace:'nowrap'},
  chip:    {padding:'4px 12px',border:`1px solid ${C.border}`,borderRadius:20,background:'transparent',color:C.text2,cursor:'pointer',fontSize:12,fontFamily:'inherit'},
  chipA:   {background:'var(--accent-a)',color:C.accent,borderColor:C.accent},
  catTab:  {padding:'5px 12px',border:`1px solid ${C.border}`,borderRadius:20,background:'transparent',color:C.text2,cursor:'pointer',fontSize:12,fontFamily:'inherit',whiteSpace:'nowrap'},
  catTabA: {background:'var(--accent-a)',color:C.accent,borderColor:C.accent,fontWeight:600},
  tWrap:   {border:`1px solid ${C.border}`,borderRadius:'var(--radius)',overflow:'hidden'},
  tbl:     {width:'100%',borderCollapse:'collapse',fontSize:12,tableLayout:'fixed'},
  th:      {padding:'9px 12px',textAlign:'left',fontWeight:600,fontSize:11,color:C.text2,background:C.sur2,borderBottom:`1px solid ${C.border}`,whiteSpace:'nowrap'},
  td:      {padding:'9px 12px',borderBottom:`1px solid ${C.bsub}`,verticalAlign:'middle'},
  fRow:    {fontSize:11,color:C.text2,padding:'8px 0 0',textAlign:'right'},
  acts:    {display:'flex',gap:4,alignItems:'center'},
  note:    {background:'var(--amber-a)',border:'1px solid rgba(245,158,11,0.3)',color:C.amber,borderRadius:'var(--radius-sm)',padding:'8px 12px',fontSize:11,marginBottom:10,display:'flex',alignItems:'center',gap:8},
  field:   {marginBottom:12},
  fLbl:    {display:'block',fontSize:11,color:C.text2,marginBottom:5,fontWeight:600},
  fInp:    {width:'100%',padding:'8px 11px',border:`1px solid ${C.border}`,borderRadius:'var(--radius-sm)',background:C.sur2,color:C.text1,fontSize:13,fontFamily:'inherit',outline:'none'},
  mBtn:    {padding:'7px 14px',borderRadius:'var(--radius-sm)',border:`1px solid ${C.border}`,background:'transparent',cursor:'pointer',fontSize:13,color:C.text1,fontFamily:'inherit'},
  mBtnP:   {padding:'7px 14px',borderRadius:'var(--radius-sm)',border:`1px solid ${C.accent}`,background:C.accent,color:'#fff',cursor:'pointer',fontSize:13,fontWeight:600,fontFamily:'inherit'},
  mActs:   {display:'flex',gap:8,marginTop:16,justifyContent:'flex-end'},
  cCard:   {background:C.surface,border:`1px solid ${C.border}`,borderRadius:'var(--radius)',padding:16,marginBottom:12},
  cH:      {fontSize:11,fontWeight:600,color:C.text2,marginBottom:10,textTransform:'uppercase',letterSpacing:'0.07em'},
  bRow:    {display:'flex',justifyContent:'space-between',padding:'6px 0',fontSize:13,borderBottom:`1px solid ${C.bsub}`},
  empty:   {textAlign:'center',padding:'48px 24px',color:C.text2,fontSize:13,lineHeight:1.8},
  iCard:   {background:C.surface,border:`1px solid ${C.border}`,borderRadius:'var(--radius)',padding:'14px 16px',marginBottom:10},
  bundleLine:{background:C.sur2,borderRadius:'var(--radius-sm)',padding:'10px 12px',marginBottom:8,border:`1px solid ${C.border}`},
  chk:     {width:15,height:15,cursor:'pointer',accentColor:C.accent},
  btnSm:   {padding:'4px 10px',border:`1px solid ${C.border}`,borderRadius:'var(--radius-sm)',background:'transparent',color:C.text2,cursor:'pointer',fontSize:11,fontFamily:'inherit'},
};

// ── small components ──────────────────────────────────────────────────────────
function NavBtn({active,onClick,icon,badge,children}){
  return <button onClick={onClick} className={`rt-nav-item${active?' active':''}`}>
    {icon&&<span className="rt-nav-icon">{icon}</span>}
    <span style={{flex:1}}>{children}</span>
    {badge>0&&<span className="rt-nav-badge">{badge}</span>}
  </button>;
}

function IBtn({href,onClick,title,col,children}){
  const base={width:28,height:28,border:`1px solid var(--border)`,borderRadius:'var(--radius-sm)',background:'transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:col||'var(--text-2)',textDecoration:'none',flexShrink:0,fontSize:13};
  if(href) return <a href={href} target="_blank" rel="noreferrer" style={base} title={title}>{children}</a>;
  return <button style={base} onClick={onClick} title={title}>{children}</button>;
}

function Modal({title,onClose,children,wide}){
  return(
    <div className="rt-modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className={wide?'rt-modal-inner':'rt-modal-inner narrow'}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <span style={{fontSize:15,fontWeight:700,color:'var(--text-1)'}}>{title}</span>
          <button style={{...S.mBtn,padding:'3px 8px'}} onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SearchBar({value,onChange,placeholder}){
  return(
    <div style={S.sWrap}>
      <span style={S.sIcon}>🔍</span>
      <input style={{...S.sInput,paddingRight:value?30:10}} placeholder={placeholder} value={value} onChange={e=>onChange(e.target.value)}/>
      {value&&<button type="button" style={S.sClear} onClick={()=>onChange('')} title="Clear">✕</button>}
    </div>
  );
}

function QtyCell({value,onChange}){
  const set=n=>onChange(Math.max(1,Math.floor(n)||1));
  return(
    <div style={{display:'flex',alignItems:'center',gap:2,justifyContent:'center'}}>
      <button type="button" style={{...S.mBtn,width:22,height:22,padding:0,fontSize:14,lineHeight:1}} onClick={()=>set(value-1)} disabled={value<=1}>−</button>
      <span style={{minWidth:20,textAlign:'center',fontWeight:600,fontSize:12}}>{value}</span>
      <button type="button" style={{...S.mBtn,width:22,height:22,padding:0,fontSize:14,lineHeight:1}} onClick={()=>set(value+1)}>+</button>
    </div>
  );
}

// ── Settings modal ─────────────────────────────────────────────────────────────
function SettingsModal({cfg,onChange,onSave,onClose,feeLabel,effectiveFeeRate,salesCount=0}){
  const f=(k,v)=>onChange(p=>({...p,[k]:v}));
  return(
    <Modal title="⚙️ Settings" onClose={onClose} wide>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <div style={{...S.field,gridColumn:'1/-1'}}><label style={S.fLbl}>Business / store name</label><input style={S.fInp} value={cfg.businessName||''} onChange={e=>f('businessName',e.target.value)} placeholder="My eBay Store"/></div>
        <div style={S.field}><label style={S.fLbl}>Currency symbol</label><select style={{...S.fInp}} value={cfg.currency||'£'} onChange={e=>f('currency',e.target.value)}>{['£','$','€','A$','C$','¥'].map(s=><option key={s} value={s}>{s}</option>)}</select></div>
        <div style={S.field}><label style={S.fLbl}>Default postage per item</label><input style={S.fInp} type="number" step="0.01" min="0" value={cfg.postage||''} onChange={e=>f('postage',e.target.value)} placeholder="1.00"/></div>
        <div style={{...S.field,gridColumn:'1/-1'}}>
          <label style={S.fLbl}>Base eBay fee rate (%)</label>
          <input style={S.fInp} type="number" step="0.1" min="1" max="30" value={cfg.baseFee||15} onChange={e=>f('baseFee',e.target.value)}/>
          <div style={{fontSize:11,color:'var(--text-2)',marginTop:4}}>
            {effectiveFeeRate ? `✓ Real average from ${salesCount} sales: ${(effectiveFeeRate*100).toFixed(1)}%. Base rate used for Buy Calculator estimates.` : `Used in Buy Calculator. Becomes your real average once you've logged enough sales.`}
          </div>
        </div>
        <div style={S.field}><label style={S.fLbl}>Stock spend before using this app</label><input style={S.fInp} type="number" step="0.01" min="0" value={cfg.initialSpend||''} onChange={e=>f('initialSpend',e.target.value)} placeholder="0.00"/><div style={{fontSize:11,color:'var(--text-2)',marginTop:3}}>One-time entry — adds to your total spend.</div></div>
        <div style={S.field}><label style={S.fLbl}>Tax country</label><select style={{...S.fInp}} value={cfg.taxCountry||'UK'} onChange={e=>f('taxCountry',e.target.value)}><option value="UK">🇬🇧 United Kingdom</option><option value="Other">Other / International</option></select></div>
        <div style={S.field}>
          <label style={S.fLbl}>Your postal code</label>
          <input style={{...S.fInp,maxWidth:160}} value={cfg.postalCode||''} onChange={e=>f('postalCode',e.target.value)} placeholder="e.g. LE11 1AA"/>
          <div style={{fontSize:11,color:'var(--text-3)',marginTop:3}}>Used as item location on eBay listings.</div>
        </div>

        <div style={{...S.field,gridColumn:'1/-1'}}>
          <label style={S.fLbl}>Standard listing description</label>
          <textarea style={{...S.fInp,minHeight:100,resize:'vertical',lineHeight:1.5}} value={cfg.listingDescription||''} onChange={e=>f('listingDescription',e.target.value)} placeholder="e.g. Fast dispatch · Secure packaging · Combined postage available · Please check my other listings!"/>
          <div style={{fontSize:11,color:'var(--text-3)',marginTop:3}}>Added to every eBay listing pre-fill. You can use it for dispatch times, postage info, feedback requests etc.</div>
        </div>
      </div>
      <div style={S.mActs}><button style={S.mBtn} onClick={onClose}>Cancel</button><button style={S.mBtnP} onClick={onSave}>Save settings</button></div>
    </Modal>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App(){
  // Core data
  const [cfg,setCfg]           = useState(DEFAULTS);
  const [cats,setCats]         = useState([]);
  const [items,setItems]       = useState([]);
  const [sales,setSales]       = useState([]);
  const [purchases,setPurchases] = useState([]);
  const { isSignedIn, isLoaded, userId, getToken } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const isMobile = useIsMobile();

  // Mobile item card style
  const mCard = {background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:'12px',marginBottom:8};
  const mRow  = {display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8};
  const mName = {flex:1,paddingRight:8,fontWeight:600,fontSize:14,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'};
  const mSub  = {fontSize:11,color:'var(--text-2)',marginTop:2};
  const mFoot = {display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:6};
  const [ready,setReady]       = useState(false);
  const [syncStatus,setSyncStatus] = useState('saved');
  const [subStatus,setSubStatus]   = useState('active');
  const [subCustomerId,setSubCustomerId] = useState(null);
  const [showAccount,setShowAccount]     = useState(false);
  const [ebayStatus,setEbayStatus]         = useState(null); // null | { connected, ebayUsername }
  const [ebayMsg,setEbayMsg]               = useState('');

  // ── Onboarding ──────────────────────────────────────────────────────────────
  const [showOnboarding, setShowOnboarding] = useState(()=>{
    try { return !localStorage.getItem('rt_onboarded'); } catch { return false; }
  });
  const handleOnboardingComplete = ({storeName,currency,description}) => {
    if(storeName) setCfg(p=>({...p,businessName:storeName}));
    if(currency)  setCfg(p=>({...p,currency}));
    if(description) setCfg(p=>({...p,listingDescription:description}));
    try { localStorage.setItem('rt_onboarded','1'); } catch {}
    setShowOnboarding(false);
  };

  // ── Help tips ──────────────────────────────────────────────────────────────
  const [dismissedTips, setDismissedTips] = useState(()=>{
    try { return JSON.parse(localStorage.getItem('rt_tips')||'[]'); } catch { return []; }
  });
  const dismissTip = (id) => {
    const next = [...dismissedTips, id];
    setDismissedTips(next);
    try { localStorage.setItem('rt_tips', JSON.stringify(next)); } catch {}
  };
  const Tip = ({id, title, body, icon='💡'}) => {
    if(dismissedTips.includes(id)) return null;
    return(
      <div className="rt-tip">
        <span className="rt-tip-icon">{icon}</span>
        <div className="rt-tip-content">
          <div className="rt-tip-title">{title}</div>
          <div>{body}</div>
        </div>
        <button className="rt-tip-close" onClick={()=>dismissTip(id)}>×</button>
      </div>
    );
  };
  const [ebayPolicies,setEbayPolicies]     = useState(null);
  const [ebayLocation,setEbayLocation]     = useState(null);
  const [ebaySyncState,setEbaySyncState]   = useState({loading:false,msg:''});
  const saveTimer              = useRef(null);

  // Nav
  const [tab,setTab] = useState('dashboard');

  // Inventory
  const [invCat,setInvCat]       = useState(null);
  const [invSearch,setInvSearch] = useState('');
  const [invSort,setInvSort]     = useState('price-desc');
  const [invTier,setInvTier]     = useState('all');

  // Listings
  const [lstCat,setLstCat]           = useState(null);
  const [lstSearch,setLstSearch]     = useState('');
  const [lstSort,setLstSort]         = useState('price-desc');
  const [lstSel,setLstSel]           = useState([]);
  const [invSel,setInvSel]           = useState([]);
  const [detailItem,setDetailItem]   = useState(null);
  const [bundleSell,setBundleSell]   = useState(null);
  const [bundlePost,setBundlePost]   = useState('');

  // Settings
  const [showCfg,setShowCfg]   = useState(false);
  const [cfgForm,setCfgForm]   = useState(DEFAULTS);

  // Add category
  const [showAddCat,setShowAddCat] = useState(false);
  const [newCatName,setNewCatName] = useState('');

  // Add item
  const [showAddItem,setShowAddItem] = useState(false);
  const [addName,setAddName]   = useState('');
  const [addPrice,setAddPrice] = useState('');
  const [addQty,setAddQty]       = useState('1');
  const [addBuyCost,setAddBuyCost]       = useState('');
  const [addPhotos,setAddPhotos]         = useState([]);
  const [addCondition,setAddCondition]     = useState('');
  const [addEbayCategory,setAddEbayCategory] = useState('');
  const [dupPrompt,setDupPrompt] = useState(null);

  // Sell
  const [sellItem,setSellItem]   = useState(null);
  const [soldP,setSoldP]         = useState('');
  const [moneyInP,setMoneyInP]   = useState('');
  const [postageP,setPostageP]   = useState('');
  const [sellQtyIn,setSellQtyIn] = useState('1');

  // Spend
  const [showSpend,setShowSpend]   = useState(false);
  const [spendAmt,setSpendAmt]     = useState('');
  const [spendNote,setSpendNote]   = useState('');
  const [spendType,setSpendType]   = useState('stock');
  const [spendSetTotal,setSpendSetTotal] = useState('');

  // Buy calc
  const [bundle,setBundle]     = useState([]);
  const [bundleIn,setBundleIn] = useState('');
  const [margin,setMargin]     = useState(60);

  // ── Load from Supabase using Clerk JWT ────────────────────────────────────
  useEffect(()=>{
    if(!isLoaded) return;
    if(!isSignedIn){ setReady(true); return; }
    const init=async()=>{
      try{
        const token = await getToken({ template:'supabase' });
        const client = getAuthClient(token);
        const { data } = await client.from('user_settings').select('settings').eq('user_id',userId).maybeSingle();
        if(data?.settings){
          const d = data.settings;
          if(d.cfg)  { setCfg({...DEFAULTS,...d.cfg}); setCfgForm({...DEFAULTS,...d.cfg}); }
          if(d.cats)      setCats(d.cats);
          if(d.items)     setItems(d.items);
          if(d.sales)     setSales(d.sales);
          if(d.purchases) setPurchases(normalizePurchases(d.purchases));
        }
      }catch(e){ console.error('Init error:',e); }
      setReady(true);
    };
    init();
  },[isLoaded,isSignedIn,userId]);

  // ── Debounced save to Supabase ─────────────────────────────────────────────
  useEffect(()=>{
    if(!ready||!userId||!isSignedIn) return;
    setSyncStatus('saving');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async()=>{
      try{
        const token = await getToken({ template:'supabase' });
        const client = getAuthClient(token);
        await client.from('user_settings').upsert({
          user_id:userId,
          settings:{ cfg, cats, items, sales, purchases },
          updated_at:new Date().toISOString(),
        },{ onConflict:'user_id' });
        setSyncStatus('saved');
      }catch(e){ console.error('Save error:',e); setSyncStatus('error'); }
    },1500);
  },[cfg,cats,items,sales,purchases,userId,ready,isSignedIn]);

  // ── eBay connection status ────────────────────────────────────────────────────
  const fetchEbayStatus = () => {
    if(!userId) return;
    fetch(`/api/ebay/auth?action=status&userId=${encodeURIComponent(userId)}`)
      .then(r=>r.json())
      .then(d=>setEbayStatus(d))
      .catch(()=>{});
  };

  useEffect(()=>{
    if(!isSignedIn||!userId) return;
    fetchEbayStatus();
    // Listen for OAuth popup completion
    const handler = e => {
      if(e.data?.type==='EBAY_CONNECTED'){
        fetchEbayStatus();
        setEbayMsg('✓ eBay account connected!');
        setTimeout(()=>setEbayMsg(''),5000);
      }
      if(e.data?.type==='EBAY_ERROR'){
        setEbayMsg('⚠ eBay connection failed — please try again.');
        setTimeout(()=>setEbayMsg(''),5000);
      }
    };
    window.addEventListener('message', handler);
    return ()=>window.removeEventListener('message', handler);
  },[isSignedIn,userId]);

  const fetchEbayPolicies = () => {
    if(!userId) return;
    fetch('/api/ebay/setup?userId='+encodeURIComponent(userId))
      .then(r=>r.json()).then(d=>setEbayPolicies(d)).catch(()=>{});
  };
  const fetchEbayLocation = () => {
    if(!userId) return;
    fetch('/api/ebay/setup?userId='+encodeURIComponent(userId))
      .then(r=>r.json()).then(d=>setEbayLocation((d.locations||[]).length>0)).catch(()=>{});
  };
  const createEbayLocation = async () => {
    if(!cfg.postalCode) { alert('Set your postal code in Settings first'); return; }
    const r = await fetch('/api/ebay/setup',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId,postalCode:cfg.postalCode}) });
    const d = await r.json();
    if(d.merchantLocationKey) { setEbayLocation(true); setEbayMsg('✓ Inventory location created'); setTimeout(()=>setEbayMsg(''),4000); }
    else { setEbayMsg('✗ '+d.error); setTimeout(()=>setEbayMsg(''),6000); }
  };

  // ── Sync eBay orders ─────────────────────────────────────────────────────────
  const runEbaySync = async ({ days=null, historyOnly=false, label='' } = {}) => {
    setEbaySyncState({loading:true,msg:''});
    let hadError = false;
    try {
      let url = '/api/ebay/sync?userId='+encodeURIComponent(userId);
      if(days)        url += '&days='+days;
      if(historyOnly) url += '&historyOnly=true';
      const r    = await fetch(url);
      const data = await r.json();
      console.log('[eBay sync] response:', data);
      if(!r.ok) throw new Error(data.error||'Sync failed');

      const orders = data.orders||[];
      let synced = 0, created = 0;
      const now = Date.now();

      orders.forEach((order,idx) => {
        const matched = items.find(it =>
          it.status==='listed' && (
            (order.ebayItemId && it.ebayItemId===order.ebayItemId) ||
            (order.ebaySku    && it.ebaySku===order.ebaySku)
          )
        );

        if(matched){
          // Known tracked item — log the sale and move it to sold, refreshing data on resync
          const sellerPost = matched.sellerPostageCost||cfg.postage||0;
          const sale = {
            id:          now+idx,
            itemId:      matched.id,
            itemName:    matched.name,
            categoryId:  matched.categoryId,
            listedPrice: matched.price,
            soldPrice:   order.soldPrice,
            ebayFees:    order.ebayFees,
            moneyIn:     order.moneyIn,
            postage:     sellerPost,
            buyCost:     matched.buyCost||0,
            profit:      +(order.moneyIn-sellerPost).toFixed(2),
            qty:         order.qty||1,
            date:        order.saleDate,
            ebayOrderId: order.orderId,
            fromEbaySync:true,
            restore:     {itemId:matched.id,name:matched.name,price:matched.price,qty:order.qty||1,status:'listed',dateStr:matched.dateStr,categoryId:matched.categoryId},
          };
          setSales(p=>[sale,...p.filter(s=>s.ebayOrderId!==order.orderId)]);
          setItems(p=>p.map(x=>x.id===matched.id?{...x,status:'sold'}:x));
          synced++;
        } else {
          // No tracked item for this order — only create one if we haven't already
          // imported it on a previous sync (avoids duplicate items on repeat syncs)
          const alreadyImported = sales.some(s=>s.ebayOrderId===order.orderId);
          if(alreadyImported) return;
          const newItemId = now+idx+1000000;
          setItems(p=>[{
            id:                newItemId,
            name:              order.title||'eBay sale',
            categoryId:        cats[0]?.id||null,
            price:             order.soldPrice||0,
            qty:               order.qty||1,
            buyCost:           0,
            condition:         '',
            ebayCategory:      '',
            photos:            [],
            sellerPostageCost: +(cfg.postage||0),
            status:            'sold',
            dateStr:           order.saleDate||todayEnGB(),
            ebayItemId:        order.ebayItemId,
            ebaySku:           order.ebaySku,
            importedFromEbay:  true,
          },...p]);
          const sale = {
            id:          now+idx,
            itemId:      newItemId,
            itemName:    order.title||'eBay sale',
            categoryId:  cats[0]?.id||null,
            listedPrice: order.soldPrice||0,
            soldPrice:   order.soldPrice,
            ebayFees:    order.ebayFees,
            moneyIn:     order.moneyIn,
            postage:     cfg.postage||0,
            buyCost:     0,
            profit:      +(order.moneyIn-(cfg.postage||0)).toFixed(2),
            qty:         order.qty||1,
            date:        order.saleDate,
            ebayOrderId: order.orderId,
            fromEbaySync:true,
            importedHistorical:true,
          };
          setSales(p=>[sale,...p]);
          created++;
        }
      });

      // ── Import currently active eBay listings not yet tracked in the app ──────
      const activeListings = data.activeListings||[];
      let imported = 0;
      activeListings.forEach(listing => {
        const alreadyTracked = items.some(it =>
          (listing.ebayItemId && it.ebayItemId===listing.ebayItemId) ||
          (listing.ebaySku    && it.ebaySku===listing.ebaySku)
        );
        if(alreadyTracked) return;
        setItems(p=>[{
          id:                Date.now()+Math.floor(Math.random()*10000)+imported,
          name:               listing.title||'eBay listing',
          categoryId:         cats[0]?.id||null,
          price:               listing.price||0,
          qty:                  listing.qty||1,
          buyCost:              0,
          condition:            '',
          ebayCategory:         '',
          photos:               [],
          sellerPostageCost:    +(cfg.postage||0),
          status:               'listed',
          dateStr:              todayEnGB(),
          listedAt:             todayEnGB(),
          ebayItemId:           listing.ebayItemId,
          ebaySku:              listing.ebaySku,
          ebayListingUrl:       listing.listingUrl,
          importedFromEbay:     true,
        },...p]);
        imported++;
      });

      const parts = [];
      if(synced>0)   parts.push(synced+' sale'+(synced!==1?'s':'')+' synced');
      if(created>0)  parts.push(created+' past sale'+(created!==1?'s':'')+' imported');
      if(imported>0) parts.push(imported+' active listing'+(imported!==1?'s':'')+' imported');
      let msg = (label?label+' — ':'') + (parts.length ? '✓ '+parts.join(', ') : 'No new sales or listings found on eBay');
      if(data.activeListingsError){ msg += (parts.length?' — ':'') + '⚠ Active listings: '+data.activeListingsError; hadError=true; }
      if(data.truncated){ msg += ` (more than ${data.ordersFetched} orders exist — run again to continue importing)`; hadError=true; }
      setEbaySyncState({loading:false,msg});
    } catch(e) {
      hadError = true;
      setEbaySyncState({loading:false,msg:'✗ '+e.message});
    }
    setTimeout(()=>setEbaySyncState(s=>({...s,msg:''})), hadError ? 15000 : 6000);
  };

  const syncEbayOrders        = () => runEbaySync();
  const importFullSalesHistory = () => {
    if(!confirm('This will scan up to 2 years of eBay order history and import any sales not already tracked in ResellerTrack. Item cost will default to £0 for imported sales — edit them afterwards to add your true cost. Continue?')) return;
    runEbaySync({ days:730, historyOnly:true, label:'Full history import' });
  };

  // ── Fetch subscription status ──────────────────────────────────────────────
  useEffect(()=>{
    if(!isSignedIn||!user) return;
    const email = user.primaryEmailAddress?.emailAddress;
    if(!email) return;
    fetch(`/api/subscription?email=${encodeURIComponent(email)}`)
      .then(r=>r.json())
      .then(d=>{ setSubStatus(d.status||'active'); if(d.customerId) setSubCustomerId(d.customerId); })
      .catch(()=>setSubStatus('active'));
  },[isSignedIn,user]);
  const sym = cfg.currency||'£';
  const fmt = n => money(n,sym);
  const expenses = useMemo(()=>expenseTotals(purchases),[purchases]);

  const effectiveFeeRate = useMemo(()=>{
    const logged = activeSales(sales).filter(s=>s.soldPrice>0&&s.ebayFees>=0);
    if(logged.length<3) return null;
    return +(logged.reduce((sum,s)=>sum+(s.ebayFees/s.soldPrice),0)/logged.length).toFixed(4);
  },[sales]);

  const calcFees = p => effectiveFeeRate ? +(p*effectiveFeeRate).toFixed(2) : +((p*(cfg.baseFee||15)/100)).toFixed(2);
  const feeLabel = effectiveFeeRate ? `${(effectiveFeeRate*100).toFixed(1)}% (from your sales)` : `${cfg.baseFee||15}% (base rate)`;

  const curInvCat = invCat??cats[0]?.id??null;
  const curLstCat = lstCat??cats[0]?.id??null;

  const filteredItems = useMemo(()=>{
    let l = items.filter(it=>it.categoryId===curInvCat&&it.status==='stock');
    if(invSearch) l=l.filter(it=>it.name.toLowerCase().includes(invSearch.toLowerCase()));
    if(invTier==='high') l=l.filter(it=>it.price>=20);
    if(invTier==='mid')  l=l.filter(it=>it.price>=5&&it.price<20);
    if(invTier==='low')  l=l.filter(it=>it.price<5);
    l.sort((a,b)=>invSort==='price-asc'?a.price-b.price:invSort==='name'?a.name.localeCompare(b.name):b.price-a.price);
    return l;
  },[items,curInvCat,invSearch,invSort,invTier]);

  const filteredListed = useMemo(()=>{
    let l = items.filter(it=>it.categoryId===curLstCat&&it.status==='listed');
    if(lstSearch) l=l.filter(it=>it.name.toLowerCase().includes(lstSearch.toLowerCase()));
    l.sort((a,b)=>lstSort==='price-asc'?a.price-b.price:lstSort==='name'?a.name.localeCompare(b.name):b.price-a.price);
    return l;
  },[items,curLstCat,lstSearch,lstSort]);

  const stats = useMemo(()=>({
    stockCount:  items.filter(it=>it.status==='stock').reduce((s,it)=>s+iq(it),0),
    listedCount: items.filter(it=>it.status==='listed').reduce((s,it)=>s+iq(it),0),
    salesCount:  activeSales(sales).reduce((s,x)=>s+(x.qty||1),0),
    profit:      +activeSales(sales).reduce((s,c)=>s+c.profit,0).toFixed(2),
    totalSpent:  +(Number(cfg.initialSpend||0)+expenses.all).toFixed(2),
    expenses,
  }),[items,sales,cfg.initialSpend,expenses]);

  const monthlyPL = useMemo(()=>{
    const map={};
    const ensure=k=>{ if(!map[k]) map[k]={revenue:0,fees:0,postage:0,stockSpend:0,postageEquip:0,supplies:0,refunds:0,profit:0,sales:0}; };
    activeSales(sales).forEach(s=>{
      const d=parseEnGBDate(s.date)||new Date(); const k=monthKey(d); ensure(k);
      map[k].revenue+=s.soldPrice||0; map[k].fees+=saleFees(s);
      map[k].postage+=s.postage||0;   map[k].profit+=s.profit||0;
      map[k].sales+=s.qty||1;
    });
    purchases.forEach(p=>{
      const d=parseEnGBDate(p.date)||new Date(); const k=monthKey(d); ensure(k);
      const t=p.type||'stock';
      if(t==='postage') map[k].postageEquip+=p.amount||0;
      else if(t==='supplies') map[k].supplies+=p.amount||0;
      else if(t==='refunds') map[k].refunds+=p.amount||0;
      else map[k].stockSpend+=p.amount||0;
    });
    return Object.entries(map).map(([key,v])=>{
      const businessCosts=v.stockSpend+v.postageEquip+v.supplies+(v.refunds||0);
      return{key,label:formatMonthLabel(key),...v,businessCosts,netProfit:+(v.profit-businessCosts).toFixed(2)};
    }).sort((a,b)=>b.key.localeCompare(a.key));
  },[sales,purchases]);

  // sell form computed
  const spNum = parseFloat(soldP)||0;
  const miNum = parseFloat(moneyInP)||0;
  const poNum = parseFloat(postageP)||0;
  const ebayFeesCalc = feesFromInputs(spNum,miNum);
  const sellProfit = miNum>0 ? +(miNum-poNum).toFixed(2) : 0;
  const sellQtyNum = Math.min(iq(sellItem||{}),Math.max(1,parseInt(sellQtyIn,10)||1));

  // bundle calc
  const bundleGross    = +bundle.reduce((s,p)=>s+p,0).toFixed(2);
  const bundleFeeTotal = +bundle.reduce((s,p)=>s+calcFees(p),0).toFixed(2);
  const bundlePostage  = +(bundle.length*(cfg.postage||1)).toFixed(2);
  const bundleNet      = +(bundleGross-bundleFeeTotal-bundlePostage).toFixed(2);
  const marginPct      = Math.min(100,Math.max(1,parseFloat(margin)||60));
  const bundlePay      = +(bundleNet*(marginPct/100)).toFixed(2);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const addCat=()=>{
    if(!newCatName.trim()){alert('Enter a category name');return;}
    const cat={id:'cat_'+Date.now(),name:newCatName.trim()};
    setCats(p=>[...p,cat]); setInvCat(cat.id); setLstCat(cat.id);
    setNewCatName(''); setShowAddCat(false);
  };

  const tryAddItem=()=>{
    if(!addName.trim()){alert('Enter an item name');return;}
    const p=parseFloat(addPrice)||0; if(p<=0){alert('Enter a price');return;}
    const q=Math.max(1,parseInt(addQty,10)||1);
    const bc=parseFloat(addBuyCost)||0;
    const dup=findDuplicate(addName,curInvCat,items);
    if(dup){ setDupPrompt({dup,name:addName.trim(),price:p,qty:q,catId:curInvCat,buyCost:bc,condition:addCondition,ebayCategory:addEbayCategory}); return; }
    doAddItem(addName.trim(),p,q,curInvCat,null,bc,addCondition,addEbayCategory);
  };

  const doAddItem=(name,price,qty,catId,mergeId,buyCost=0,condition='',ebayCategory='')=>{
    if(mergeId){
      setItems(p=>p.map(x=>x.id===mergeId?{...x,qty:iq(x)+qty}:x));
    }else{
      setItems(p=>[{id:Date.now(),name,categoryId:catId,price,qty,buyCost:+buyCost.toFixed(2)||0,condition,ebayCategory,photos:addPhotos||[],sellerPostageCost:+(cfg.postage||0),status:'stock',dateStr:todayEnGB()},...p]);
    }
    setAddName('');setAddPrice('');setAddQty('1');setAddBuyCost('');setAddCondition('');setAddEbayCategory('');setAddPhotos([]);setDupPrompt(null);setShowAddItem(false);
  };

  const confirmSell=()=>{
    if(miNum<=0){alert('Enter money received to your account');return;}
    if(spNum<=0){alert('Enter the eBay sale price');return;}
    if(miNum>spNum){alert('Money received cannot be more than the sale price');return;}
    const it=sellItem; const n=sellQtyNum;
    const sale={
      id:Date.now(),itemId:it.id,itemName:it.name,categoryId:it.categoryId,
      listedPrice:it.price,soldPrice:spNum,ebayFees:ebayFeesCalc,
      moneyIn:miNum,postage:poNum,profit:sellProfit,qty:n,date:todayEnGB(),
      buyCost:+(it.buyCost||0).toFixed(2),
      restore:{itemId:it.id,name:it.name,price:it.price,qty:n,status:'listed',dateStr:it.dateStr,categoryId:it.categoryId,buyCost:it.buyCost||0},
    };
    setSales(p=>[sale,...p]);
    setItems(p=>p.map(x=>x.id===it.id?applyAfterSale(x,n):x));
    setSellItem(null);setSoldP('');setMoneyInP('');setPostageP('');setSellQtyIn('1');
  };

  const refundSale=sale=>{
    const n=sale.qty||1;
    if(!confirm(`Refund this sale and return ${n} cop${n!==1?'ies':'y'} to inventory?`)) return;
    const r=sale.restore;
    if(r){
      setItems(prev=>{
        const ex=prev.find(x=>x.id===r.itemId);
        if(ex) return prev.map(x=>x.id===r.itemId?{...x,status:r.status,qty:iq(x)+n}:x);
        return [{id:r.itemId,name:r.name,price:r.price,qty:n,status:r.status,dateStr:r.dateStr,categoryId:r.categoryId,buyCost:0},...prev];
      });
    }else{
      setItems(p=>[{id:Date.now(),name:sale.itemName,price:sale.listedPrice,qty:n,status:'active',categoryId:sale.categoryId||cats[0]?.id,buyCost:0,dateStr:todayEnGB()},...p]);
    }
    setSales(p=>p.map(s=>s.id===sale.id?{...s,refunded:true,refundedAt:todayEnGB()}:s));
  };

  const isSelKey=(catId,id)=>`${catId}:${id}`;
  const isSel=(catId,id)=>lstSel.some(x=>x.key===isSelKey(catId,id));
  const toggleSel=(catId,item)=>{
    const key=isSelKey(catId,item.id);
    setLstSel(p=>p.some(x=>x.key===key)?p.filter(x=>x.key!==key):[...p,{key,id:item.id,catId,item}]);
  };

  const openBundleSell=()=>{
    if(lstSel.length<2){alert('Select at least 2 items for a bundle sale');return;}
    setBundleSell(lstSel.map(({item,catId})=>({item,catId,soldPrice:item.price.toFixed(2),moneyIn:'',sellQty:'1'})));
    setBundlePost('');
  };

  const confirmBundleSell=()=>{
    if(!bundleSell||bundleSell.length<2) return;
    const lines=bundleSell.map(row=>{
      const sp=parseFloat(row.soldPrice)||0; const mi=parseFloat(row.moneyIn)||0;
      const n=Math.min(iq(row.item),Math.max(1,parseInt(row.sellQty,10)||1));
      return{...row,sp,mi,n,fees:feesFromInputs(sp,mi)};
    });
    for(const {item,sp,mi,n} of lines){
      if(mi<=0){alert(`Enter money received for: ${item.name}`);return;}
      if(sp<=0){alert(`Enter sale price for: ${item.name}`);return;}
      if(mi>sp){alert(`Money received cannot exceed sale price for: ${item.name}`);return;}
    }
    const totalPost=parseFloat(bundlePost)||0;
    const postShares=splitPostageAcrossItems(totalPost,lines.map(l=>l.sp));
    const bundleId=Date.now();
    const savings=bundlePostageSavings(lines.length,totalPost);
    const date=todayEnGB();
    const newSales=lines.map((line,i)=>({
      id:bundleId+i+1,itemId:line.item.id,itemName:line.item.name,categoryId:line.catId,
      listedPrice:line.item.price,soldPrice:line.sp,ebayFees:line.fees,
      moneyIn:line.mi,postage:postShares[i]||0,profit:+(line.mi-(postShares[i]||0)).toFixed(2),
      qty:line.n,date,bundleId,bundleItemCount:lines.length,
      bundlePostageTotal:totalPost,bundleSavings:savings,
      buyCost:+(line.item.buyCost||0).toFixed(2),
      restore:{itemId:line.item.id,name:line.item.name,price:line.item.price,qty:line.n,status:'listed',dateStr:line.item.dateStr,categoryId:line.catId,buyCost:line.item.buyCost||0},
    }));
    setSales(p=>[...newSales,...p]);
    lines.forEach(({item,n})=>setItems(p=>p.map(x=>x.id===item.id?applyAfterSale(x,n):x)));
    setBundleSell(null);setBundlePost('');setLstSel([]);
  };

  const addSpend=()=>{
    const a=parseFloat(spendAmt)||0; if(a<=0){alert('Enter an amount');return;}
    setPurchases(p=>[{id:Date.now(),date:todayEnGB(),amount:+a.toFixed(2),note:spendNote.trim(),type:spendType},...p]);
    setSpendAmt('');setSpendNote('');setShowSpend(false);
  };

  const setStockTotal=()=>{
    const t=parseFloat(spendSetTotal); if(isNaN(t)||t<0){alert('Enter a valid total');return;}
    setPurchases(p=>[{id:Date.now(),date:todayEnGB(),amount:+t.toFixed(2),note:'Stock total set',type:'stock'},...p.filter(x=>(x.type||'stock')!=='stock')]);
    setSpendAmt('');setShowSpend(false);
  };

  const saveCfg=()=>{ const u={...cfgForm,baseFee:Number(cfgForm.baseFee)||15,postage:Number(cfgForm.postage)||1,initialSpend:Number(cfgForm.initialSpend)||0}; setCfg(u);setCfgForm(u);setShowCfg(false); };

  // ── Bulk inventory selection ──────────────────────────────────
  const invSelKey = id => String(id);
  const isInvSel = id => invSel.includes(invSelKey(id));
  const toggleInvSel = id => {
    const k = invSelKey(id);
    setInvSel(p => p.includes(k) ? p.filter(x=>x!==k) : [...p,k]);
  };
  const toggleAllInvVisible = items => {
    if(!items.length) return;
    const keys = items.map(it=>invSelKey(it.id));
    const allOn = items.every(it=>isInvSel(it.id));
    setInvSel(p => allOn ? p.filter(x=>!keys.includes(x)) : [...new Set([...p,...keys])]);
  };
  const deleteInvSelection = () => {
    const n = invSel.length;
    if(!n) return;
    if(!confirm(`Remove ${n} selected item${n!==1?'s':''} from inventory?`)) return;
    setItems(p=>p.filter(it=>!invSel.includes(invSelKey(it.id))));
    setInvSel([]);
  };

  const saveDetailItem = (updated, keepOpen=false) => {
    setItems(p => p.map(x => x.id === updated.id ? updated : x));
    if (!keepOpen) setDetailItem(null);
  };

  const handleOpenPortal = async () => {
    const fallback = 'https://app.lemonsqueezy.com/my-orders';
    const url = subCustomerId
      ? await fetch('/api/portal?customerId='+subCustomerId).then(r=>r.json()).then(d=>d.url||fallback).catch(()=>fallback)
      : fallback;
    window.open(url,'_blank');
  };

  if(!isLoaded) return <div style={{...S.app,alignItems:'center',justifyContent:'center',fontSize:14,color:'var(--text-2)'}}>Loading…</div>;

  if(!isSignedIn) return(
    <div style={{...S.app,alignItems:'center',justifyContent:'center'}}>
      <div style={{textAlign:'center',marginBottom:32}}>
        <div style={{fontSize:40,marginBottom:8}}>📦</div>
        <div style={{fontSize:22,fontWeight:700,color:'var(--text-1)',marginBottom:4}}>ResellerTrack</div>
        <div style={{fontSize:13,color:'var(--text-2)'}}>Sign in to access your store</div>
      </div>
      <SignIn routing="hash" afterSignInUrl="/" appearance={{elements:{footerAction:{display:'none'}}}}/>
      <p style={{fontSize:12,color:'var(--text-3)',marginTop:20,textAlign:'center'}}>
        Don't have an account?{' '}
        <a href="https://resellertrack.lemonsqueezy.com/checkout/buy/339acfaf-9d87-427d-9869-49d3fb798dbf" style={{color:'var(--blue)'}}>Start your free trial</a>
      </p>
    </div>
  );

  if(!ready) return <div style={{...S.app,alignItems:'center',justifyContent:'center',fontSize:14,color:'var(--text-2)'}}>Loading your data…</div>;

  // Paywall — subscription expired
  if(subStatus==='expired'){
    return(
      <div style={{...S.app,alignItems:'center',justifyContent:'center'}}>
        <div style={{maxWidth:420,textAlign:'center',padding:32}}>
          <div style={{fontSize:48,marginBottom:16}}>📦</div>
          <h2 style={{fontSize:22,fontWeight:700,color:'var(--text-1)',marginBottom:8}}>Your subscription has ended</h2>
          <p style={{fontSize:14,color:'var(--text-2)',lineHeight:1.7,marginBottom:28}}>Renew your subscription to access ResellerTrack. Your data is safe and will be waiting for you.</p>
          <a href="https://resellertrack.lemonsqueezy.com/checkout/buy/339acfaf-9d87-427d-9869-49d3fb798dbf"
            style={{...S.addBtn,fontSize:15,padding:'12px 24px',margin:'0 auto 16px',display:'inline-flex',textDecoration:'none'}}>
            Renew subscription — £4.99/month
          </a>
          <br/>
          <button style={{...S.mBtn,fontSize:13,margin:'0 auto'}} onClick={()=>signOut()}>Sign out</button>
        </div>
      </div>
    );
  }

  // First run — no categories yet
  if(cats.length===0){
    return(
      <div style={{...S.app,alignItems:'center',justifyContent:'center'}}>
        <div style={{maxWidth:440,textAlign:'center',padding:32}}>
          <div style={{fontSize:52,marginBottom:16}}>📦</div>
          <h1 style={{fontSize:26,fontWeight:700,marginBottom:8,color:'var(--text-1)'}}>ResellerTrack</h1>
          <p style={{fontSize:14,color:'var(--text-2)',lineHeight:1.7,marginBottom:20}}>Track your stock, active listings, sales and profit. Built for eBay resellers of anything.</p>
          <p style={{fontSize:13,color:'var(--text-1)',marginBottom:12,fontWeight:500}}>Create your first category to get started:</p>
          <div style={{display:'flex',gap:8,marginBottom:16,maxWidth:360,margin:'0 auto 16px'}}>
            <input style={{...S.fInp,flex:1}} placeholder="e.g. Trading Cards, Clothing…" value={newCatName} onChange={e=>setNewCatName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addCat()} autoFocus/>
            <button style={S.addBtn} onClick={addCat}>Create</button>
          </div>
          <button style={{...S.mBtn,fontSize:12,margin:'0 auto'}} onClick={()=>{setCfgForm(cfg);setShowCfg(true);}}>⚙️ Configure settings first</button>
        </div>
        {showCfg&&<SettingsModal cfg={cfgForm} onChange={setCfgForm} onSave={saveCfg} onClose={()=>setShowCfg(false)} feeLabel={feeLabel} effectiveFeeRate={effectiveFeeRate} salesCount={activeSales(sales).length}/>}
      </div>
    );
  }


  const TABS = [
    {id:'dashboard', icon:'🏠', label:'Dashboard'},
    {id:'inventory',  icon:'📦', label:'Inventory'},
    {id:'listings',   icon:'🏷️',  label:'Active Listings', badge: stats.listedCount},
    {id:'buying',     icon:'🧮', label:'Buy Calculator'},
    {id:'sales',      icon:'💰', label:'Sales Log'},
    {id:'pnl',        icon:'📊', label:'P&L'},
  ];
  const PAGE_TITLES = {dashboard:'Dashboard',inventory:'Inventory',listings:'Active Listings',buying:'Buy Calculator',sales:'Sales Log',pnl:'Profit & Loss'};

  return(
    <div style={{display:'flex',height:'100vh',overflow:'hidden',background:'var(--bg)',color:'var(--text-1)',fontFamily:"'Inter',system-ui,sans-serif"}}>
      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <aside className="rt-sidebar">
        <div className="rt-logo">
          <div className="rt-logo-icon">📦</div>
          <span className="rt-logo-text">ResellerTrack</span>
        </div>
        <div className="rt-nav-section">
          <div className="rt-nav-label">Menu</div>
          {TABS.map(t=>(
            <NavBtn key={t.id} active={tab===t.id} onClick={()=>setTab(t.id)} icon={t.icon} badge={t.badge}>
              {t.label}
            </NavBtn>
          ))}
          <div className="rt-nav-label" style={{marginTop:20}}>Account</div>
          <NavBtn icon="⚙️" onClick={()=>{setCfgForm(cfg);setShowCfg(true);}}>Settings</NavBtn>
          <NavBtn icon="👤" onClick={()=>setShowAccount(true)}>My Account</NavBtn>
          <NavBtn icon="➕" onClick={()=>setShowSpend(true)}>Log Spend</NavBtn>
        </div>
        <div className="rt-sidebar-footer">
          <div className="rt-user-row" onClick={()=>setShowAccount(true)}>
            <div className="rt-avatar">{(user?.firstName||'?')[0].toUpperCase()}</div>
            <div>
              <div className="rt-user-name">{user?.firstName||'Account'}</div>
              <div className="rt-user-sub" style={{color:syncStatus==='error'?'var(--red)':syncStatus==='saving'?'var(--amber)':'var(--green)'}}>
                {syncStatus==='error'?'⚠ Sync error':syncStatus==='saving'?'Saving…':'✓ Synced'}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main content area ──────────────────────────────────────────────── */}
      <div className="rt-main-area">
        {/* Top bar */}
        <header className="rt-topbar">
          <span className="rt-topbar-title">{PAGE_TITLES[tab]||tab}</span>
          <div className="rt-topbar-actions">
            {subStatus==='cancelled'&&<a href="https://resellertrack.lemonsqueezy.com/checkout/buy/339acfaf-9d87-427d-9869-49d3fb798dbf" style={{fontSize:11,color:'var(--amber)',background:'var(--amber-a)',padding:'3px 10px',borderRadius:20,border:'1px solid rgba(245,158,11,0.3)'}}>⚠ Subscription cancelled — Renew</a>}
            {effectiveFeeRate&&<span style={{fontSize:11,color:'var(--green)',background:'var(--green-a)',border:'1px solid rgba(16,185,129,0.2)',padding:'3px 10px',borderRadius:20}}>Fee: {(effectiveFeeRate*100).toFixed(1)}%</span>}
            {(tab==='dashboard'||tab==='inventory')&&<button style={S.mBtn} onClick={()=>setShowSpend(true)}>💸 Log Spend</button>}
            {tab==='inventory'&&<button style={S.addBtn} onClick={doAddItem}>＋ Add Item</button>}
            {tab==='listings'&&ebayStatus?.connected&&(
              <button style={{...S.mBtn,fontSize:12}} onClick={syncEbayOrders} disabled={ebaySyncState.loading}>
                {ebaySyncState.loading?'⏳ Syncing…':'↻ Sync eBay'}
              </button>
            )}
            {tab==='listings'&&<button style={S.addBtn} onClick={()=>setBundleSell(true)}>📦 Bundle sale</button>}
          </div>
        </header>

        {/* eBay sync result banner — visible feedback after pressing Sync eBay */}
        {ebaySyncState.msg&&(
          <div style={{
            padding:'10px 24px',
            fontSize:12,
            display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,
            background: ebaySyncState.msg.startsWith('✗') ? 'var(--red-a)' : ebaySyncState.msg.includes('⚠') ? 'var(--amber-a)' : 'var(--green-a)',
            borderBottom: `1px solid ${ebaySyncState.msg.startsWith('✗') ? 'rgba(239,68,68,0.3)' : ebaySyncState.msg.includes('⚠') ? 'rgba(245,158,11,0.3)' : 'rgba(16,185,129,0.3)'}`,
            color: ebaySyncState.msg.startsWith('✗') ? 'var(--red)' : ebaySyncState.msg.includes('⚠') ? 'var(--amber)' : 'var(--green)',
          }}>
            <span>{ebaySyncState.msg}</span>
            <button onClick={()=>setEbaySyncState(s=>({...s,msg:''}))} style={{background:'none',border:'none',color:'inherit',cursor:'pointer',fontSize:14,opacity:0.7,flexShrink:0}}>✕</button>
          </div>
        )}

        {/* Stats bar — inside main area, below topbar */}
        {tab!=='dashboard'&&(
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:10,padding:'14px 24px',borderBottom:'1px solid var(--border)',background:'var(--sidebar)'}}>
            {[['In stock',stats.stockCount,'var(--text-2)'],['Listed',stats.listedCount,'var(--amber)'],['Items sold',stats.salesCount,'var(--text-1)'],['Total profit',fmt(stats.profit),stats.profit>=0?'var(--green)':'var(--red)']].map(([l,v,c])=>(
              <div key={l} style={S.sCard}><span style={{...S.sV,color:c}}>{v}</span><span style={S.sL}>{l}</span></div>
            ))}
            <div style={{...S.sCard,cursor:'pointer'}} onClick={()=>setShowSpend(true)}>
              <span style={{...S.sV,color:'var(--red)'}}>{fmt(stats.expenses.all)}</span>
              <span style={S.sL}>Costs <span style={{color:'var(--accent)',fontSize:10}}>＋ log</span></span>
            </div>
          </div>
        )}

        {/* Page content */}
      <div className="rt-main">
        <PageHints tab={tab} />

        {/* DASHBOARD */}
        {tab==='dashboard'&&(
          <Dashboard stats={stats} monthlyPL={monthlyPL} expenses={expenses} sales={sales} purchases={purchases} items={items} cats={cats} sym={sym} isMobile={isMobile}/>
        )}

        {/* INVENTORY */}
        {tab==='inventory'&&(()=>{
          const counts=Object.fromEntries(cats.map(c=>[c.id,items.filter(it=>it.categoryId===c.id&&it.status==='stock').reduce((s,it)=>s+iq(it),0)]));
          return <>
            <div className="rt-cat-tabs">
              {cats.map(c=>(
                <button key={c.id} style={{...S.catTab,...(curInvCat===c.id?S.catTabA:{})}} onClick={()=>{setInvCat(c.id);setInvSearch('');setInvTier('all');}}>
                  {c.name} <span style={{opacity:.6}}>({counts[c.id]||0})</span>
                </button>
              ))}
              <button style={{...S.catTab,marginLeft:'auto',color:'var(--blue)',borderColor:'var(--accent)',flexShrink:0}} onClick={()=>{setNewCatName('');setShowAddCat(true);}}>＋ New category</button>
            </div>
            <div className="rt-toolbar">
              <div className="rt-search-wrap" style={{position:'relative',width:220,flexShrink:0}}>
                <span style={S.sIcon}>🔍</span>
                <input style={{...S.sInput,paddingRight:invSearch?30:10}} placeholder={`Search ${cats.find(c=>c.id===curInvCat)?.name||''}…`} value={invSearch} onChange={e=>setInvSearch(e.target.value)}/>
                {invSearch&&<button type="button" style={S.sClear} onClick={()=>setInvSearch('')} title="Clear">✕</button>}
              </div>
              {!isMobile&&<div style={{display:'flex',gap:4}}>
                {[['all','All'],['high','£20+'],['mid','£5–20'],['low','Under £5']].map(([v,l])=>(
                  <button key={v} style={{...S.chip,...(invTier===v?S.chipA:{})}} onClick={()=>setInvTier(v)}>{l}</button>
                ))}
              </div>}
              {!isMobile&&<select style={S.sel} value={invSort} onChange={e=>setInvSort(e.target.value)}>
                {SORT_OPTS.map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select>}
              {invSel.length>0&&(
                <>
                  <span style={{fontSize:12,color:'var(--blue)'}}>{invSel.length} selected</span>
                  <button style={{...S.mBtn,fontSize:12,padding:'5px 10px',color:'var(--red)',borderColor:'var(--red)'}} onClick={deleteInvSelection}>🗑 Delete selected</button>
                  <button style={{...S.mBtn,fontSize:12,padding:'5px 10px'}} onClick={()=>setInvSel([])}>Clear</button>
                </>
              )}
              <button style={S.addBtn} onClick={()=>{setAddName('');setAddPrice('');setAddQty('1');setShowAddItem(true);}}>＋ Add item</button>
            </div>
            {isMobile ? (
              <div>
                {filteredItems.length===0&&<div style={S.empty}>No items — tap ＋ Add item to get started</div>}
                {filteredItems.map(it=>(
                  <div key={it.id} style={{...mCard,background:isInvSel(it.id)?'var(--blue-a)':'var(--surface)'}}>
                    <div style={mRow}>
                      <div style={{display:'flex',alignItems:'flex-start',gap:8,flex:1,paddingRight:8}}>
                        <input type="checkbox" style={{...S.chk,marginTop:2,flexShrink:0}} checked={isInvSel(it.id)} onChange={()=>toggleInvSel(it.id)}/>
                        <div style={{...mName,color:'var(--blue)',cursor:'pointer'}} onClick={()=>setDetailItem(it)}>{it.name}</div>
                      </div>
                      <div style={{fontSize:20,fontWeight:700,color:'var(--accent)',flexShrink:0}}>{fmt(it.price)}</div>
                    </div>
                    <div style={{fontSize:11,color:'var(--text-2)',marginBottom:4}}>{it.dateStr}{it.condition?' · '+it.condition:''}{it.buyCost>0?' · cost: '+fmt(it.buyCost):''}</div>
                    <div style={{fontSize:11,marginBottom:8}}><span style={{color:'var(--text-2)'}}>Profit est: </span><span style={{color:(it.price-calcFees(it.price)-(it.buyCost||0))>=0?'var(--green)':'var(--red)',fontWeight:600}}>{fmt(it.price-calcFees(it.price)-(it.buyCost||0))}</span></div>
                    <div style={mFoot}>
                      <QtyCell value={iq(it)} onChange={n=>setItems(p=>p.map(x=>x.id===it.id?{...x,qty:n}:x))}/>
                      <div style={S.acts}>
                        <IBtn href={ebayUrl(it.name)} title="Search eBay sold">🔍</IBtn>
                        <IBtn onClick={()=>setItems(p=>p.map(x=>x.id===it.id?{...x,status:'listed',listedAt:todayEnGB()}:x))} title="Move to listings" col="var(--blue)">→</IBtn>
                        <IBtn onClick={()=>{if(confirm('Remove this item?'))setItems(p=>p.filter(x=>x.id!==it.id));}} title="Remove" col="var(--red)">✕</IBtn>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={S.tWrap}><table style={S.tbl}>
                <thead><tr>
                  <th style={{...S.th,width:'4%',textAlign:'center'}}><input type="checkbox" style={S.chk} title="Select all visible" checked={filteredItems.length>0&&filteredItems.every(it=>isInvSel(it.id))} onChange={()=>toggleAllInvVisible(filteredItems)}/></th>
                  <th style={{...S.th,width:'26%'}}>Item</th>
                  <th style={{...S.th,width:'7%',textAlign:'center'}}>Qty</th>
                  <th style={{...S.th,width:'9%'}}>Added</th>
                  <th style={{...S.th,width:'9%',textAlign:'right'}}>Value</th>
                  <th style={{...S.th,width:'9%',textAlign:'right'}}>Item cost</th>
                  <th style={{...S.th,width:'11%',textAlign:'right'}}>Profit est.</th>
                  <th style={{...S.th,width:'15%'}}>Actions</th>
                </tr></thead>
                <tbody>
                  {filteredItems.length===0&&<tr><td colSpan={6} style={S.empty}>No items — click ＋ Add item to get started</td></tr>}
                  {filteredItems.map((it,i)=>(
                    <tr key={it.id} style={{background:isInvSel(it.id)?'var(--blue-a)':i%2===0?'transparent':'var(--surface)'}}>
                      <td style={{...S.td,textAlign:'center'}}><input type="checkbox" style={S.chk} checked={isInvSel(it.id)} onChange={()=>toggleInvSel(it.id)}/></td>
                      <td style={{...S.td,cursor:'pointer'}} onClick={()=>setDetailItem(it)}><span style={{display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'var(--blue)'}} title={it.name}>{it.name}</span>{it.condition&&<span style={{fontSize:10,color:'var(--text-2)',display:'block'}}>{it.condition}</span>}</td>
                      <td style={S.td}><QtyCell value={iq(it)} onChange={n=>setItems(p=>p.map(x=>x.id===it.id?{...x,qty:n}:x))}/></td>
                      <td style={{...S.td,color:'var(--text-2)',fontSize:11}}>{it.dateStr}</td>
                      <td style={{...S.td,textAlign:'right',color:'var(--accent)',fontWeight:600}}>{fmt(it.price)}</td>
                      <td style={{...S.td,textAlign:'right',color:it.buyCost>0?'var(--red)':'var(--text-3)',fontSize:11}}>{it.buyCost>0?fmt(it.buyCost):'—'}</td>
                      <td style={{...S.td,textAlign:'right',fontSize:11}}>{(()=>{const p=it.price-calcFees(it.price)-(it.buyCost||0);return <span style={{color:p>=0?'var(--green)':'var(--red)',fontWeight:p>0?600:400}}>{fmt(p)}</span>;})()}</td>
                      <td style={S.td}><div style={S.acts}>
                        <IBtn href={ebayUrl(it.name)} title="Search eBay sold prices">🔍</IBtn>
                        <IBtn onClick={()=>setItems(p=>p.map(x=>x.id===it.id?{...x,status:'listed',listedAt:todayEnGB()}:x))} title="Move to Active Listings without opening eBay" col="var(--blue)">→</IBtn>
                        <IBtn onClick={()=>{if(confirm('Remove this item?'))setItems(p=>p.filter(x=>x.id!==it.id));}} title="Remove" col="var(--red)">✕</IBtn>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
            <div style={S.fRow}>{filteredItems.length} of {items.filter(it=>it.categoryId===curInvCat&&it.status==='stock').reduce((s,it)=>s+iq(it),0)} copies</div>
          </>;
        })()}

        {/* ACTIVE LISTINGS */}
        {tab==='listings'&&(()=>{
          const counts=Object.fromEntries(cats.map(c=>[c.id,items.filter(it=>it.categoryId===c.id&&it.status==='listed').reduce((s,it)=>s+iq(it),0)]));
          const totalAllListed=Object.values(counts).reduce((s,n)=>s+n,0);
          const listVal=filteredListed.reduce((s,it)=>s+it.price*iq(it),0);
          return<>
            {totalAllListed===0&&lstSearch===''
              ?<div style={S.empty}><div style={{fontSize:32,marginBottom:8}}>🏷️</div>No active listings.<br/><span style={{fontSize:12}}>Go to <span style={{color:'var(--blue)',cursor:'pointer'}} onClick={()=>setTab('inventory')}>Inventory</span> and press → to list an item.</span></div>
              :<>
                <div className="rt-cat-tabs">
                  {cats.map(c=>(
                    <button key={c.id} style={{...S.catTab,...(curLstCat===c.id?S.catTabA:{})}} onClick={()=>{setLstCat(c.id);setLstSearch('');setLstSel([]);}}>
                      {c.name} <span style={{opacity:.6}}>({counts[c.id]||0})</span>
                    </button>
                  ))}
                </div>
                <div className="rt-toolbar">
                  <SearchBar value={lstSearch} onChange={setLstSearch} placeholder="Search listings…"/>
                  <select style={S.sel} value={lstSort} onChange={e=>setLstSort(e.target.value)}>
                    {SORT_OPTS.map(([v,l])=><option key={v} value={v}>{l}</option>)}
                  </select>
                  {lstSel.length>0&&<>
                    <span style={{fontSize:12,color:'var(--blue)'}}>{lstSel.length} selected</span>
                    {lstSel.length>=2&&<button style={S.addBtn} onClick={openBundleSell}>📦 Bundle sale</button>}
                    <button style={{...S.mBtn,fontSize:12,padding:'5px 10px'}} onClick={()=>setLstSel([])}>Clear</button>
                  </>}
                  <span style={{fontSize:12,color:'var(--text-2)',marginLeft:lstSel.length>0?0:'auto'}}>Listed value: <strong style={{color:'var(--accent)'}}>{fmt(listVal)}</strong></span>
                </div>
                {filteredListed.length>0&&<p style={{fontSize:11,color:'var(--text-3)',margin:'0 0 8px'}}>Tick items sold together to log a bundle sale with shared postage.</p>}
                {filteredListed.length===0
                  ?<div style={S.empty}>Nothing listed in this category yet. Press → on an item to list it.</div>
                  :<>
                    {isMobile ? (
                      <div>
                        {filteredListed.map(it=>(
                          <div key={it.id} style={{...mCard,background:isSel(curLstCat,it.id)?'var(--blue-a)':'var(--surface)'}}>
                            <div style={mRow}>
                              <div style={{flex:1,paddingRight:8}}>
                                <div style={{fontWeight:600,fontSize:14,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'var(--blue)',cursor:'pointer'}} onClick={()=>setDetailItem(it)}>{it.name}</div>
                                <div style={mSub}>Listed {it.listedAt||it.dateStr||'—'}{it.buyCost>0?' · cost '+fmt(it.buyCost):''}</div>
                                <div style={{fontSize:11,marginTop:2}}><span style={{color:'var(--text-2)'}}>Profit est: </span><span style={{color:(it.price-calcFees(it.price)-(it.buyCost||0))>=0?'var(--green)':'var(--red)',fontWeight:600}}>{fmt(it.price-calcFees(it.price)-(it.buyCost||0))}</span></div>
                              </div>
                              <div style={{fontSize:20,fontWeight:700,color:'var(--accent)',flexShrink:0}}>{fmt(it.price)}</div>
                            </div>
                            <div style={mFoot}>
                              <div style={{display:'flex',alignItems:'center',gap:6}}>
                                <input type="checkbox" style={S.chk} checked={isSel(curLstCat,it.id)} onChange={()=>toggleSel(curLstCat,it)}/>
                                <QtyCell value={iq(it)} onChange={n=>setItems(p=>p.map(x=>x.id===it.id?{...x,qty:n}:x))}/>
                              </div>
                              <div style={S.acts}>
                                <IBtn href={ebayUrl(it.name)} title="Search eBay sold">🔍</IBtn>
                                <IBtn onClick={()=>{setSellItem(it);setSoldP(it.price.toFixed(2));setMoneyInP('');setPostageP('');setSellQtyIn('1');}} title="Log sale" col="var(--green)">£</IBtn>
                                <IBtn onClick={()=>setItems(p=>p.map(x=>x.id===it.id?{...x,status:'stock'}:x))} title="Back to inventory" col="var(--text-2)">←</IBtn>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                    <div style={S.tWrap}>
                      <table style={S.tbl}>
                        <thead><tr>
                          <th style={{...S.th,width:'4%'}}></th>
                          <th style={{...S.th,width:'26%'}}>Item</th>
                          <th style={{...S.th,width:'7%',textAlign:'center'}}>Qty</th>
                          <th style={{...S.th,width:'9%'}}>Listed</th>
                          <th style={{...S.th,width:'9%',textAlign:'right'}}>Price</th>
                          <th style={{...S.th,width:'9%',textAlign:'right'}}>Item cost</th>
                          <th style={{...S.th,width:'11%',textAlign:'right'}}>Profit est.</th>
                          <th style={{...S.th,width:'15%'}}>Actions</th>
                        </tr></thead>
                        <tbody>
                          {filteredListed.map((it,i)=>(
                            <tr key={it.id} style={{background:isSel(curLstCat,it.id)?'var(--blue-a)':i%2===0?'transparent':'var(--surface)'}}>
                              <td style={{...S.td,textAlign:'center'}}><input type="checkbox" style={S.chk} checked={isSel(curLstCat,it.id)} onChange={()=>toggleSel(curLstCat,it)}/></td>
                              <td style={{...S.td,cursor:'pointer'}} onClick={()=>setDetailItem(it)}><span style={{display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'var(--blue)'}} title={it.name}>{it.name}</span>{it.condition&&<span style={{fontSize:10,color:'var(--text-2)',display:'block'}}>{it.condition}</span>}</td>
                              <td style={S.td}><QtyCell value={iq(it)} onChange={n=>setItems(p=>p.map(x=>x.id===it.id?{...x,qty:n}:x))}/></td>
                              <td style={{...S.td,color:'var(--text-2)',fontSize:11}}>{it.listedAt||it.dateStr||'—'}</td>
                              <td style={{...S.td,textAlign:'right',color:'var(--accent)',fontWeight:600}}>{fmt(it.price)}</td>
                              <td style={{...S.td,textAlign:'right',color:it.buyCost>0?'var(--red)':'var(--text-3)',fontSize:11}}>{it.buyCost>0?fmt(it.buyCost):'—'}</td>
                              <td style={{...S.td,textAlign:'right',fontSize:11}}>{(()=>{const p=it.price-calcFees(it.price)-(it.buyCost||0);return <span style={{color:p>=0?'var(--green)':'var(--red)',fontWeight:p>0?600:400}}>{fmt(p)}</span>;})()}</td>
                              <td style={S.td}><div style={S.acts}>
                                <IBtn href={ebayUrl(it.name)} title="eBay sold listings">🔍</IBtn>
                                <IBtn onClick={()=>{setSellItem(it);setSoldP(it.price.toFixed(2));setMoneyInP('');setPostageP('');setSellQtyIn('1');}} title="Log sale" col="var(--green)">£</IBtn>
                                <IBtn onClick={()=>setItems(p=>p.map(x=>x.id===it.id?{...x,status:'stock'}:x))} title="Move back to inventory" col="var(--text-2)">←</IBtn>
                                <IBtn onClick={()=>{if(confirm('Remove?'))setItems(p=>p.filter(x=>x.id!==it.id));}} title="Remove" col="var(--red)">✕</IBtn>
                              </div></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    )}
                    <div style={S.fRow}>{filteredListed.length} listing{filteredListed.length!==1?'s':''} · {filteredListed.reduce((s,it)=>s+iq(it),0)} copies</div>
                  </>
                }
              </>
            }
          </>;
        })()}

        {/* BUY CALCULATOR */}
        {tab==='buying'&&<>
          <div style={{...S.note,marginBottom:12}}>
            {effectiveFeeRate
              ?<>Using your <strong>{(effectiveFeeRate*100).toFixed(1)}%</strong> average fee from {activeSales(sales).length} sales.</>
              :<>No sales yet — using <strong>{cfg.baseFee||15}%</strong> base rate. Log sales to use your real fee rate.</>}
          </div>
          <div style={S.cCard}>
            <div style={S.cH}>Bundle entry — {feeLabel} · {sym}{(cfg.postage||1).toFixed(2)} postage/item</div>
            <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
              <span style={{fontSize:13,color:'var(--text-2)',whiteSpace:'nowrap'}}>Item value ({sym})</span>
              <input style={{...S.fInp,width:120}} type="number" step="0.01" min="0" value={bundleIn} onChange={e=>setBundleIn(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'){const v=parseFloat(bundleIn);if(v>0){setBundle(p=>[...p,v]);setBundleIn('');}}}
                } placeholder="0.00"/>
              <button style={S.addBtn} onClick={()=>{const v=parseFloat(bundleIn);if(v>0){setBundle(p=>[...p,v]);setBundleIn('');}else alert('Enter a value');}}>＋ Add</button>
              {bundle.length>0&&<button style={{...S.mBtn,fontSize:12,padding:'5px 10px'}} onClick={()=>setBundle([])}>Clear all</button>}
              <div style={{display:'flex',alignItems:'center',gap:6,marginLeft:'auto'}}>
                <span style={{fontSize:12,color:'var(--text-2)',whiteSpace:'nowrap'}}>Margin %</span>
                <input style={{...S.fInp,width:70,textAlign:'center'}} type="number" min="1" max="100" step="1" value={margin} onChange={e=>setMargin(e.target.value)} title="Percentage of net value you want to pay"/>
              </div>
            </div>
          </div>
          {bundle.length===0
            ?<div style={{...S.empty,paddingTop:48}}><div style={{fontSize:28,marginBottom:8}}>🛒</div>Enter each item's value and press Enter or Add.<br/><span style={{fontSize:11}}>We calculate what to pay based on fees, postage, and a 60% margin.</span></div>
            :<>
              <div style={S.tWrap}>
                <table style={S.tbl}>
                  <thead><tr>
                    <th style={{...S.th,width:'6%'}}>#</th>
                    <th style={{...S.th,width:'23%',textAlign:'right'}}>Item value</th>
                    <th style={{...S.th,width:'23%',textAlign:'right'}}>eBay fees ({(effectiveFeeRate?effectiveFeeRate*100:(cfg.baseFee||15)).toFixed(1)}%)</th>
                    <th style={{...S.th,width:'20%',textAlign:'right'}}>Postage</th>
                    <th style={{...S.th,width:'22%',textAlign:'right'}}>Net value</th>
                    <th style={{...S.th,width:'6%'}}></th>
                  </tr></thead>
                  <tbody>
                    {bundle.map((p,i)=>{
                      const fee=calcFees(p); const net=+(p-fee-(cfg.postage||1)).toFixed(2);
                      return <tr key={i} style={{background:i%2===0?'transparent':'var(--surface)'}}>
                        <td style={{...S.td,color:'var(--text-2)',fontSize:11}}>{i+1}</td>
                        <td style={{...S.td,textAlign:'right',color:'var(--accent)',fontWeight:600}}>{sym}{p.toFixed(2)}</td>
                        <td style={{...S.td,textAlign:'right',color:'var(--red)',fontSize:12}}>−{sym}{fee.toFixed(2)}</td>
                        <td style={{...S.td,textAlign:'right',color:'var(--red)',fontSize:12}}>−{sym}{(cfg.postage||1).toFixed(2)}</td>
                        <td style={{...S.td,textAlign:'right',fontWeight:600,color:net>=0?'var(--text-1)':'var(--red)'}}>{sym}{net.toFixed(2)}</td>
                        <td style={S.td}><IBtn onClick={()=>setBundle(p2=>p2.filter((_,j)=>j!==i))} col="var(--red)">✕</IBtn></td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{...S.cCard,marginTop:12}}>
                <div style={S.cH}>Summary</div>
                {[[`Total listed value`,`${sym}${bundleGross.toFixed(2)}`,null],[`eBay fees × ${bundle.length}`,`−${sym}${bundleFeeTotal.toFixed(2)}`,'var(--red)'],[`Postage × ${bundle.length}`,`−${sym}${bundlePostage.toFixed(2)}`,'var(--red)']].map(([l,v,c])=>(
                  <div key={l} style={S.bRow}><span style={{color:'var(--text-2)'}}>{l}</span><span style={c?{color:c}:{}}>{v}</span></div>
                ))}
                <div style={{...S.bRow,borderBottom:'none',paddingTop:8,marginTop:4,borderTop:'1px solid var(--border)'}}><span style={{fontWeight:600}}>Total net value</span><span style={{fontWeight:700}}>{sym}{bundleNet.toFixed(2)}</span></div>
              </div>
              <div style={{marginTop:10,background:'var(--green-a)',border:'1px solid var(--green)',borderRadius:8,padding:'14px 18px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div><div style={{fontSize:12,color:'#7ee787',fontWeight:500,marginBottom:2}}>Amount you should pay</div><div style={{fontSize:11,color:'var(--green)',opacity:.8}}>{marginPct}% of net value after fees and postage</div></div>
                <div style={{fontSize:32,fontWeight:700,color:'var(--green)'}}>{sym}{bundlePay.toFixed(2)}</div>
              </div>
            </>
          }
        </>}

        {/* SALES LOG */}
        {tab==='sales'&&(()=>{
          const logged=activeSales(sales);
          if(logged.length===0) return <div style={S.empty}><div style={{fontSize:32,marginBottom:8}}>💰</div>No sales yet.<br/>Log sales from the Active Listings tab.</div>;
          const tMi=logged.reduce((a,x)=>a+moneyReceived(x),0);
          const tPost=logged.reduce((a,x)=>a+(x.postage||0),0);
          const tProfit=logged.reduce((a,x)=>a+(x.profit||0),0);
          const tFees=logged.reduce((a,x)=>a+saleFees(x),0);
          const tSp=logged.reduce((a,x)=>a+(x.soldPrice||0),0);
          const avgFee=tSp>0?+((tFees/tSp)*100).toFixed(1):0;
          return <>
            <div style={{...S.iCard,marginBottom:12,display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
              <div><div style={{fontSize:11,color:'var(--text-2)',marginBottom:4}}>Average eBay fee rate</div><div style={{fontSize:28,fontWeight:700,color:'var(--red)',lineHeight:1.1}}>{avgFee}%</div><div style={{fontSize:11,color:'var(--text-3)',marginTop:6}}>{logged.length} sale{logged.length!==1?'s':''} · {fmt(tFees)} total fees</div></div>
              <div style={{fontSize:12,color:'var(--text-2)',textAlign:'right'}}><div>Total revenue: <strong style={{color:'var(--text-1)'}}>{fmt(tSp)}</strong></div><div>Total money in: <strong style={{color:'var(--accent)'}}>{fmt(tMi)}</strong></div></div>
            </div>
            <div style={{...S.sRow,padding:0,marginBottom:12,gridTemplateColumns:'repeat(4,1fr)'}}>
              <div style={S.sCard}><span style={S.sV}>{logged.reduce((a,x)=>a+(x.qty||1),0)}</span><span style={S.sL}>Items sold</span></div>
              <div style={S.sCard}><span style={{...S.sV,color:'var(--accent)'}}>{fmt(tMi)}</span><span style={S.sL}>Total money in</span></div>
              <div style={S.sCard}><span style={{...S.sV,color:'var(--red)'}}>{fmt(tPost)}</span><span style={S.sL}>Total postage</span></div>
              <div style={S.sCard}><span style={{...S.sV,color:tProfit>=0?'var(--green)':'var(--red)'}}>{fmt(tProfit)}</span><span style={S.sL}>Total profit</span></div>
            </div>
            {isMobile ? (
              <div>
                {sales.map(sa=>(
                  <div key={sa.id} style={{...mCard,opacity:sa.refunded?.6:1,background:sa.refunded?'var(--amber-a)':'var(--surface)'}}>
                    <div style={mRow}>
                      <div style={{flex:1,paddingRight:8}}>
                        <div style={{fontWeight:600,fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{sa.itemName}{sa.refunded?' (refunded)':''}{sa.bundleId?' 📦':''}</div>
                        <div style={mSub}>{sa.date} · qty {sa.qty||1}{sa.buyCost>0?' · cost '+fmt(sa.buyCost):''}</div>
                      </div>
                      <div style={{textAlign:'right',flexShrink:0}}>
                        {(()=>{ const tp=sa.profit-(sa.buyCost||0)*(sa.qty||1); return <><div style={{fontSize:16,fontWeight:700,color:tp>=0?'var(--green)':'var(--red)'}}>{fmt(tp)}</div><div style={{fontSize:11,color:'var(--text-2)'}}>in: {fmt(moneyReceived(sa))}</div></>; })()}
                      </div>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--text-2)'}}>
                      <span>Sale: {fmt(sa.soldPrice)}</span>
                      {sa.postage>0&&<span>Post: -{fmt(sa.postage)}</span>}
                      <div style={S.acts}>
                        {!sa.refunded&&<IBtn onClick={()=>refundSale(sa)} title="Refund" col="var(--amber)">↩</IBtn>}
                        <IBtn onClick={()=>{if(confirm('Delete?'))setSales(p=>p.filter(x=>x.id!==sa.id));}} title="Delete" col="var(--red)">✕</IBtn>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
            <div style={S.tWrap}>
              <table style={S.tbl}>
                <thead><tr>
                  <th style={{...S.th,width:'22%'}}>Item</th>
                  <th style={{...S.th,width:'9%'}}>Date</th>
                  <th style={{...S.th,width:'5%',textAlign:'center'}}>Qty</th>
                  <th style={{...S.th,width:'10%',textAlign:'right'}}>Sale price</th>
                  <th style={{...S.th,width:'9%',textAlign:'right'}}>Money in</th>
                  <th style={{...S.th,width:'8%',textAlign:'right'}}>Postage</th>
                  <th style={{...S.th,width:'9%',textAlign:'right'}}>Item cost</th>
                  <th style={{...S.th,width:'9%',textAlign:'right'}}>True profit</th>
                  <th style={{...S.th,width:'11%'}}>Actions</th>
                </tr></thead>
                <tbody>
                  {sales.map((sa,i)=>(
                    <tr key={sa.id} style={{background:sa.refunded?'var(--amber-a)':i%2===0?'transparent':'var(--surface)',opacity:sa.refunded?.6:1}}>
                      <td style={S.td}><span style={{display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={sa.itemName}>{sa.itemName}{sa.refunded?' (refunded)':''}{sa.bundleId?' 📦':''}</span></td>
                      <td style={{...S.td,color:'var(--text-2)',fontSize:11}}>{sa.date}</td>
                      <td style={{...S.td,textAlign:'center',color:'var(--text-2)'}}>{sa.qty||1}</td>
                      <td style={{...S.td,textAlign:'right',color:'var(--text-2)'}}>{fmt(sa.soldPrice)}</td>
                      <td style={{...S.td,textAlign:'right',color:'var(--accent)',fontWeight:600}}>{fmt(moneyReceived(sa))}</td>
                      <td style={{...S.td,textAlign:'right',color:sa.postage>0?'var(--red)':'var(--text-2)',fontSize:11}}>{sa.postage>0?'−'+fmt(sa.postage):'—'}</td>
                      <td style={{...S.td,textAlign:'right',color:sa.buyCost>0?'var(--red)':'var(--text-3)',fontSize:11}}>{sa.buyCost>0?'−'+fmt(sa.buyCost*(sa.qty||1)):'—'}</td>
                      <td style={{...S.td,textAlign:'right',fontWeight:700}}>{(()=>{const tp=sa.profit-(sa.buyCost||0)*(sa.qty||1);return <span style={{color:tp>=0?'var(--green)':'var(--red)'}}>{fmt(tp)}</span>;})()}</td>
                      <td style={S.td}><div style={S.acts}>
                        {!sa.refunded&&<IBtn onClick={()=>refundSale(sa)} title="Refund & restore to inventory" col="var(--amber)">↩</IBtn>}
                        <IBtn onClick={()=>{if(confirm('Delete this sale record?'))setSales(p=>p.filter(x=>x.id!==sa.id));}} title="Delete" col="var(--red)">✕</IBtn>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
          </>;
        })()}

        {/* P&L */}
        {tab==='pnl'&&(()=>{
          if(monthlyPL.length===0) return <div style={S.empty}><div style={{fontSize:32,marginBottom:8}}>📊</div>No data yet.<br/>Log sales and business spend to see your monthly P&L.</div>;
          return <>
            <div style={S.tWrap}>
              <table style={{...S.tbl,tableLayout:'auto'}}>
                <thead><tr>
                  {['Month','Revenue','eBay fees','Postage out','Stock spend','Other costs','Refunds','Gross profit','Net profit'].map(h=>(
                    <th key={h} style={{...S.th,textAlign:h==='Month'?'left':'right'}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {monthlyPL.map((r,i)=>(
                    <tr key={r.key} style={{background:i%2===0?'transparent':'var(--surface)'}}>
                      <td style={{...S.td,fontWeight:500}}>{r.label}</td>
                      <td style={{...S.td,textAlign:'right',color:'var(--accent)'}}>{fmt(r.revenue)}</td>
                      <td style={{...S.td,textAlign:'right',color:'var(--red)',fontSize:11}}>−{fmt(r.fees)}</td>
                      <td style={{...S.td,textAlign:'right',color:'var(--red)',fontSize:11}}>−{fmt(r.postage)}</td>
                      <td style={{...S.td,textAlign:'right',color:'var(--red)',fontSize:11}}>−{fmt(r.stockSpend)}</td>
                      <td style={{...S.td,textAlign:'right',color:'var(--red)',fontSize:11}}>−{fmt(r.postageEquip+r.supplies)}</td>
                      <td style={{...S.td,textAlign:'right',color:'#a371f7',fontSize:11}}>{(r.refunds||0)>0?'−'+fmt(r.refunds||0):'—'}</td>
                      <td style={{...S.td,textAlign:'right',fontWeight:600,color:r.profit>=0?'var(--green)':'var(--red)'}}>{fmt(r.profit)}</td>
                      <td style={{...S.td,textAlign:'right',fontWeight:700,color:r.netProfit>=0?'var(--green)':'var(--red)'}}>{fmt(r.netProfit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{fontSize:11,color:'var(--text-3)',marginTop:8}}>Gross profit = revenue minus eBay fees and postage. Net profit = gross minus all business costs (stock, equipment, supplies).</div>
          </>;
        })()}

      </div>
      </div>

      {/* MODALS */}

      {/* Settings */}
      {showCfg&&<SettingsModal cfg={cfgForm} onChange={setCfgForm} onSave={saveCfg} onClose={()=>setShowCfg(false)} feeLabel={feeLabel} effectiveFeeRate={effectiveFeeRate} salesCount={activeSales(sales).length}/>}

      {/* Add category */}
      {showAddCat&&<Modal title="New category" onClose={()=>setShowAddCat(false)}>
        <p style={{fontSize:12,color:'var(--text-2)',marginBottom:12}}>You can include an emoji at the start (e.g. 🎮 Yu-Gi-Oh).</p>
        <div style={S.field}><label style={S.fLbl}>Category name</label><input style={S.fInp} type="text" value={newCatName} onChange={e=>setNewCatName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addCat()} placeholder="e.g. Trainers, Vintage Tech…" autoFocus/></div>
        <div style={S.mActs}><button style={S.mBtn} onClick={()=>setShowAddCat(false)}>Cancel</button><button style={S.mBtnP} onClick={addCat}>Create</button></div>
      </Modal>}

      {/* Add item */}
      {showAddItem&&(()=>{
        const deadZone=isListingDeadZone(addPrice);
        return <Modal title={`Add item — ${cats.find(c=>c.id===curInvCat)?.name||''}`} onClose={()=>setShowAddItem(false)}>
          {deadZone&&<div style={{...S.note,marginBottom:12}}><span>⚠️</span><span>Prices between <strong>£10</strong> and <strong>£12.30</strong> often earn less after postage. Consider pricing below £10 or above £12.30.</span></div>}
          <div style={S.field}><label style={S.fLbl}>Item name</label><input style={S.fInp} type="text" value={addName} onChange={e=>setAddName(e.target.value)} placeholder="Item name" autoFocus/></div>
          <div style={S.field}><label style={S.fLbl}>How many copies?</label><input style={S.fInp} type="number" min="1" step="1" value={addQty} onChange={e=>setAddQty(e.target.value)} placeholder="1"/></div>
          <div style={S.field}><label style={S.fLbl}>Price ({sym}){parseInt(addQty,10)>1?' — per item':''}</label><input style={S.fInp} type="number" step="0.01" min="0" value={addPrice} onChange={e=>setAddPrice(e.target.value)} placeholder="0.00"/></div>
          <div style={S.field}><label style={S.fLbl}>Item cost ({sym}) — optional</label><input style={S.fInp} type="number" step="0.01" min="0" value={addBuyCost} onChange={e=>setAddBuyCost(e.target.value)} placeholder="What did you pay for this?"/><div style={{fontSize:11,color:'var(--text-3)',marginTop:3}}>Shown alongside each item to track per-item profit. Not added to overall business costs.</div></div>
          <div style={S.field}>
            <label style={S.fLbl}>Condition — optional</label>
            <select style={S.fInp} value={addCondition} onChange={e=>setAddCondition(e.target.value)}>
              <option value="">Select condition…</option>
              {EBAY_CONDITIONS.map(g=>(
                <optgroup key={g.group} label={g.group}>
                  {g.items.map(c=><option key={c} value={c}>{c}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div style={S.field}>
            <label style={S.fLbl}>eBay category — optional</label>
            <select style={S.fInp} value={addEbayCategory} onChange={e=>setAddEbayCategory(e.target.value)}>
              <option value="">Select eBay category…</option>
              {EBAY_CATEGORIES.map(g=>(
                <optgroup key={g.group} label={g.group}>
                  {g.items.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
              ))}
            </select>
            <div style={{fontSize:11,color:'var(--text-3)',marginTop:3}}>Used to pre-fill the category when listing on eBay.</div>
          </div>
          <div style={S.mActs}>
              <div style={{...S.field,flex:'1 1 100%'}}>
                <label style={S.fLbl}>Photos — optional (needed for eBay listing)</label>
                <PhotoUpload photos={addPhotos} onChange={setAddPhotos}/>
              </div>
            </div>
            <div style={S.mActs}><button style={S.mBtn} onClick={()=>setShowAddItem(false)}>Cancel</button><button style={S.mBtnP} onClick={tryAddItem}>Add item</button></div>
        </Modal>;
      })()}

      {/* Duplicate prompt */}
      {dupPrompt&&<Modal title="Item already in stock" onClose={()=>setDupPrompt(null)}>
        <p style={{fontSize:12,color:'var(--text-2)',marginBottom:12,lineHeight:1.5}}>
          <strong style={{color:'var(--text-1)'}}>{dupPrompt.dup.name}</strong> is already in inventory (qty {iq(dupPrompt.dup)}).
          Add {dupPrompt.qty} more to that line, or keep a separate entry?
        </p>
        <div style={S.mActs}>
          <button style={S.mBtn} onClick={()=>setDupPrompt(null)}>Cancel</button>
          <button style={S.mBtn} onClick={()=>doAddItem(dupPrompt.name,dupPrompt.price,dupPrompt.qty,dupPrompt.catId,null,dupPrompt.buyCost||0,dupPrompt.condition||'',dupPrompt.ebayCategory||'')}>Separate entry</button>
          <button style={S.mBtnP} onClick={()=>doAddItem(dupPrompt.name,dupPrompt.price,dupPrompt.qty,dupPrompt.catId,dupPrompt.dup.id,dupPrompt.buyCost||0)}>Add to existing (+{dupPrompt.qty})</button>
        </div>
      </Modal>}

      {/* Log sale */}
      {sellItem&&<Modal title="Log eBay sale" onClose={()=>{setSellItem(null);setSellQtyIn('1');}}>
        <p style={{fontSize:12,color:'var(--text-2)',marginBottom:14,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={sellItem.name}>{sellItem.name}{iq(sellItem)>1?` · ${iq(sellItem)} in stock`:''}</p>
        {iq(sellItem)>1&&<div style={S.field}><label style={S.fLbl}>How many sold?</label><input style={S.fInp} type="number" min="1" max={iq(sellItem)} step="1" value={sellQtyIn} onChange={e=>setSellQtyIn(e.target.value)}/></div>}
        <div style={S.field}><label style={S.fLbl}>Money received to your account ({sym}) *</label><input style={S.fInp} type="number" step="0.01" min="0" value={moneyInP} onChange={e=>setMoneyInP(e.target.value)} placeholder="Check PayPal or bank — exact amount" autoFocus/></div>
        <div style={S.field}><label style={S.fLbl}>eBay sale price ({sym}) *</label><input style={S.fInp} type="number" step="0.01" min="0" value={soldP} onChange={e=>setSoldP(e.target.value)} placeholder="What it sold for on the listing"/></div>
        <div style={S.field}><label style={S.fLbl}>Postage you paid ({sym})</label><input style={S.fInp} type="number" step="0.01" min="0" value={postageP} onChange={e=>setPostageP(e.target.value)} placeholder="0.00"/></div>
        {(spNum>0||miNum>0)&&<div style={{background:'var(--surface-2)',borderRadius:6,padding:'10px 12px',fontSize:12}}>
          {spNum>0&&<div style={{display:'flex',justifyContent:'space-between',padding:'3px 0',color:'var(--text-2)'}}><span>Sale price</span><span style={{color:'var(--text-1)'}}>{fmt(spNum)}</span></div>}
          {spNum>0&&miNum>0&&<div style={{display:'flex',justifyContent:'space-between',padding:'3px 0',color:'var(--text-2)'}}><span>eBay fees (sale − received)</span><span style={{color:'var(--red)'}}>−{fmt(ebayFeesCalc)}</span></div>}
          {miNum>0&&<div style={{display:'flex',justifyContent:'space-between',padding:'3px 0',fontWeight:600,color:'var(--text-2)'}}><span>Money received</span><span style={{color:'var(--accent)'}}>{fmt(miNum)}</span></div>}
          {poNum>0&&<div style={{display:'flex',justifyContent:'space-between',padding:'3px 0',color:'var(--text-2)'}}><span>Postage paid</span><span style={{color:'var(--red)'}}>−{fmt(poNum)}</span></div>}
          {(sellItem?.buyCost>0)&&<div style={{display:'flex',justifyContent:'space-between',padding:'3px 0',color:'var(--text-2)'}}><span>Item cost (×{sellQtyNum})</span><span style={{color:'var(--red)'}}>−{fmt((sellItem.buyCost||0)*sellQtyNum)}</span></div>}
          {miNum>0&&(()=>{const tp=sellProfit-(sellItem?.buyCost||0)*sellQtyNum;return <div style={{display:'flex',justifyContent:'space-between',padding:'6px 0 3px',borderTop:'1px solid var(--border)',marginTop:4,fontWeight:700,fontSize:13}}><span>True profit</span><span style={{color:tp>=0?'var(--green)':'var(--red)'}}>{fmt(tp)}</span></div>;})()}
        </div>}
        <div style={S.mActs}><button style={S.mBtn} onClick={()=>setSellItem(null)}>Cancel</button><button style={S.mBtnP} onClick={confirmSell}>Log sale</button></div>
      </Modal>}

      {/* Bundle sell */}
      {bundleSell&&(()=>{
        const lines=bundleSell.map(r=>({sp:parseFloat(r.soldPrice)||0,mi:parseFloat(r.moneyIn)||0}));
        const tSp=+lines.reduce((a,l)=>a+l.sp,0).toFixed(2);
        const tMi=+lines.reduce((a,l)=>a+l.mi,0).toFixed(2);
        const tFees=+lines.reduce((a,l)=>a+feesFromInputs(l.sp,l.mi),0).toFixed(2);
        const tPost=parseFloat(bundlePost)||0;
        const savings=bundlePostageSavings(bundleSell.length,tPost);
        const tProfit=+(tMi-tPost).toFixed(2);
        return <Modal title={`Bundle sale — ${bundleSell.length} items`} wide onClose={()=>{setBundleSell(null);setBundlePost('');setLstSel([]);}}>
          <p style={{fontSize:12,color:'var(--text-2)',marginBottom:12}}>Enter each item's sale price and money received. Postage is split proportionally.</p>
          {bundleSell.map((row,idx)=>(
            <div key={row.item.id} style={S.bundleLine}>
              <div style={{fontSize:12,fontWeight:600,marginBottom:8,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={row.item.name}>{row.item.name}</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                <div style={S.field}><label style={{...S.fLbl,fontSize:11}}>Money to account ({sym}) *</label><input style={{...S.fInp,padding:'5px 8px'}} type="number" step="0.01" min="0" value={row.moneyIn} onChange={e=>setBundleSell(p=>p.map((r2,i)=>i===idx?{...r2,moneyIn:e.target.value}:r2))} placeholder="0.00"/></div>
                <div style={S.field}><label style={{...S.fLbl,fontSize:11}}>eBay sale price ({sym}) *</label><input style={{...S.fInp,padding:'5px 8px'}} type="number" step="0.01" min="0" value={row.soldPrice} onChange={e=>setBundleSell(p=>p.map((r2,i)=>i===idx?{...r2,soldPrice:e.target.value}:r2))} placeholder="0.00"/></div>
              </div>
              {lines[idx].sp>0&&lines[idx].mi>0&&<div style={{fontSize:11,color:'var(--text-2)',marginTop:4}}>Fees: {fmt(feesFromInputs(lines[idx].sp,lines[idx].mi))}</div>}
            </div>
          ))}
          <div style={S.field}><label style={S.fLbl}>Total postage for whole bundle ({sym})</label><input style={S.fInp} type="number" step="0.01" min="0" value={bundlePost} onChange={e=>setBundlePost(e.target.value)} placeholder="One label — split across items"/></div>
          {(tMi>0||tPost>0)&&<div style={{background:'var(--surface-2)',borderRadius:6,padding:'10px 12px',fontSize:12}}>
            {[[`Total sale price`,fmt(tSp),null],[`Total received`,fmt(tMi),'var(--accent)'],[`Total fees`,`−${fmt(tFees)}`,'var(--red)'],[`Bundle postage`,`−${fmt(tPost)}`,'var(--red)'],savings>0?[`Postage saved vs separate`,fmt(savings),'var(--green)']:null].filter(Boolean).map(([l,v,c])=>(
              <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'3px 0',color:'var(--text-2)'}}><span>{l}</span><span style={c?{color:c}:{}}>{v}</span></div>
            ))}
            {tMi>0&&<div style={{display:'flex',justifyContent:'space-between',padding:'6px 0 3px',borderTop:'1px solid var(--border)',marginTop:4,fontWeight:700,fontSize:13}}><span>Total profit</span><span style={{color:tProfit>=0?'var(--green)':'var(--red)'}}>{fmt(tProfit)}</span></div>}
          </div>}
          <div style={S.mActs}><button style={S.mBtn} onClick={()=>{setBundleSell(null);setBundlePost('');setLstSel([]);}}>Cancel</button><button style={S.mBtnP} onClick={confirmBundleSell}>Log bundle sale</button></div>
        </Modal>;
      })()}

      {/* Log spend */}
      {showSpend&&<Modal title="Record business spend" onClose={()=>setShowSpend(false)}>
        <p style={{fontSize:12,color:'var(--text-2)',marginBottom:10}}>Stock {fmt(expenses.stock)} · Post equip {fmt(expenses.postage)} · Supplies {fmt(expenses.supplies)} · <strong>{fmt(expenses.all)}</strong> total</p>
        <div style={S.field}>
          <label style={S.fLbl}>Category</label>
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {EXPENSE_TYPES.map(({id,label,desc})=>(
              <button key={id} type="button" style={{...S.catTab,textAlign:'left',...(spendType===id?S.catTabA:{})}} onClick={()=>setSpendType(id)}>
                {label}<span style={{display:'block',fontSize:10,opacity:.75,fontWeight:400}}>{desc}</span>
              </button>
            ))}
          </div>
        </div>
        <div style={S.field}><label style={S.fLbl}>Amount ({sym})</label><input style={S.fInp} type="number" step="0.01" min="0" value={spendAmt} onChange={e=>setSpendAmt(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addSpend()} placeholder="0.00" autoFocus/></div>
        <div style={S.field}><label style={S.fLbl}>Note (optional)</label><input style={S.fInp} type="text" value={spendNote} onChange={e=>setSpendNote(e.target.value)} placeholder={spendType==='stock'?'e.g. Bundle purchase':spendType==='postage'?'e.g. Label printer':'e.g. Packaging materials'}/></div>
        <div style={S.mActs}><button style={S.mBtn} onClick={()=>setShowSpend(false)}>Cancel</button><button style={S.mBtnP} onClick={addSpend}>Add</button></div>
        {purchases.length>0&&<>
          <div style={{...S.cH,marginTop:16}}>Spend log</div>
          <div style={{maxHeight:200,overflowY:'auto',border:'1px solid var(--border)',borderRadius:6}}>
            <table style={{...S.tbl,tableLayout:'auto'}}>
              <thead><tr>{['Date','Type','Note','Amount',''].map(h=><th key={h} style={{...S.th,fontSize:10}}>{h}</th>)}</tr></thead>
              <tbody>{purchases.map(p=>(
                <tr key={p.id}>
                  <td style={{...S.td,fontSize:11,color:'var(--text-2)'}}>{p.date}</td>
                  <td style={{...S.td,fontSize:10,color:'var(--text-2)'}}>{expenseShort(p.type)}</td>
                  <td style={{...S.td,fontSize:11}}>{p.note||'—'}</td>
                  <td style={{...S.td,textAlign:'right',fontWeight:600,color:'var(--red)'}}>{fmt(p.amount)}</td>
                  <td style={S.td}><IBtn onClick={()=>{if(confirm('Delete?'))setPurchases(p2=>p2.filter(x=>x.id!==p.id));}} title="Delete" col="var(--red)">✕</IBtn></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>}
        {spendType==='stock'&&<div style={{borderTop:'1px solid var(--border)',marginTop:16,paddingTop:14}}>
          <div style={S.field}><label style={S.fLbl}>Or: set stock total to ({sym})</label><input style={S.fInp} type="number" step="0.01" min="0" value={spendSetTotal} onChange={e=>setSpendSetTotal(e.target.value)} onKeyDown={e=>e.key==='Enter'&&setStockTotal()} placeholder="0.00"/></div>
          <div style={{...S.mActs,marginTop:8}}><button style={{...S.mBtn,fontSize:12}} onClick={setStockTotal}>Replace all stock entries</button></div>
          <p style={{fontSize:11,color:'var(--text-3)',marginTop:8}}>Removes all existing stock entries and replaces with a single total. Keeps other expense types.</p>
        </div>}
      </Modal>}

      {/* ITEM DETAIL */}
      {detailItem&&(
        <ItemDetailModal
          item={detailItem}
          cats={cats}
          sym={sym}
          cfg={cfg}
          calcFees={calcFees}
          onSave={saveDetailItem}
          onClose={()=>setDetailItem(null)}
          ebayConnected={ebayStatus?.connected}
          userId={userId}
          todayEnGB={todayEnGB}
          returnPolicy={cfg.returnPolicy}
          fulfillmentPolicyId={cfg.fulfillmentPolicyId||''}
          paymentPolicyId={cfg.paymentPolicyId||''}
          returnPolicyId={cfg.returnPolicyId||''}
          fulfillmentPolicies={ebayPolicies?.fulfillment||[]}
        />
      )}

      {/* MY ACCOUNT */}
      {showAccount&&(
        <Modal title="My Account" onClose={()=>setShowAccount(false)}>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div style={{background:'var(--surface-2)',borderRadius:8,padding:'12px 14px'}}>
              <div style={{fontSize:11,color:'var(--text-2)',marginBottom:3}}>Signed in as</div>
              <div style={{fontSize:14,fontWeight:500,color:'var(--text-1)'}}>{user?.primaryEmailAddress?.emailAddress||'—'}</div>
            </div>
            <div style={{background:'var(--surface-2)',borderRadius:8,padding:'12px 14px'}}>
              <div style={{fontSize:11,color:'var(--text-2)',marginBottom:3}}>Subscription status</div>
              <div style={{fontSize:14,fontWeight:600,color:subStatus==='active'?'var(--green)':subStatus==='cancelled'?'var(--amber)':'var(--red)'}}>
                {subStatus==='active'?'✅ Active':subStatus==='cancelled'?'⚠️ Cancelled — access until period ends':'❌ Expired'}
              </div>
            </div>
            {ebayMsg&&<div style={{background:ebayMsg.startsWith('✓')?'var(--green-a)':'var(--amber-a)',border:`1px solid ${ebayMsg.startsWith('✓')?'var(--green)':'var(--amber)'}`,borderRadius:6,padding:'8px 10px',fontSize:12,color:ebayMsg.startsWith('✓')?'var(--green)':'var(--amber)',marginBottom:4}}>{ebayMsg}</div>}
            {/* eBay Listing Setup — policies + location */}
            {ebayStatus?.connected&&(
              <div style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:8,padding:'14px'}}>
                <div style={{fontSize:12,fontWeight:600,marginBottom:8}}>eBay Listing Setup</div>

                {/* Setup instructions */}
                <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:6,padding:'10px 12px',fontSize:11,color:'var(--text-2)',marginBottom:10,lineHeight:1.8}}>
                  <div style={{color:'var(--text-1)',fontWeight:600,marginBottom:4}}>How to set up business policies on eBay:</div>
                  <div>1. Go to <a href="https://www.ebay.co.uk/bp/manage" target="_blank" rel="noreferrer" style={{color:'var(--blue)'}}>ebay.co.uk/bp/manage ↗</a> (sign in if prompted)</div>
                  <div>2. Create a <strong style={{color:'var(--text-1)'}}>Postage</strong> policy for each shipping tier you use (e.g. "2nd Class", "Signed For", "Tracked 48")</div>
                  <div>3. Also create one <strong style={{color:'var(--text-1)'}}>Payment</strong> and one <strong style={{color:'var(--text-1)'}}>Returns</strong> policy</div>
                  <div>4. Come back here and click <strong style={{color:'var(--text-1)'}}>↻ Refresh policies</strong> — all your policies will appear in the dropdowns below with the names you gave them</div>
                </div>

                <button style={{...S.mBtn,fontSize:11,padding:'4px 10px',marginBottom:10}} onClick={()=>{fetchEbayPolicies();fetchEbayLocation();}}>
                  ↻ Refresh policies
                </button>

                {/* Hint banners */}
                {ebayPolicies?.hint==='not_opted_in'&&(
                  <div style={{background:'var(--amber-a)',border:'1px solid var(--amber)',borderRadius:6,padding:'8px 10px',fontSize:11,color:'var(--amber)',marginBottom:8}}>
                    ⚠ No policies found. Follow the steps above to create them on eBay, then click ↻ Refresh policies.
                  </div>
                )}
                {ebayPolicies?.hint==='missing_scope'&&(
                  <div style={{background:'var(--amber-a)',border:'1px solid var(--amber)',borderRadius:6,padding:'8px 10px',fontSize:11,color:'var(--amber)',marginBottom:8}}>
                    ⚠ Permission denied. Please disconnect and reconnect your eBay account (we added new permissions since your last connection).
                  </div>
                )}
                {ebayPolicies?.hint==='error'&&(
                  <div style={{background:'var(--amber-a)',border:'1px solid var(--amber)',borderRadius:6,padding:'8px 10px',fontSize:11,color:'var(--amber)',marginBottom:8}}>
                    ⚠ Error fetching policies: {ebayPolicies.detail}
                  </div>
                )}

                {/* Policy selectors */}
                {ebayPolicies&&(
                  <div style={{display:'flex',flexDirection:'column',gap:8}}>
                    {[
                      {label:'Fulfillment (shipping) policy', cfgKey:'fulfillmentPolicyId', idKey:'fulfillmentPolicyId', items:ebayPolicies.fulfillment||[]},
                      {label:'Payment policy',                cfgKey:'paymentPolicyId',     idKey:'paymentPolicyId',     items:ebayPolicies.payment||[]},
                      {label:'Return policy',                 cfgKey:'returnPolicyId',      idKey:'returnPolicyId',      items:ebayPolicies.returns||[]},
                    ].map(({label,cfgKey,idKey,items})=>(
                      <div key={cfgKey} style={{display:'flex',flexDirection:'column',gap:3}}>
                        <label style={{fontSize:10,color:'var(--text-2)'}}>{label}</label>
                        {items.length===0
                           ? <div style={{fontSize:11,color:'var(--text-3)'}}>None found — follow the steps above to create one on eBay first.</div>
                          : <select style={{...S.fInp,fontSize:11}} value={cfg[cfgKey]||''} onChange={e=>setCfg(p=>({...p,[cfgKey]:e.target.value}))}>
                              <option value="">Select…</option>
                              {items.map(p=><option key={p[idKey]||p.name} value={p[idKey]||''}>{p.name}</option>)}
                            </select>
                        }
                      </div>
                    ))}

                    {/* Inventory location */}
                    <div style={{display:'flex',alignItems:'center',gap:8,marginTop:4,flexWrap:'wrap'}}>
                      <span style={{fontSize:11,color:'var(--text-2)'}}>Inventory location:</span>
                      {ebayLocation===null
                        ? <span style={{fontSize:11,color:'var(--text-2)'}}>Not checked</span>
                        : ebayLocation
                          ? <span style={{fontSize:11,color:'var(--green)'}}>✓ Set up</span>
                          : <button style={{...S.mBtn,fontSize:11,padding:'3px 8px',color:'var(--accent)',borderColor:'var(--accent)'}} onClick={createEbayLocation}>
                              + Create location (uses your postal code from Settings)
                            </button>
                      }
                    </div>

                    {/* Overall readiness */}
                    {(cfg.fulfillmentPolicyId&&cfg.paymentPolicyId&&cfg.returnPolicyId&&ebayLocation)
                      ? <div style={{fontSize:11,color:'var(--green)',marginTop:4}}>✓ Ready to publish listings</div>
                      : <div style={{fontSize:11,color:'var(--amber)',marginTop:4}}>
                          Select all three policies and create a location to enable listing
                        </div>
                    }
                  </div>
                )}
                {!ebayPolicies&&(
                  <div style={{fontSize:11,color:'var(--text-3)'}}>
                    Follow the steps above to create your policies on eBay, then click ↻ Refresh policies.
                  </div>
                )}
              </div>
            )}
            <div style={{background:'var(--surface-2)',borderRadius:8,padding:'12px 14px'}}>
              <div style={{fontSize:11,color:'var(--text-2)',marginBottom:6}}>eBay account</div>
              {ebayStatus?.connected
                ? <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:600,color:'var(--green)'}}>✓ Connected</div>
                      {ebayStatus.ebayUsername&&<div style={{fontSize:11,color:'var(--text-2)',marginTop:2}}>{ebayStatus.ebayUsername}</div>}
                    </div>
                    <button style={{...S.mBtn,fontSize:12,padding:'5px 10px'}} onClick={async()=>{
                      const r=await fetch(`/api/ebay/auth?action=url&userId=${encodeURIComponent(userId)}`).then(x=>x.json());
                      if(r.url) window.open(r.url,'ebay-oauth','width=600,height=700,scrollbars=yes');
                    }}>Reconnect</button>
                  </div>
                : <button style={{...S.addBtn,width:'100%',justifyContent:'center',padding:'9px'}} onClick={async()=>{
                    const r=await fetch(`/api/ebay/auth?action=url&userId=${encodeURIComponent(userId)}`).then(x=>x.json());
                    if(r.url) window.open(r.url,'ebay-oauth','width=600,height=700,scrollbars=yes');
                  }}>Connect eBay account</button>
              }
            </div>
            {ebayStatus?.connected&&(
              <div style={{background:'var(--surface-2)',borderRadius:8,padding:'12px 14px'}}>
                <div style={{fontSize:11,color:'var(--text-2)',marginBottom:6}}>Past sales</div>
                <div style={{fontSize:11,color:'var(--text-3)',marginBottom:8,lineHeight:1.5}}>
                  The regular sync only checks the last 90 days. Use this once to pull in older sales
                  that happened before you started using ResellerTrack — covers up to 2 years.
                </div>
                <button style={{...S.mBtn,width:'100%',justifyContent:'center',fontSize:12,padding:'8px'}}
                  onClick={importFullSalesHistory} disabled={ebaySyncState.loading}>
                  {ebaySyncState.loading?'⏳ Importing…':'📜 Import full sales history'}
                </button>
              </div>
            )}
            <button style={{...S.mBtn,textAlign:'center',width:'100%',padding:'10px'}} onClick={handleOpenPortal}>
              🔗 Manage or cancel subscription
            </button>
            <p style={{fontSize:11,color:'var(--text-3)',textAlign:'center'}}>Opens Lemon Squeezy — sign in with your email to manage your plan</p>
            <button style={{...S.mBtn,textAlign:'center',width:'100%',padding:'10px',color:'var(--red)',borderColor:'var(--red)'}}
              onClick={()=>{ setShowAccount(false); signOut(); }}>
              Sign out
            </button>
          </div>
        </Modal>
      )}

    </div>
  );
}

