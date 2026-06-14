import { useState, useEffect } from 'react';

const S = {
  inp:   { padding:'8px 10px', border:'1px solid #30363d', borderRadius:6, background:'#21262d', color:'#e6edf3', fontSize:13, fontFamily:'system-ui', width:'100%', boxSizing:'border-box' },
  btn:   { padding:'8px 12px', border:'1px solid #30363d', borderRadius:6, background:'transparent', color:'#e6edf3', cursor:'pointer', fontSize:13, fontFamily:'system-ui', whiteSpace:'nowrap', flexShrink:0 },
  btnP:  { padding:'8px 12px', border:'1px solid #1f6feb', borderRadius:6, background:'#1f6feb', color:'#fff', cursor:'pointer', fontSize:13, fontFamily:'system-ui', whiteSpace:'nowrap', flexShrink:0 },
  row:   { display:'flex', gap:8, alignItems:'stretch' },
  sel:   { padding:'8px 10px', border:'1px solid #30363d', borderRadius:6, background:'#21262d', color:'#e6edf3', fontSize:13, width:'100%', boxSizing:'border-box' },
  hint:  { fontSize:11, color:'#6e7681', marginTop:4 },
  note:  { background:'#1c2f4a', border:'1px solid #1f6feb', borderRadius:6, padding:'8px 12px', fontSize:12, color:'#58a6ff', marginBottom:8 },
  sug:   { border:'1px solid #30363d', borderRadius:6, overflow:'hidden', marginTop:6 },
  sugRow:(sel) => ({ padding:'9px 12px', cursor:'pointer', borderBottom:'1px solid #21262d', background: sel ? '#1c2f4a' : 'transparent', transition:'background 0.1s' }),
};

export default function EbayCategoryPicker({ value, valuePath, onChange, userId, itemName, ebayConnected, onSpecificsLoaded }) {
  const [mode, setMode]               = useState('suggest');
  const [query, setQuery]             = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');

  // Browse state — 3 levels deep
  const [l1Cats, setL1Cats]           = useState([]);
  const [l2Cats, setL2Cats]           = useState([]);
  const [l3Cats, setL3Cats]           = useState([]);
  const [selL1, setSelL1]             = useState('');
  const [selL2, setSelL2]             = useState('');
  const [selL3, setSelL3]             = useState('');
  const [browsing, setBrowsing]       = useState(false);

  // Auto-suggest when modal opens using item name
  useEffect(() => {
    if (itemName?.trim() && ebayConnected && userId) {
      setQuery(itemName);
      fetchSuggestions(itemName);
    }
  }, []); // eslint-disable-line

  const fetchSuggestions = async (q) => {
    if (!q?.trim() || !userId) return;
    setLoading(true); setError('');
    try {
      const res  = await fetch('/api/ebay/suggest-category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, userId }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSuggestions(data.suggestions || []);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const fetchChildren = async (parentId) => {
    setBrowsing(true);
    try {
      const res  = await fetch(`/api/ebay/category-tree?parentId=${parentId}&userId=${encodeURIComponent(userId)}`);
      const data = await res.json();
      return data.categories || [];
    } catch { return []; }
    finally { setBrowsing(false); }
  };

  const openBrowse = async () => {
    setMode('browse');
    if (!l1Cats.length) {
      const cats = await fetchChildren('0');
      setL1Cats(cats);
    }
  };

  const handleL1 = async (id) => {
    setSelL1(id); setSelL2(''); setSelL3('');
    setL2Cats([]); setL3Cats([]);
    if (!id) return;
    const cat = l1Cats.find(c => c.categoryId === id);
    if (cat?.isLeaf) { selectCategory(id, [cat.categoryName]); return; }
    const cats = await fetchChildren(id);
    setL2Cats(cats);
  };

  const handleL2 = async (id) => {
    setSelL2(id); setSelL3(''); setL3Cats([]);
    if (!id) return;
    const cat = l2Cats.find(c => c.categoryId === id);
    const l1  = l1Cats.find(c => c.categoryId === selL1);
    if (cat?.isLeaf) { selectCategory(id, [l1?.categoryName, cat.categoryName].filter(Boolean)); return; }
    const cats = await fetchChildren(id);
    setL3Cats(cats);
  };

  const handleL3 = (id) => {
    setSelL3(id);
    if (!id) return;
    const cat = l3Cats.find(c => c.categoryId === id);
    const l1  = l1Cats.find(c => c.categoryId === selL1);
    const l2  = l2Cats.find(c => c.categoryId === selL2);
    selectCategory(id, [l1?.categoryName, l2?.categoryName, cat?.categoryName].filter(Boolean));
  };

  const selectCategory = async (id, path) => {
    onChange(id, path);
    // Auto-fetch required item specifics for this category
    if (onSpecificsLoaded && userId) {
      try {
        const res  = await fetch(`/api/ebay/category-specifics?categoryId=${id}&userId=${encodeURIComponent(userId)}`);
        const data = await res.json();
        if (data.specifics) onSpecificsLoaded(data.specifics);
      } catch { /* ignore */ }
    }
  };

  return (
    <div>
      {/* Selected category display */}
      {value && valuePath && (
        <div style={{ background:'#1a2f1a', border:'1px solid #238636', borderRadius:6, padding:'7px 12px', fontSize:12, marginBottom:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ color:'#3fb950' }}>✓ {valuePath.join(' › ')}</span>
          <span style={{ color:'#6e7681', fontSize:11 }}>ID: {value}</span>
        </div>
      )}

      {mode === 'suggest' && (
        <>
          <div style={S.row}>
            <input
              style={S.inp}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchSuggestions(query)}
              placeholder="Search eBay categories by item name…"
            />
            <button style={loading ? {...S.btn, opacity:0.5} : S.btnP} onClick={() => fetchSuggestions(query)} disabled={loading}>
              {loading ? '⏳' : '🔍'}
            </button>
            <button style={S.btn} onClick={openBrowse}>Browse</button>
          </div>
          <div style={S.hint}>Press Enter or click 🔍 to search. eBay will suggest the best matching categories.</div>

          {error && <div style={{ color:'#f85149', fontSize:12, marginTop:6 }}>{error}</div>}

          {suggestions.length > 0 && (
            <div style={S.sug}>
              {suggestions.map((s, i) => (
                <div
                  key={s.categoryId}
                  onClick={() => selectCategory(s.categoryId, s.path)}
                  style={{
                    ...S.sugRow(value === s.categoryId),
                    borderBottom: i < suggestions.length - 1 ? '1px solid #21262d' : 'none',
                  }}
                >
                  <div style={{ fontSize:13, fontWeight:600, color: value === s.categoryId ? '#58a6ff' : '#e6edf3' }}>
                    {s.categoryName}
                    {value === s.categoryId && <span style={{ marginLeft:6, color:'#3fb950', fontSize:11 }}>✓ selected</span>}
                  </div>
                  <div style={{ fontSize:11, color:'#6e7681', marginTop:2 }}>{s.path.slice(0, -1).join(' › ')}</div>
                  {s.percentItemFound > 0 && (
                    <div style={{ fontSize:10, color:'#8b949e', marginTop:2 }}>{s.percentItemFound}% of similar items listed here</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {mode === 'browse' && (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {browsing && <div style={{ fontSize:11, color:'#8b949e' }}>⏳ Loading categories…</div>}

          <select style={S.sel} value={selL1} onChange={e => handleL1(e.target.value)}>
            <option value="">Select top-level category…</option>
            {l1Cats.map(c => <option key={c.categoryId} value={c.categoryId}>{c.categoryName}{c.isLeaf ? '' : ' ▶'}</option>)}
          </select>

          {l2Cats.length > 0 && (
            <select style={S.sel} value={selL2} onChange={e => handleL2(e.target.value)}>
              <option value="">Select subcategory…</option>
              {l2Cats.map(c => <option key={c.categoryId} value={c.categoryId}>{c.categoryName}{c.isLeaf ? '' : ' ▶'}</option>)}
            </select>
          )}

          {l3Cats.length > 0 && (
            <select style={S.sel} value={selL3} onChange={e => handleL3(e.target.value)}>
              <option value="">Select subcategory…</option>
              {l3Cats.map(c => <option key={c.categoryId} value={c.categoryId}>{c.categoryName}</option>)}
            </select>
          )}

          <div style={{ display:'flex', gap:8 }}>
            <button style={{ ...S.btn, fontSize:11, padding:'5px 10px' }} onClick={() => setMode('suggest')}>← Back to search</button>
          </div>
        </div>
      )}

      {!ebayConnected && (
        <div style={{ fontSize:11, color:'#d29922', marginTop:6 }}>⚠ Connect your eBay account in My Account to use the category picker</div>
      )}
    </div>
  );
}
