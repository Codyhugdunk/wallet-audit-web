// app/utils/format.ts

// 1. 金额格式化
export function formatMoney(value: number, lang: 'cn' | 'en') {
  if (!Number.isFinite(value)) return "$0";
  const abs = Math.abs(value);
  let res = "";
  if (lang === 'cn') {
    if (abs >= 100000000) res = `${(abs / 100000000).toFixed(2)}亿`;
    else if (abs >= 10000) res = `${(abs / 10000).toFixed(2)}万`;
    else res = new Intl.NumberFormat('en-US').format(parseFloat(abs.toFixed(2)));
  } else {
    if (abs >= 1000000000) res = `${(abs / 1000000000).toFixed(2)}B`;
    else if (abs >= 1000000) res = `${(abs / 1000000).toFixed(2)}M`;
    else if (abs >= 1000) res = `${(abs / 1000).toFixed(1)}k`;
    else res = new Intl.NumberFormat('en-US').format(parseFloat(abs.toFixed(2)));
  }
  return (value < 0 ? "-" : "") + "$" + res;
}

// 2. 时间格式化 (几分钟前)
export function formatTimeAgo(ts: number, lang: 'cn' | 'en') {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return lang === 'cn' ? "刚刚" : "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return lang === 'cn' ? `${minutes}分钟前` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return lang === 'cn' ? `${hours}小时前` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return lang === 'cn' ? `${days}天前` : `${days}d ago`;
}

// 3. ETH 数量格式化
export function formatEth(wei: string) {
    if (!wei) return "0";
    const val = Number(wei) / 1e18;
    if (val < 0.0001 && val > 0) return "<0.0001";
    return val.toFixed(4);
}

// ✅ 4. 钱包年龄计算 (之前你缺的就是这个！)
export function calculateWalletAge(createdAt: number | null, lang: 'cn' | 'en') {
    if (!createdAt) return lang === 'cn' ? "未知" : "Unknown";
    const days = Math.floor((Date.now() - createdAt) / (1000 * 60 * 60 * 24));
    const years = (days / 365).toFixed(1);
    
    if (days < 30) return lang === 'cn' ? `${days} 天` : `${days} Days`;
    if (days < 365) return lang === 'cn' ? `${Math.floor(days/30)} 个月` : `${Math.floor(days/30)} Months`;
    return lang === 'cn' ? `${years} 年` : `${years} Years`;
}