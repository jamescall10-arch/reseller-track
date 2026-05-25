import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid, AreaChart, Area,
} from 'recharts';
import { parseEnGBDate, monthKey, currentTaxYearBounds, isInTaxYear, dayKey, formatDayLabel, lastNDayKeys } from './dateUtils.js';
import { saleFees, saleFeePct, moneyReceived } from './saleUtils.js';
import { NET_TRACK_RANGES, buildNetTrackerSeries } from './netTracker.js';

const fmt = (n,sym='£') => (n<0?'-':'')+sym+Math.abs(n).toFixed(2);
const iq = it => Math.max(1,Math.floor(Number(it?.qty))||1);
const activeSales = sales => (sales||[]).filter(s=>!s.refunded);

const COLORS = ['#58a6ff','#3fb950','#f0883e','#d29922','#f85149','#a371f7','#79c0ff'];

const card = { background:'#161b22', border:'1px solid #30363d', borderRadius:8, padding:'14px 16px' };
const tipStyle = { background:'#21262d', border:'1px solid #30363d', borderRadius:6, fontSize:12 };
const axisStyle = { fill:'#8b949e', fontSize:11 };
const gridStroke = '#21262d';

const rangeBtn = active => ({
  padding:'6px 12px', border:`1px solid ${active?'#1f6feb':'#30363d'}`,
  borderRadius:6, background:active?'#1f6feb':'transparent',
  color:active?'#e6edf3':'#8b949e', cursor:'pointer', fontSize:12, fontWeight:active?600:400,
});

export default function Dashboard({ stats, monthlyPL, expenses, sales, purchases, items, cats, sym='£' }){
  const logged = activeSales(sales);
  const [netRange,setNetRange] = useState('month');
  const thisMonthKey = monthKey(new Date());
  const thisMonth = useMemo(()=>{
    const row = monthlyPL.find(r=>r.key===thisMonthKey);
    return row||{revenue:0,profit:0,netProfit:0,businessCosts:0,sales:0};
  },[monthlyPL,thisMonthKey]);

  const last6Months = useMemo(()=>[...monthlyPL].slice(0,6).reverse().map(r=>({
    month:r.label.replace(/ \d{4}$/,''),
    revenue:+r.revenue.toFixed(2),
    profit:+r.profit.toFixed(2),
    net:+Number(r.netProfit).toFixed(2),
    stock:+r.stockSpend.toFixed(2),
    postEquip:+r.postageEquip.toFixed(2),
    supplies:+r.supplies.toFixed(2),
  })),[monthlyPL]);

  const expensePie = useMemo(()=>[
    { name:'Stock', value:expenses.stock, color:'#f85149' },
    { name:'Post equip', value:expenses.postage, color:'#f0883e' },
    { name:'Supplies', value:expenses.supplies, color:'#d29922' },
  ].filter(d=>d.value>0),[expenses]);

  const categoryPie = useMemo(()=>{
    const rows = cats.map(cat=>{
      const v = (items||[])
        .filter(it=>it.categoryId===cat.id&&(it.status==='stock'||it.status==='listed'))
        .reduce((s,it)=>s+it.price*iq(it),0);
      return { name:cat.name.slice(0,18), value:+v.toFixed(2) };
    });
    return rows.filter(d=>d.value>0).sort((a,b)=>b.value-a.value);
  },[items,cats]);

  const listValue = useMemo(()=>(items||[])
    .filter(it=>it.status==='stock'||it.status==='listed')
    .reduce((s,it)=>s+it.price*iq(it),0),[items]);

  const avgProfit = logged.length>0
    ? +(logged.reduce((a,s)=>a+s.profit,0)/logged.reduce((a,s)=>a+(s.qty||1),0)).toFixed(2) : 0;

  const trueNet = +(stats.profit-expenses.all).toFixed(2);

  const netTrackerSeries = useMemo(()=>buildNetTrackerSeries(sales,purchases,netRange),[sales,purchases,netRange]);
  const netEnd = netTrackerSeries.length?netTrackerSeries[netTrackerSeries.length-1].net:0;
  const netDelta = netTrackerSeries.length?+(netEnd-netTrackerSeries[0].net).toFixed(2):0;
  const activeRange = NET_TRACK_RANGES.find(r=>r.id===netRange)||NET_TRACK_RANGES[1];
  const hasNetData = logged.length>0||(purchases||[]).length>0;

  const taxYear = useMemo(()=>{
    const {tyStart,tyEndExclusive} = currentTaxYearBounds();
    const gross = +logged.filter(s=>isInTaxYear(parseEnGBDate(s.date),tyStart,tyEndExclusive))
      .reduce((a,s)=>a+(s.soldPrice||0),0).toFixed(2);
    return { gross, pct:Math.min(100,(gross/1000)*100) };
  },[logged]);

  const dailyKeys = useMemo(()=>lastNDayKeys(30),[]);

  const dailySales = useMemo(()=>{
    const map = new Map(dailyKeys.map(k=>[k,0]));
    logged.forEach(s=>{ const k=dayKey(parseEnGBDate(s.date)); if(k&&map.has(k)) map.set(k,map.get(k)+(s.soldPrice||0)); });
    return dailyKeys.map(key=>({ day:formatDayLabel(key), amount:+map.get(key).toFixed(2) }));
  },[logged,dailyKeys]);

  const dailyListings = useMemo(()=>{
    const map = new Map(dailyKeys.map(k=>[k,0]));
    (items||[]).forEach(it=>{ if(it.listedAt){ const k=dayKey(parseEnGBDate(it.listedAt)); if(k&&map.has(k)) map.set(k,map.get(k)+iq(it)); } });
    return dailyKeys.map(key=>({ day:formatDayLabel(key), copies:map.get(key) }));
  },[items,dailyKeys]);

  const hasDailySales = dailySales.some(d=>d.amount>0);
  const hasDailyListings = dailyListings.some(d=>d.copies>0);
  const stockVsListed = [
    { name:'In stock', copies:stats.stockCount, fill:'#58a6ff' },
    { name:'Listed',   copies:stats.listedCount, fill:'#f0883e' },
  ];

  const kpis = [
    { label:'Listed value',       value:fmt(listValue,sym), color:'#f0883e', sub:'Stock + active listings' },
    { label:'This month profit',  value:fmt(thisMonth.profit,sym), color:thisMonth.profit>=0?'#3fb950':'#f85149', sub:`${thisMonth.sales} items sold` },
    { label:'All-time sale profit',value:fmt(stats.profit,sym), color:'#3fb950', sub:`avg ${fmt(avgProfit,sym)}/item` },
    { label:'After all costs',    value:fmt(trueNet,sym), color:trueNet>=0?'#3fb950':'#f85149', sub:'Profit minus logged spend' },
  ];

  const Empty = ({children})=>(
    <div style={{height:180,display:'flex',alignItems:'center',justifyContent:'center',color:'#6e7681',fontSize:12}}>{children}</div>
  );

  return(
    <div>
      <p style={{fontSize:12,color:'#8b949e',margin:'0 0 12px'}}>Welcome to your reseller dashboard</p>

      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:14}}>
        {kpis.map(k=>(
          <div key={k.label} style={card}>
            <div style={{fontSize:11,color:'#8b949e',marginBottom:4}}>{k.label}</div>
            <div style={{fontSize:22,fontWeight:700,color:k.color,lineHeight:1.2}}>{k.value}</div>
            <div style={{fontSize:10,color:'#6e7681',marginTop:4}}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Net tracker */}
      <div style={{...card,marginBottom:14}}>
        <div style={{display:'flex',flexWrap:'wrap',alignItems:'flex-start',justifyContent:'space-between',gap:12,marginBottom:12}}>
          <div>
            <div style={{fontSize:15,fontWeight:600,marginBottom:4}}>After all costs</div>
            <div style={{fontSize:11,color:'#8b949e',maxWidth:420,lineHeight:1.5}}>
              Cumulative net from logged profits minus business spend — {activeRange.label.toLowerCase()}
            </div>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{fontSize:11,color:'#8b949e'}}>Current position</div>
            <div style={{fontSize:28,fontWeight:700,color:netEnd>=0?'#3fb950':'#f85149',lineHeight:1.1}}>{fmt(netEnd,sym)}</div>
            {netTrackerSeries.length>1&&(
              <div style={{fontSize:11,color:netDelta>=0?'#3fb950':'#f85149',marginTop:4}}>
                {netDelta>=0?'+':''}{fmt(netDelta,sym)} over period
              </div>
            )}
          </div>
        </div>
        <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:14}}>
          {NET_TRACK_RANGES.map(r=>(
            <button key={r.id} type="button" style={rangeBtn(netRange===r.id)} onClick={()=>setNetRange(r.id)}>{r.label}</button>
          ))}
        </div>
        {!hasNetData
          ? <Empty>Log sales and business spend to track your net position</Empty>
          : <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={netTrackerSeries} margin={{top:8,right:12,left:4,bottom:0}}>
                <defs>
                  <linearGradient id="netFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={netEnd>=0?'#3fb950':'#f85149'} stopOpacity={0.3}/>
                    <stop offset="100%" stopColor={netEnd>=0?'#3fb950':'#f85149'} stopOpacity={0.02}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke}/>
                <XAxis dataKey="label" tick={axisStyle} tickLine={false} interval="preserveStartEnd"/>
                <YAxis tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={v=>sym+v}/>
                <Tooltip contentStyle={tipStyle} formatter={v=>[fmt(v,sym),'Net']}/>
                <Area type="monotone" dataKey="net" stroke={netEnd>=0?'#3fb950':'#f85149'} fill="url(#netFill)" strokeWidth={2} dot={false}/>
              </AreaChart>
            </ResponsiveContainer>
        }
      </div>

      {/* Monthly P&L + Expenses */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
        <div style={card}>
          <div style={{fontSize:13,fontWeight:600,marginBottom:12}}>Monthly revenue vs profit</div>
          {last6Months.length===0
            ? <Empty>No sales yet</Empty>
            : <ResponsiveContainer width="100%" height={220}>
                <BarChart data={last6Months} margin={{top:4,right:8,left:0,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke}/>
                  <XAxis dataKey="month" tick={axisStyle} tickLine={false}/>
                  <YAxis tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={v=>sym+v}/>
                  <Tooltip contentStyle={tipStyle} formatter={v=>[fmt(v,sym)]}/>
                  <Legend wrapperStyle={{fontSize:11,color:'#8b949e'}}/>
                  <Bar dataKey="revenue" name="Revenue" fill="#58a6ff" radius={[3,3,0,0]}/>
                  <Bar dataKey="profit" name="Profit" fill="#3fb950" radius={[3,3,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
          }
        </div>
        <div style={card}>
          <div style={{fontSize:13,fontWeight:600,marginBottom:12}}>Expense breakdown</div>
          {expensePie.length===0
            ? <Empty>No expenses logged yet</Empty>
            : <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={expensePie} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                    {expensePie.map((e,i)=><Cell key={e.name} fill={e.color||COLORS[i%COLORS.length]}/>)}
                  </Pie>
                  <Tooltip contentStyle={tipStyle} formatter={v=>[fmt(v,sym)]}/>
                </PieChart>
              </ResponsiveContainer>
          }
        </div>
      </div>

      {/* Category value + Stock vs Listed */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
        <div style={card}>
          <div style={{fontSize:13,fontWeight:600,marginBottom:12}}>Inventory value by category</div>
          {categoryPie.length===0
            ? <Empty>Add items to see category breakdown</Empty>
            : <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={categoryPie} cx="50%" cy="50%" outerRadius={75} dataKey="value" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                    {categoryPie.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                  </Pie>
                  <Tooltip contentStyle={tipStyle} formatter={v=>[fmt(v,sym)]}/>
                </PieChart>
              </ResponsiveContainer>
          }
        </div>
        <div style={card}>
          <div style={{fontSize:13,fontWeight:600,marginBottom:12}}>Stock vs listed</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stockVsListed} layout="vertical" margin={{top:4,right:40,left:20,bottom:0}}>
              <XAxis type="number" tick={axisStyle} tickLine={false}/>
              <YAxis type="category" dataKey="name" tick={axisStyle} tickLine={false} axisLine={false}/>
              <Tooltip contentStyle={tipStyle} formatter={v=>[v,'Copies']}/>
              <Bar dataKey="copies" radius={[0,4,4,0]}>
                {stockVsListed.map(e=><Cell key={e.name} fill={e.fill}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:12}}>
            {[['In stock',stats.stockCount,'#8b949e'],['Listed',stats.listedCount,'#f0883e'],['Sold',stats.salesCount,'#e6edf3'],['This month revenue',fmt(thisMonth.revenue,sym),'#58a6ff']].map(([l,v,c])=>(
              <div key={l} style={{background:'#21262d',borderRadius:6,padding:'8px 10px'}}>
                <div style={{color:'#8b949e',fontSize:10}}>{l}</div>
                <div style={{fontWeight:700,fontSize:16,color:c}}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Daily sales + Listings activity */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
        <div style={card}>
          <div style={{fontSize:13,fontWeight:600,marginBottom:12}}>Daily revenue — last 30 days</div>
          {!hasDailySales
            ? <Empty>No sales in the last 30 days</Empty>
            : <ResponsiveContainer width="100%" height={180}>
                <BarChart data={dailySales} margin={{top:4,right:8,left:0,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke}/>
                  <XAxis dataKey="day" tick={axisStyle} tickLine={false} interval={6}/>
                  <YAxis tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={v=>sym+v}/>
                  <Tooltip contentStyle={tipStyle} formatter={v=>[fmt(v,sym),'Revenue']}/>
                  <Bar dataKey="amount" fill="#58a6ff" radius={[2,2,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
          }
        </div>
        <div style={card}>
          <div style={{fontSize:13,fontWeight:600,marginBottom:12}}>Daily listings activity — last 30 days</div>
          {!hasDailyListings
            ? <Empty>No listing activity in the last 30 days</Empty>
            : <ResponsiveContainer width="100%" height={180}>
                <BarChart data={dailyListings} margin={{top:4,right:8,left:0,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke}/>
                  <XAxis dataKey="day" tick={axisStyle} tickLine={false} interval={6}/>
                  <YAxis tick={axisStyle} tickLine={false} axisLine={false}/>
                  <Tooltip contentStyle={tipStyle} formatter={v=>[v,'Copies listed']}/>
                  <Bar dataKey="copies" fill="#a371f7" radius={[2,2,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
          }
        </div>
      </div>

      {/* Tax year progress */}
      <div style={card}>
        <div style={{fontSize:13,fontWeight:600,marginBottom:8}}>UK tax year gross revenue</div>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#8b949e',marginBottom:6}}>
          <span>Gross toward £1,000 trading allowance</span>
          <span style={{color:taxYear.gross<1000?'#3fb950':taxYear.gross<5000?'#d29922':'#f85149',fontWeight:600}}>
            {fmt(taxYear.gross,sym)} / £1,000
          </span>
        </div>
        <div style={{background:'#21262d',borderRadius:4,height:8,overflow:'hidden'}}>
          <div style={{width:`${taxYear.pct}%`,height:'100%',background:taxYear.gross<1000?'#3fb950':taxYear.gross<5000?'#d29922':'#f85149',borderRadius:4}}/>
        </div>
        <div style={{fontSize:11,color:'#6e7681',marginTop:6}}>
          {taxYear.gross<1000?'Under the £1,000 allowance — no tax action needed yet':'⚠ Over £1,000 — consider registering for Self Assessment'}
        </div>
      </div>
    </div>
  );
}
