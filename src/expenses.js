import { parseEnGBDate } from './dateUtils.js';

export const EXPENSE_TYPES = [
  { id:'stock',   label:'Stock & goods',             short:'Stock',    desc:'Items and bundles you buy to resell' },
  { id:'postage', label:'Postage & shipping equip',  short:'Post',     desc:'Scales, label printer, postage meter…' },
  { id:'supplies',label:'Packing & materials',       short:'Supplies', desc:'Bags, tape, bubble wrap, packaging…' },
  { id:'refunds', label:'Refunds',                    short:'Refunds',  desc:'eBay refunds — item not received cases etc.' },
];

export const expenseType  = p => p?.type||'stock';
export const expenseLabel = id => EXPENSE_TYPES.find(e=>e.id===id)?.label||'Stock & goods';
export const expenseShort = id => EXPENSE_TYPES.find(e=>e.id===id)?.short||'Stock';

export const normalizePurchases = list =>
  (list||[]).map(p=>({...p,type:expenseType(p)}));

export const sumExpenses = (purchases,type=null) => {
  let sum = 0;
  (purchases||[]).forEach(p=>{
    const t = expenseType(p);
    if(type===null||t===type) sum += p.amount||0;
  });
  return +sum.toFixed(2);
};

export const expenseTotals = purchases => ({
  stock:    sumExpenses(purchases,'stock'),
  postage:  sumExpenses(purchases,'postage'),
  supplies: sumExpenses(purchases,'supplies'),
  refunds:  sumExpenses(purchases,'refunds'),
  all:      sumExpenses(purchases,null),
});

export const purchasesInTaxYear = (purchases,tyStart,tyEndExclusive) =>
  (purchases||[]).filter(p=>{
    const d = parseEnGBDate(p.date);
    if(!d||d<tyStart) return false;
    if(tyEndExclusive&&d>=tyEndExclusive) return false;
    return true;
  });
