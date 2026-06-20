import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'rt-dismissed-hints-v1';

const getDismissed = () => {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')); }
  catch { return new Set(); }
};
const dismissStored = (id) => {
  try {
    const d = getDismissed();
    d.add(id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...d]));
  } catch {}
};

// ── Hint definitions per page — short, pointer-style tips ────────────────────
const PAGE_HINTS = {
  dashboard: [
    { id: 'dash-overview', icon: '📊', title: 'Your Dashboard', body: 'Live metrics, monthly P&L and charts. Updates as you add items and log sales.' },
  ],
  inventory: [
    { id: 'inv-add-item', icon: '📦', title: 'Add items here', body: 'Use the + Add Item button (top right) to log anything you\'ve bought to resell.' },
    { id: 'inv-categories', icon: '🗂️', title: 'Categories', body: 'The tabs above organise stock by type. Click + to create a new category.' },
    { id: 'inv-detail', icon: '🔍', title: 'Item details', body: 'Click an item name (in orange) to add photos, set eBay category and publish a listing.' },
  ],
  listings: [
    { id: 'list-sync', icon: '🔄', title: 'Sync from eBay', body: '↻ Sync from eBay pulls in recent sales automatically with real fee data.' },
    { id: 'list-actions', icon: '✅', title: 'Listing actions', body: '✓ logs a sale, ← sends back to inventory, 🗑️ removes it. Tick multiple for a bundle sale.' },
  ],
  buying: [
    { id: 'buy-calc', icon: '🧮', title: 'Buy Calculator', body: 'Enter what you could sell an item for — we\'ll show the max you should pay for it.' },
  ],
  sales: [
    { id: 'sales-log', icon: '💰', title: 'Sales Log', body: 'Every logged or synced sale appears here with fees and true profit. Click a row for details.' },
  ],
  pnl: [
    { id: 'pnl-overview', icon: '📈', title: 'Profit & Loss', body: 'Monthly revenue, fees, expenses and net profit — handy for tax records.' },
  ],
};

// ── Component — fixed-position, non-blocking corner overlay ──────────────────
export default function PageHints({ tab }) {
  const [dismissed, setDismissed] = useState(() => getDismissed());
  const [visible, setVisible]     = useState([]);

  useEffect(() => {
    const hints = (PAGE_HINTS[tab] || []).filter(h => !dismissed.has(h.id));
    setVisible(hints);
  }, [tab]); // eslint-disable-line

  const dismissHint = useCallback((id) => {
    dismissStored(id);
    setDismissed(prev => new Set([...prev, id]));
    setVisible(prev => prev.filter(h => h.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    visible.forEach(h => dismissStored(h.id));
    setDismissed(prev => new Set([...prev, ...visible.map(h => h.id)]));
    setVisible([]);
  }, [visible]);

  if (!visible.length) return null;

  return (
    <div className="rt-hint-overlay">
      {visible.map(h => (
        <div key={h.id} className="rt-hint">
          <span className="rt-hint-icon">{h.icon}</span>
          <div className="rt-hint-body">
            <div className="rt-hint-title">{h.title}</div>
            <div>{h.body}</div>
          </div>
          <button className="rt-hint-close" onClick={() => dismissHint(h.id)} title="Dismiss">✕</button>
        </div>
      ))}
      {visible.length > 1 && (
        <div className="rt-hint-dismiss-all">
          <button onClick={dismissAll}>Dismiss all</button>
        </div>
      )}
    </div>
  );
}
