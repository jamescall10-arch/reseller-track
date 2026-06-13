export const POSTAGE_PER_ITEM_IF_ALONE = 1;
export const LISTING_DEAD_ZONE_MIN = 10;
export const LISTING_DEAD_ZONE_MAX = 12.3;

export function isListingDeadZone(price){
  const p = parseFloat(price);
  return !Number.isNaN(p)&&p>=LISTING_DEAD_ZONE_MIN&&p<=LISTING_DEAD_ZONE_MAX;
}

export function bundlePostageSavings(itemCount,actualPostage){
  if(itemCount<2) return 0;
  return Math.max(0,+(itemCount*POSTAGE_PER_ITEM_IF_ALONE-actualPostage).toFixed(2));
}

export function splitPostageAcrossItems(totalPostage,soldPrices){
  const n = soldPrices.length;
  if(n===0) return [];
  const total = parseFloat(totalPostage)||0;
  if(n===1) return [+total.toFixed(2)];
  const sumSp = soldPrices.reduce((a,p)=>a+(p||0),0);
  let assigned = 0;
  return soldPrices.map((sp,i)=>{
    if(i===n-1) return +(total-assigned).toFixed(2);
    const share = sumSp>0 ? +(total*(sp/sumSp)).toFixed(2) : +(total/n).toFixed(2);
    assigned += share;
    return share;
  });
}

export function computeBundleStats(sales) {
  const logged = (sales || []).filter(s => !s.refunded && s.bundleId);
  const byBundle = new Map();
  logged.forEach(s => {
    if (!byBundle.has(s.bundleId)) {
      byBundle.set(s.bundleId, {
        id: s.bundleId,
        date: s.date,
        itemCount: s.bundleItemCount || 0,
        savings: s.bundleSavings || 0,
        postageTotal: s.bundlePostageTotal || 0,
        revenue: 0,
        profit: 0,
      });
    }
    const b = byBundle.get(s.bundleId);
    b.revenue += s.soldPrice || 0;
    b.profit += s.profit || 0;
  });
  const bundles = [...byBundle.values()].sort((a, b) => b.id - a.id);
  const bundleCount = bundles.length;
  const totalSavings = +bundles.reduce((a, b) => a + b.savings, 0).toFixed(2);
  const itemsInBundles = bundles.reduce((a, b) => a + b.itemCount, 0);
  const avgSavings = bundleCount > 0 ? +(totalSavings / bundleCount).toFixed(2) : 0;
  const recent = bundles.slice(0, 5);
  return { bundleCount, totalSavings, itemsInBundles, avgSavings, recent };
}
