import { useState } from 'react';

const STEPS = [
  {
    id: 'welcome',
    emoji: '👋',
    title: 'Welcome to ResellerTrack!',
    sub: "Let's take a few minutes to get you set up. Every step is optional — you can always do this later from Settings or My Account.",
    action: null,
  },
  {
    id: 'ebay',
    emoji: '🛒',
    title: 'Connect your eBay account',
    sub: "Connecting eBay lets you publish listings directly from the app, auto-sync your sales, and track real eBay fees.\n\nYou'll be taken to eBay to sign in, then redirected back here automatically.",
    action: 'connect-ebay',
    actionLabel: 'Connect eBay',
  },
  {
    id: 'policies',
    emoji: '📋',
    title: 'Set up eBay business policies',
    sub: "eBay requires 3 policies to list items: a Postage policy, a Payment policy and a Returns policy.\n\n1. Go to ebay.co.uk and sign in\n2. Search \"business policies\" in eBay's search bar\n3. Create one of each policy type\n4. Come back and go to My Account → eBay Setup → Refresh policies to import them",
    action: null,
    note: "You can do this any time — without policies set up you can still track inventory and sales manually.",
  },
  {
    id: 'store',
    emoji: '🏪',
    title: 'Name your store',
    sub: 'Give your reselling business a name and set your currency. These appear on your dashboard and P&L reports.',
    action: 'store-form',
  },
  {
    id: 'done',
    emoji: '🎉',
    title: "You're all set!",
    sub: "Your account is ready to go. Start by adding items to your Inventory, or head to the Dashboard to see your overview.",
    action: null,
  },
];

export default function Onboarding({ userId, onComplete, onConnectEbay, onSaveStore }) {
  const [step,         setStep]         = useState(0);
  const [storeName,    setStoreName]    = useState('');
  const [currency,     setCurrency]     = useState('£');
  const [description,  setDescription]  = useState('');

  const current    = STEPS[step];
  const isLast     = step === STEPS.length - 1;
  const isStoreStep = current.action === 'store-form';

  const next = () => {
    if (step === STEPS.length - 1) {
      onComplete({ storeName, currency, description });
    } else {
      setStep(s => s + 1);
    }
  };

  const skip = () => {
    if (isLast) {
      onComplete({ storeName, currency, description });
    } else {
      setStep(s => s + 1);
    }
  };

  return (
    <div className="rt-modal-backdrop" style={{ zIndex: 2000 }}>
      <div className="rt-modal-box" style={{ maxWidth: 540 }}>
        {/* Progress bar */}
        <div className="rt-ob-progress">
          {STEPS.map((s, i) => (
            <div key={s.id} className={`rt-ob-step${i < step ? ' done' : i === step ? ' active' : ''}`} />
          ))}
        </div>

        {/* Content */}
        <span className="rt-ob-emoji">{current.emoji}</span>
        <div className="rt-ob-heading">{current.title}</div>
        <div className="rt-ob-sub" style={{ whiteSpace: 'pre-line' }}>{current.sub}</div>

        {/* Note */}
        {current.note && (
          <div style={{ background: 'var(--amber-a)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--amber)', marginBottom: 16, lineHeight: 1.6 }}>
            💡 {current.note}
          </div>
        )}

        {/* Store form */}
        {isStoreStep && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="rt-field">
              <label className="rt-label">Store / business name</label>
              <input className="rt-input" value={storeName} onChange={e => setStoreName(e.target.value)} placeholder="e.g. My Card Shop" />
            </div>
            <div className="rt-field">
              <label className="rt-label">Currency symbol</label>
              <select className="rt-select" style={{ width: 120 }} value={currency} onChange={e => setCurrency(e.target.value)}>
                <option value="£">£ GBP</option>
                <option value="$">$ USD</option>
                <option value="€">€ EUR</option>
                <option value="A$">A$ AUD</option>
                <option value="C$">C$ CAD</option>
              </select>
            </div>
            <div className="rt-field">
              <label className="rt-label">Default listing description <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(optional)</span></label>
              <textarea className="rt-input" style={{ minHeight: 80, resize: 'vertical' }} value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Fast dispatch. Items securely packaged. Combined postage available." />
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>This appears in every eBay listing you create.</div>
            </div>
          </div>
        )}

        {/* eBay connect button */}
        {current.action === 'connect-ebay' && (
          <button className="rt-btn primary" style={{ marginBottom: 16 }} onClick={() => { onConnectEbay(); setStep(s => s + 1); }}>
            🛒 Connect eBay
          </button>
        )}

        {/* Actions */}
        <div className="rt-ob-actions">
          {!isLast
            ? <button className="rt-ob-skip" onClick={skip}>Skip this step →</button>
            : <span />
          }
          <button className="rt-btn primary" onClick={next}>
            {isLast ? '🚀 Go to Dashboard' : isStoreStep ? 'Save & Continue' : 'Next →'}
          </button>
        </div>

        {/* Step counter */}
        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: 'var(--text-3)' }}>
          Step {step + 1} of {STEPS.length}
        </div>
      </div>
    </div>
  );
}
