const MONTHS = {
  Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,
  Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11,
};

export function parseEnGBDate(str) {
  if(!str) return null;
  const p = String(str).trim().split(/\s+/);
  if(p.length!==3) return null;
  const month = MONTHS[p[1]];
  if(month===undefined) return null;
  const year = 2000+parseInt(p[2],10);
  const day = parseInt(p[0],10);
  const d = new Date(year,month,day);
  return Number.isNaN(d.getTime())?null:d;
}

export function monthKey(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

export function formatMonthLabel(key){
  const [y,m] = key.split('-');
  const names=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${names[parseInt(m,10)-1]} ${y}`;
}

export function todayEnGB(){
  return new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'});
}

export function currentTaxYearBounds(now=new Date()){
  const tyYear = now.getMonth()>3||(now.getMonth()===3&&now.getDate()>=6)
    ? now.getFullYear() : now.getFullYear()-1;
  return {
    tyYear,
    tyStart:new Date(tyYear,3,6),
    tyEndExclusive:new Date(tyYear+1,3,6),
    tyLabel:`${tyYear}–${String(tyYear+1).slice(2)}`,
  };
}

export function isInTaxYear(date,tyStart,tyEndExclusive){
  return !!(date&&date>=tyStart&&date<tyEndExclusive);
}

export function dayKey(d){
  if(!d||Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const DAY_NAMES=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function formatDayLabel(key){
  const [,m,d] = key.split('-').map(Number);
  return `${d} ${DAY_NAMES[m-1]}`;
}

export function lastNDayKeys(n,now=new Date()){
  const keys=[];
  for(let i=n-1;i>=0;i--){
    const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()-i);
    keys.push(dayKey(d));
  }
  return keys;
}
