import { useState, useCallback } from 'react';

const STORAGE_KEY = 'rt-dismissed-hints-v1';

const getDismissed = () => {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')); }
  catch { return new Set(); }
};
const dismiss = (id) => {
  try {
    const d = getDismissed();
    d.add(id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...d]));
  } catch {}
};

// ── Hint definitions per page ─────────────────────────────────────────────────
const PAGE_HINTS = {
  dashboard: [
    {
      id: 'dash-overview',
      icon: '📊',
      title: 'Your Dashboard',
      body: 'This is your command centre — key metrics, monthly P&L, revenue charts and recent activity are all here. Stats update live as you add items and log sales.',
    },
  ],
  inventory: [
    {
      id: 'inv-add-item',
      icon: '📦',
      title: 'Adding items',
      body: 'Click + Add Item (top right) to log any item you\'ve bought to resell. Fill in the name, what you paid for it (item cost), and the price you want to sell it for.',
    },
    {
      id: 'inv-categories',
      icon: '🗂️',
      title: 'Using categories',
      body: 'The tab bar shows your categories. Click + next to them to create a new one — organise by type (e.g. Pokémon Cards, Clothing, Electronics). Items can only belong to one category at a time.',
    },
    {
      id: 'inv-detail',
      icon: '🔍',
      title: 'Item details & eBay listing',
      body: 'Click any item name (highlighted in orange) to open the detail view. From there you can add photos, set an eBay category, fill in required listing fields and publish directly to eBay.',
    },
  ],
  listings: [
    {
      id: 'list-what',
      icon: '🏷️',
      title: 'Active Listings',
      body: 'Items appear here once you\'ve marked them as listed (or once eBay publishing succeeds). This is your live inventory — things you\'ve got for sale right now.',
    },
    {
      id: 'list-sync',
      icon: '🔄',
      title: 'Sync from eBay',
      body: 'Click ↻ Sync from eBay to automatically pull in recent sales. Matched items get moved to the Sales Log with real eBay fee data and the correct payout amount.',
    },
    {
      id: 'list-actions',
      icon: '✅',
      title: 'Marking as sold',
      body: 'Use the ✓ button on any item to log a manual sale, or push it back to inventory with the ← button. The 🗑️ button removes it entirely. Bundle multiple items into one sale using the 📦 Bundle Sale button.',
    },
  ],
  buying: [
    {
      id: 'buy-calc',
      icon: '🧮',
      title: 'Buy Calculator',
      body: 'Enter the price you\'re thinking of selling an item for and it\'ll work backwards — showing the maximum you should pay for it to hit your target profit margin after eBay fees and postage.',
    },
  ],
  sales: [
    {
      id: 'sales-log',
      icon: '💰',
      title: 'Sales Log',
      body: 'Every sale you log or sync from eBay appears here. Each entry shows sale price, eBay fees, your item cost, and true profit. Click any row to see the full breakdown or to refund/remove it.',
    },
  ],
  pnl: [
    {
      id: 'pnl-overview',
      icon: '📈',
      title: 'Profit & Loss',
      body: 'Monthly view of your revenue, eBay fees, expenses and net profit. The tax year summary at the top is useful for self-assessment. Refunded sales are excluded from totals.',
    },
  ],
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function PageHints({ tab }) {
  const [dismissed, setDismissed] = useState(() => getDismissed());

  const dismissHint = useCallback((id) => {
    dismiss(id);
    setDismissed(prev => new Set([...prev, id]));
  }, []);

  const hints = (PAGE_HINTS[tab] || []).filter(h => !dismissed.has(h.id));
  if (!hints.length) return null;

  return (
    <div className="rt-hint-wrap">
      {hints.map(h => (
        <div key={h.id} className="rt-hint">
          <span className="rt-hint-icon">{h.icon}</span>
          <div className="rt-hint-body">
            <div className="rt-hint-title">{h.title}</div>
            <div>{h.body}</div>
          </div>
          <button className="rt-hint-close" onClick={() => dismissHint(h.id)} title="Dismiss">✕</button>
        </div>
      ))}
    </div>
  );
}
