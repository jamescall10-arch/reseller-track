export const moneyReceived = s => s.moneyIn??s.afterFees??0;

export const feesFromInputs = (salePrice,received) =>
  salePrice>0&&received>0 ? Math.max(0,+(salePrice-received).toFixed(2)) : 0;

export const saleFees = s => {
  if(s.ebayFees!=null&&s.ebayFees>=0) return s.ebayFees;
  return feesFromInputs(s.soldPrice||0,moneyReceived(s));
};

export const saleFeePct = s => {
  const sp = s.soldPrice||0;
  if(sp<=0) return null;
  return +((saleFees(s)/sp)*100).toFixed(2);
};

export const priceTierIndex = (price) => {
  const p = price || 0;
  if (p >= 20) return 0;
  if (p >= 5) return 1;
  return 2;
};

export const FEE_TIER_LABELS = ['£20+', '£5–20', 'Under £5'];

export function computeFeeTierData(sales) {
  const buckets = [
    { tier: '£20+', pcts: [] },
    { tier: '£5–20', pcts: [] },
    { tier: 'Under £5', pcts: [] },
  ];
  (sales || []).filter(s => !s.refunded).forEach(s => {
    const pct = saleFeePct(s);
    if (pct == null) return;
    buckets[priceTierIndex(s.soldPrice)].pcts.push(pct);
  });
  return buckets.map(({ tier, pcts }) => ({
    tier,
    avgFeePct: pcts.length ? +(pcts.reduce((a, b) => a + b, 0) / pcts.length).toFixed(1) : 0,
    sales: pcts.length,
  }));
}
