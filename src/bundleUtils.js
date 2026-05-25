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
