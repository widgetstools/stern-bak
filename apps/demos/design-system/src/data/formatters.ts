export const fmtPrice = (n: number) => n.toFixed(3);
export const fmtYield = (n: number) => `${n.toFixed(3)}%`;
export const fmtBps = (n: number) => `${Math.round(n)} bp`;
export const fmtQty = (n: number) => n.toLocaleString('en-US');
export const fmtSignedPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
export const fmtMoney = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
