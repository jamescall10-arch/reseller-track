import { parseEnGBDate, dayKey, monthKey, formatMonthLabel, formatDayLabel, lastNDayKeys } from './dateUtils.js';

export const NET_TRACK_RANGES = [
  { id:'week',  label:'Last week',     days:7,        granularity:'day' },
  { id:'month', label:'Last month',    days:30,       granularity:'day' },
  { id:'year',  label:'Last year',     days:365,      granularity:'week' },
  { id:'5y',    label:'Last 5 years',  days:365*5,    granularity:'month' },
  { id:'10y',   label:'Last 10 years', days:365*10,   granularity:'month' },
];

function startOfDay(d){ return new Date(d.getFullYear(),d.getMonth(),d.getDate()); }
function parseDayKey(key){ const [y,m,d]=key.split('-').map(Number); return new Date(y,m-1,d); }

function iterateDays(from,to){
  const days=[]; const cur=startOfDay(from); const end=startOfDay(to);
  while(cur<=end){ days.push(new Date(cur)); cur.setDate(cur.getDate()+1); }
  return days;
}

function weekStartKey(d){
  const s=startOfDay(d); s.setDate(s.getDate()-s.getDay());
  return dayKey(s);
}

function buildDailyDeltas(sales,purchases){
  const map=new Map();
  const add=(dateStr,delta)=>{
    const k=dayKey(parseEnGBDate(dateStr));
    if(!k) return;
    map.set(k,+((map.get(k)||0)+delta).toFixed(2));
  };
  (sales||[]).filter(s=>!s.refunded).forEach(s=>add(s.date,s.profit||0));
  (purchases||[]).forEach(p=>add(p.date,-(p.amount||0)));
  return map;
}

function buildDailyCumulative(dailyDelta,from,to){
  const map=new Map(); let cumulative=0;
  iterateDays(from,to).forEach(d=>{
    const k=dayKey(d);
    cumulative+=dailyDelta.get(k)||0;
    cumulative=+cumulative.toFixed(2);
    map.set(k,cumulative);
  });
  return map;
}

function weeksInRange(windowStart,today){
  const keys=[]; const seen=new Set();
  iterateDays(windowStart,today).forEach(d=>{
    const wk=weekStartKey(d);
    if(!seen.has(wk)){ seen.add(wk); keys.push(wk); }
  });
  return keys;
}

function monthsInRange(windowStart,today){
  const keys=[]; const cur=new Date(windowStart.getFullYear(),windowStart.getMonth(),1);
  const end=new Date(today.getFullYear(),today.getMonth(),1);
  while(cur<=end){ keys.push(monthKey(cur)); cur.setMonth(cur.getMonth()+1); }
  return keys;
}

function lastDayOfMonth(mk){ const [y,m]=mk.split('-').map(Number); return new Date(y,m,0); }
function lastDayOfWeek(wk){ const d=parseDayKey(wk); d.setDate(d.getDate()+6); return d; }

export function buildNetTrackerSeries(sales,purchases,rangeId,now=new Date()){
  const range=NET_TRACK_RANGES.find(r=>r.id===rangeId)||NET_TRACK_RANGES[1];
  const today=startOfDay(now);
  const windowStart=new Date(today); windowStart.setDate(windowStart.getDate()-(range.days-1));
  const dailyDelta=buildDailyDeltas(sales,purchases);
  const deltaKeys=[...dailyDelta.keys()].sort();
  const firstActivity=deltaKeys.length?parseDayKey(deltaKeys[0]):windowStart;
  const walkStart=firstActivity<windowStart?firstActivity:windowStart;
  const dailyCumulative=buildDailyCumulative(dailyDelta,walkStart,today);
  const valueOnDay=d=>{
    const k=dayKey(d);
    if(dailyCumulative.has(k)) return dailyCumulative.get(k);
    let best=0; dailyCumulative.forEach((v,key)=>{ if(key<=k) best=v; });
    return best;
  };
  if(range.granularity==='day'){
    return lastNDayKeys(range.days,now).map(k=>({label:formatDayLabel(k),net:dailyCumulative.get(k)??valueOnDay(parseDayKey(k))}));
  }
  if(range.granularity==='week'){
    return weeksInRange(windowStart,today).map(wk=>{
      const end=lastDayOfWeek(wk); const endC=end>today?today:end;
      return { label:formatDayLabel(wk), net:valueOnDay(endC) };
    });
  }
  return monthsInRange(windowStart,today).map(mk=>{
    const end=lastDayOfMonth(mk); const endC=end>today?today:end;
    return { label:formatMonthLabel(mk), net:valueOnDay(endC) };
  });
}
