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
