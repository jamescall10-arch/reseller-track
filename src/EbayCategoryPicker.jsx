import { useState, useEffect, useRef } from 'react';

const S = {
  inp:   { padding:'8px 10px', border:'1px solid #30363d', borderRadius:6, background:'#21262d', color:'#e6edf3', fontSize:13, fontFamily:'system-ui', width:'100%', boxSizing:'border-box' },
  btn:   { padding:'8px 12px', border:'1px solid #1f6feb', borderRadius:6, background:'#1f6feb', color:'#fff', cursor:'pointer', fontSize:13, fontFamily:'system-ui', whiteSpace:'nowrap', flexShrink:0 },
  btnSm: { padding:'5px 10px', border:'1px solid #30363d', borderRadius:6, background:'transparent', color:'#8b949e', cursor:'pointer', fontSize:11, fontFamily:'system-ui', whiteSpace:'nowrap', flexShrink:0 },
  row:   { display:'flex', gap:8, alignItems:'stretch' },
  sug:   { border:'1px solid #30363d', borderRadius:6, overflow:'hidden', marginTop:6 },
  hint:  { fontSize:11, color:'#6e7681', marginTop:4 },
};

export default function EbayCategoryPicker({ value, valuePath, onChange, userId, itemName, ebayConnected, onSpecificsLoaded }) {
  const [query, setQuery]             = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [showManual, setShowManual]   = useState(false);
  const [manualId, setManualId]       = useState('');
  const didAutoSuggest                = useRef(false);

  // Auto-suggest when modal opens using item name
  useEffect(() => {
    if (didAutoSuggest.current) return;
    if (itemName?.trim() && userId) {
      didAutoSuggest.current = true;
      setQuery(itemName);
      doSearch(itemName);
    }
  });

  const doSearch = async (q) => {
    const trimmed = q?.trim();
    if (!trimmed || !userId) return;
    setLoading(true); setError(''); setSuggestions([]);
    try {
      const res  = await fetch('/api/ebay/suggest-category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmed, userId }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSuggestions(data.suggestions || []);
      if (!data.suggestions?.length) setError('No suggestions found — try different keywords or enter the category ID manually below.');
    } catch(e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const selectCategory = async (id, path) => {
    onChange(id, path);
    setSuggestions([]);
    if (onSpecificsLoaded && userId) {
      try {
        const res  = await fetch(`/api/ebay/category-specifics?categoryId=${id}&userId=${encodeURIComponent(userId)}`);
        const data = await res.json();
        if (data.specifics) onSpecificsLoaded(data.specifics);
      } catch { /* ignore — specifics can be loaded manually */ }
    }
  };

  return (
    <div>
      {/* Selected category */}
      {value && valuePath?.length > 0 && (
        <div style={{ background:'#1a2f1a', border:'1px solid #238636', borderRadius:6, padding:'7px 12px', fontSize:12, marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:4 }}>
          <span style={{ color:'#3fb950' }}>✓ {valuePath.join(' › ')}</span>
          <span style={{ color:'#6e7681', fontSize:11 }}>ID: {value}</span>
        </div>
      )}
      {value && (!valuePath || !valuePath.length) && (
        <div style={{ background:'#1a2f1a', border:'1px solid #238636', borderRadius:6, padding:'7px 12px', fontSize:12, marginBottom:8, color:'#3fb950' }}>
          ✓ Category ID: {value} — search below to change
        </div>
      )}

      {/* Search row */}
      <div style={S.row}>
        <input
          style={S.inp}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && doSearch(query)}
          placeholder="Search eBay categories (e.g. Pokémon card, vintage watch)…"
        />
        <button style={loading ? {...S.btn, opacity:0.6, cursor:'not-allowed'} : S.btn} onClick={() => doSearch(query)} disabled={loading}>
          {loading ? '⏳' : '🔍'}
        </button>
      </div>
      <div style={S.hint}>
        eBay suggests categories based on your item name. Press Enter or click 🔍 to search.
        {' '}<span style={{ color:'#58a6ff', cursor:'pointer' }} onClick={() => setShowManual(p => !p)}>
          {showManual ? 'Hide manual entry' : 'Enter category ID manually'}
        </span>
      </div>

      {/* Manual ID entry */}
      {showManual && (
        <div style={{ display:'flex', gap:6, marginTop:8 }}>
          <input
            style={{ ...S.inp, maxWidth:160 }}
            value={manualId}
            onChange={e => setManualId(e.target.value)}
            placeholder="e.g. 183454"
          />
          <button style={S.btnSm} onClick={() => { if(manualId.trim()) selectCategory(manualId.trim(), ['Category ID: '+manualId.trim()]); }}>
            Use this ID
          </button>
          <a href="https://www.ebay.co.uk/b/bn_2316999" target="_blank" rel="noreferrer" style={{ fontSize:11, color:'#58a6ff', alignSelf:'center', whiteSpace:'nowrap' }}>
            Find ID on eBay ↗
          </a>
        </div>
      )}

      {error && !loading && <div style={{ color:'#d29922', fontSize:11, marginTop:6 }}>{error}</div>}

      {/* Suggestions list */}
      {suggestions.length > 0 && (
        <div style={S.sug}>
          {suggestions.map((s, i) => (
            <div
              key={s.categoryId}
              onClick={() => selectCategory(s.categoryId, s.path)}
              style={{
                padding:'9px 12px',
                cursor:'pointer',
                borderBottom: i < suggestions.length - 1 ? '1px solid #21262d' : 'none',
                background: value === s.categoryId ? '#1c2f4a' : 'transparent',
              }}
            >
              <div style={{ fontSize:13, fontWeight:600, color: value === s.categoryId ? '#58a6ff' : '#e6edf3' }}>
                {s.categoryName}
                {value === s.categoryId && <span style={{ marginLeft:6, color:'#3fb950', fontSize:11 }}>✓ selected</span>}
              </div>
              <div style={{ fontSize:11, color:'#6e7681', marginTop:2 }}>
                {s.path.slice(0, -1).join(' › ')}
              </div>
              {s.percentItemFound > 0 && (
                <div style={{ fontSize:10, color:'#8b949e', marginTop:1 }}>
                  {s.percentItemFound}% of similar items use this category
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!ebayConnected && (
        <div style={{ fontSize:11, color:'#d29922', marginTop:6 }}>
          ⚠ Connect eBay in My Account to use category search
        </div>
      )}
    </div>
  );
}
