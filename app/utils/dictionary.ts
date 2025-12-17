// app/utils/dictionary.ts

// 1. 基础人格映射
export const PERSONA_MAP: Record<string, string> = {
  "Golden Dog Hunter": "金狗猎人",
  "Whale": "巨鲸",
  "Bot": "机器人",
  "Airdrop Hunter": "空投猎手",
  "Degen": "Degen 赌徒",
  "NFT Collector": "NFT 收藏家",
  "Inactive": "沉睡账户",
  "Exchange": "交易所",
};

// 2. 高级标签翻译表
const TAG_TRANSLATIONS: Record<string, { cn: string, en: string }> = {
  "TAG_VITALIK": { cn: "💎 V神", en: "💎 Vitalik" },
  "TAG_SUN": { cn: "🐋 孙宇晨", en: "🐋 Justin Sun" },
  "TAG_TRUMP": { cn: "🇺🇸 特朗普", en: "🇺🇸 Trump" },
  "TAG_SATOSHI": { cn: "👑 创世", en: "👑 Genesis" },
  "TAG_MM": { cn: "🏦 做市商", en: "🏦 Market Maker" },
  "TAG_INST": { cn: "🏦 机构", en: "🏦 Institution" },
  "TAG_VC": { cn: "💰 VC", en: "💰 VC" },
  "TAG_BINANCE": { cn: "🔶 币安", en: "🔶 Binance" },
  "TAG_HACKER": { cn: "☠️ 黑客", en: "☠️ Hacker" },
  "TAG_FTX": { cn: "🚨 FTX", en: "🚨 FTX" },
  "TAG_STOLEN": { cn: "🚨 被盗", en: "🚨 Stolen" },
  "TAG_ATTACKER": { cn: "☠️ 攻击者", en: "☠️ Attacker" },
  "TAG_SHIB": { cn: "🐕 SHIB", en: "🐕 SHIB" },
  "TAG_PEPE": { cn: "🐸 PEPE", en: "🐸 PEPE" },
  "TAG_MACHI": { cn: "🖼️ 麻吉", en: "🖼️ Machi" },
  "TAG_BAYC": { cn: "🦍 BAYC", en: "🦍 BAYC" },
  
  "WHALE": { cn: "🐋 顶级巨鲸", en: "🐋 Top Whale" },
  "SMART_MONEY": { cn: "🦈 聪明钱", en: "🦈 Smart Money" },
  "MID_CLASS": { cn: "🐬 中产阶级", en: "🐬 Mid Class" },
  "SHRIMP": { cn: "🦐 链上虾米", en: "🦐 Shrimp" },
  "SNIPER": { cn: "🎲 单币梭哈", en: "🎲 Sniper" },
  "ETF_STYLE": { cn: "🏦 指数配置", en: "🏦 Index Fund" },
  "GAMBLER": { cn: "🔥 链上赌徒", en: "🔥 Degen" },
  "RISK_AVERSE": { cn: "🛡️ 风险厌恶", en: "🛡️ Safe Player" },
  "OG": { cn: "⏳ 钻石手老兵", en: "⏳ OG" },
  "NEW_MONEY": { cn: "⚡ 突击新钱", en: "⚡ New Money" },
  "General_User": { cn: "普通链上用户", en: "General User" },
  "Institutional": { cn: "机构/做市商", en: "Institutional" },
  "Alpha_Hunter": { cn: "金狗猎人", en: "Alpha Hunter" },
  "High_Risk_Degen": { cn: "高危 Degen", en: "High Risk Degen" },
  "Maxi": { cn: "信仰持仓者", en: "Maxi" },
  "Tourist": { cn: "链上观光客", en: "Tourist" },
  "Criminal": { cn: "☠️ 网络犯罪者", en: "☠️ Cyber Criminal" },
  "Hacker": { cn: "黑客", en: "Hacker" },
  "Money_Laundering": { cn: "洗钱风险", en: "Money Laundering" }
};

// 3. 辅助翻译函数
export function getTrans(key: string, lang: 'cn' | 'en'): string {
    if (TAG_TRANSLATIONS[key]) return TAG_TRANSLATIONS[key][lang];
    if (lang === 'cn' && PERSONA_MAP[key]) return PERSONA_MAP[key];
    return key;
}

// 4. UI 字典 (包含所有界面文案)
export const DICT = {
  cn: {
    title: "WalletAudit",
    placeholder: "输入 ETH 地址或 ENS...",
    analyze: "立即审计",
    analyzing: "正在分析链上数据...",
    
    // 资产模块
    assetsTitle: "资产分布详情",
    assetHeader: "资产",
    priceHeader: "价格/余额",
    valueHeader: "价值",
    allocHeader: "占比",
    
    // 按钮与通用
    proBtn: "PRO 高级版",
    quickAccess: "我的关注列表",
    noFavs: "暂无收藏，点击星星 ⭐ 添加关注",
    
    // 报告核心
    riskScore: "综合画像评分",
    netWorth: "总资产估值",
    contract: "合约",
    wallet: "钱包",
    briefing: "智能摘要",
    firstActive: "首次活跃",
    unknownDate: "未知时间",
    
    // 交易流模块
    recentActivity: "最新交易动态 (实时)",
    noTxs: "近期无交易记录",
    txTime: "时间",
    txValue: "价值",
    txMethod: "调用方法",
    
    // 核心指标
    metricTx: "总交易数",
    metricDays: "活跃天数",
    metricGas: "Gas 消耗",
    metricInteract: "交互对象",
    
    // 授权模块
    approvalsTitle: "风险授权检测",
    riskCount: "个高危授权",
    safe: "安全",
    revoke: "取消授权",
    spender: "授权对象",
    amount: "额度",
    unknownContract: "未知合约",
    
    // 分享与弹窗 (✅ 这一部分是你报错缺失的)
    shareBtn: "生成报告卡片",
    downloading: "生成中...",
    shareTitle: "WalletAudit 链上审计报告",
    scanToUse: "扫码体检你的钱包",
    setNickname: "设置备注名", // ✅ 补全
    cancel: "取消",          // ✅ 补全
    confirm: "保存",         // ✅ 补全
    
    // 热门追踪
    hotWallets: "热门追踪",
    catWhales: "名人大户",
    catInstitutions: "机构/交易所",
    catRisk: "黑客/高危",
    catDegen: "Meme/NFT"
  },
  en: {
    title: "WalletAudit",
    placeholder: "Enter ETH Address / ENS...",
    analyze: "Audit",
    analyzing: "Analyzing...",
    
    assetsTitle: "Asset Allocation",
    assetHeader: "Asset",
    priceHeader: "Price/Bal",
    valueHeader: "Value",
    allocHeader: "Alloc",
    
    proBtn: "PRO Upgrade",
    quickAccess: "Watchlist",
    noFavs: "No watchlist yet. Click ⭐ to add.",
    
    riskScore: "Wallet Score",
    netWorth: "Net Worth",
    contract: "Contract",
    wallet: "Wallet",
    briefing: "Smart Briefing",
    firstActive: "First Active",
    unknownDate: "Unknown",
    
    recentActivity: "Live Transactions",
    noTxs: "No recent transactions",
    txTime: "Time",
    txValue: "Value",
    txMethod: "Method",
    
    metricTx: "Total Txs",
    metricDays: "Active Days",
    metricGas: "Gas Spent",
    metricInteract: "Interactions",
    
    approvalsTitle: "Risk Approvals",
    riskCount: "Risk Items",
    safe: "Safe",
    revoke: "Revoke",
    spender: "Spender",
    amount: "Amount",
    unknownContract: "Unknown",
    
    // Share & Modal (✅ Fixed missing keys)
    shareBtn: "Share Card",
    downloading: "Generating...",
    shareTitle: "WalletAudit On-chain Report",
    scanToUse: "Audit Your Wallet",
    setNickname: "Set Nickname", // ✅ 补全
    cancel: "Cancel",            // ✅ 补全
    confirm: "Save",             // ✅ 补全
    
    hotWallets: "Trending Now",
    catWhales: "Whales",
    catInstitutions: "Institutions",
    catRisk: "Hackers",
    catDegen: "Degen"
  }
};