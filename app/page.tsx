"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import html2canvas from "html2canvas"; // ✅ 引入截图库
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid
} from "recharts";
import { 
  Star, Trash2, Copy, ExternalLink, Activity, Wallet, Search, 
  ArrowUpRight, ArrowDownRight, Clock, AlertCircle, Zap, Calendar, Flame, Layers, ShieldAlert, Lock, Share2, Download
} from "lucide-react";

// ==========================================
// 1. 类型定义
// ==========================================
type AllocationItem = { category: string; value: number; ratio: number };
type TokenBalance = { contractAddress: string; symbol: string; amount: number; value: number; decimals: number; hasPrice: boolean };

type RecentTx = {
  hash: string;
  timestamp: number;
  from: string;
  to: string;
  value: string;
  isError: string;
  gasUsed: string;
  functionName?: string;
  symbol?: string;
  decimal?: string;
};

type ApprovalItem = {
  token: string;
  spender: string;
  spenderName: string;
  amount: string;
  riskLevel: "High" | "Low";
  lastUpdated: number;
  txHash: string;
};

type Report = {
  version: string;
  address: string;
  identity: { address: string; isContract: boolean; createdAt: number | null };
  assets: { eth: { amount: number; value: number }; tokens: TokenBalance[]; totalValue: number; allocation: AllocationItem[]; otherTokens: TokenBalance[]; priceWarning: string | null };
  activity: { 
    txCount: number | string; 
    activeDays: number; 
    contractsInteracted: number; 
    topContracts: string[]; 
    weeklyHistogram: any[];
    recentTxs: RecentTx[]; 
  };
  gas: { txCount: number; totalGasEth: number; totalGasUsd: number; topTxs: { hash: string; gasEth: number }[] };
  risk: { level: string; score: number; comment: string; stableRatio: number; memeRatio: number; otherRatio: number; txCount: number | string; personaType: string; personaTags: string[] };
  approvals?: { riskCount: number; items: ApprovalItem[] };
  meta: { version: string; generatedAt: number; };
};

type FavoriteItem = { address: string; nickname: string; addedAt: number; tags?: string[] };

// ==========================================
// 2. 翻译字典 & 工具
// ==========================================
const TG_CHANNEL_URL = "https://t.me/walletaudit";

const PERSONA_MAP: Record<string, string> = {
  "Golden Dog Hunter": "金狗猎人",
  "Whale": "巨鲸",
  "Bot": "机器人",
  "Airdrop Hunter": "空投猎手",
  "Degen": "Degen 赌徒",
  "NFT Collector": "NFT 收藏家",
  "Inactive": "沉睡账户",
  "Exchange": "交易所",
};

const DICT = {
  cn: {
    title: "WalletAudit",
    placeholder: "输入 ETH 地址或 ENS...",
    analyze: "立即审计",
    analyzing: "正在分析链上数据...",
    assetsTitle: "资产分布详情",
    assetHeader: "资产",
    priceHeader: "价格/余额",
    valueHeader: "价值",
    allocHeader: "占比",
    proBtn: "PRO 高级版",
    quickAccess: "我的关注列表",
    noFavs: "暂无收藏，点击星星 ⭐ 添加关注",
    riskScore: "综合画像评分",
    netWorth: "总资产估值",
    contract: "合约",
    wallet: "钱包",
    recentActivity: "最新交易动态 (实时)",
    txTime: "时间",
    txValue: "价值",
    setNickname: "设置备注名",
    cancel: "取消",
    confirm: "保存",
    firstActive: "首次活跃",
    unknownDate: "未知",
    txMethod: "调用方法",
    noTxs: "近期无交易记录",
    metricTx: "总交易数",
    metricDays: "活跃天数",
    metricGas: "Gas 消耗",
    metricInteract: "交互对象",
    briefing: "智能摘要",
    approvalsTitle: "风险授权检测",
    riskCount: "个高危授权",
    safe: "安全",
    revoke: "取消授权",
    spender: "授权对象",
    amount: "额度",
    unknownContract: "未知合约",
    shareBtn: "生成分享图",
    downloading: "生成中...",
    shareTitle: "WalletAudit 链上审计报告",
    scanToUse: "扫码体检你的钱包"
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
    recentActivity: "Live Transactions",
    txTime: "Time",
    txValue: "Value",
    setNickname: "Set Nickname",
    cancel: "Cancel",
    confirm: "Save",
    firstActive: "First Active",
    unknownDate: "Unknown",
    txMethod: "Method",
    noTxs: "No recent transactions",
    metricTx: "Total Txs",
    metricDays: "Active Days",
    metricGas: "Gas Spent",
    metricInteract: "Interactions",
    briefing: "Smart Briefing",
    approvalsTitle: "Risk Approvals",
    riskCount: "Risk Items",
    safe: "Safe",
    revoke: "Revoke",
    spender: "Spender",
    amount: "Amount",
    unknownContract: "Unknown",
    shareBtn: "Share Card",
    downloading: "Generating...",
    shareTitle: "WalletAudit On-chain Report",
    scanToUse: "Audit Your Wallet"
  }
};

function formatMoney(value: number, lang: 'cn' | 'en') {
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

function formatTimeAgo(ts: number, lang: 'cn' | 'en') {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return lang === 'cn' ? "刚刚" : "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return lang === 'cn' ? `${minutes}分钟前` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return lang === 'cn' ? `${hours}小时前` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return lang === 'cn' ? `${days}天前` : `${days}d ago`;
}

function formatEth(wei: string) {
    if (!wei) return "0";
    const val = Number(wei) / 1e18;
    if (val < 0.0001 && val > 0) return "<0.0001";
    return val.toFixed(4);
}

// ==========================================
// 3. 核心功能组件
// ==========================================

function ApprovalsCard({ approvals, lang }: { approvals: NonNullable<Report['approvals']>, lang: 'cn' | 'en' }) {
    const D = DICT[lang];
    const hasRisk = approvals.riskCount > 0;
    if (approvals.items.length === 0) return null;

    return (
        <div className={`rounded-xl border p-5 ${hasRisk ? 'bg-red-950/10 border-red-900/30' : 'bg-[#0a0a0a] border-slate-800'}`}>
            <div className="flex items-center justify-between mb-4">
                <h3 className={`font-bold text-sm flex items-center gap-2 ${hasRisk ? 'text-red-400' : 'text-slate-200'}`}>
                    {hasRisk ? <ShieldAlert size={16} /> : <Lock size={16} className="text-emerald-500"/>}
                    {D.approvalsTitle}
                </h3>
                {hasRisk && (
                    <span className="text-xs bg-red-900/20 text-red-400 px-2 py-0.5 rounded border border-red-900/30 font-medium">
                        {approvals.riskCount} {D.riskCount}
                    </span>
                )}
            </div>
            <div className="space-y-2">
                {approvals.items.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-slate-900/40 border border-slate-800/50 text-xs">
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-white bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">{item.token}</span>
                                <span className="text-slate-500">➔</span>
                                <span className={`${item.riskLevel === 'High' ? 'text-red-300' : 'text-slate-300'} font-medium`}>{item.spenderName}</span>
                            </div>
                            <span className="text-[10px] text-slate-500 font-mono ml-1">{item.spender.slice(0, 6)}...{item.spender.slice(-4)}</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="text-right hidden sm:block">
                                <div className={`font-medium ${item.amount === 'Unlimited' ? 'text-amber-400' : 'text-slate-400'}`}>{item.amount}</div>
                            </div>
                            <a href={`https://revoke.cash/address/${item.spender}`} target="_blank" className="px-3 py-1.5 rounded bg-slate-800 hover:bg-red-900/30 hover:text-red-400 text-slate-400 border border-slate-700 transition flex items-center gap-1">
                                {D.revoke} <ExternalLink size={10} />
                            </a>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function RealTransactionFeed({ txs, address, lang }: { txs: RecentTx[], address: string, lang: 'cn' | 'en' }) {
  const D = DICT[lang];
  if (!txs || txs.length === 0) return (
        <div className="bg-[#0a0a0a] border border-slate-800 rounded-xl p-8 flex flex-col items-center justify-center text-slate-500 h-full min-h-[400px]">
            <Activity size={32} className="opacity-20 mb-2" />
            <span className="text-xs">{D.noTxs}</span>
        </div>
  );

  return (
    <div className="bg-[#0a0a0a] border border-slate-800 rounded-xl overflow-hidden flex flex-col h-full min-h-[400px]">
       <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/30">
          <h3 className="font-bold text-slate-200 text-sm flex items-center gap-2"><Activity size={14} className="text-blue-500" /> {D.recentActivity}</h3>
       </div>
       <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
          {txs.map((tx, idx) => {
             const isIn = tx.to?.toLowerCase() === address.toLowerCase();
             const isError = tx.isError === "1";
             const method = tx.functionName ? tx.functionName.split('(')[0] : (isIn ? 'Receive' : 'Send');
             const ethVal = Number(tx.value) / 1e18;
             const isZero = ethVal < 0.000001;
             return (
             <div key={idx} className="flex items-center gap-3 p-3 border-b border-slate-800/50 hover:bg-slate-900/40 transition group">
                <div className={`p-1.5 rounded-full border transition ${
                    isError ? 'bg-red-900/20 border-red-500/30 text-red-500' :
                    (method === 'execute' || method === 'executeBatch') ? 'bg-amber-900/20 border-amber-500/30 text-amber-500' :
                    isIn ? 'bg-emerald-900/20 border-emerald-500/30 text-emerald-500' : 
                    'bg-slate-800 border-slate-700 text-slate-400'
                }`}>
                    {isError ? <AlertCircle size={14} /> : (method === 'execute' || method === 'executeBatch') ? <Zap size={14}/> : isIn ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
                </div>
                <div className="flex-1 min-w-0">
                   <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[11px] font-bold text-slate-300 font-mono truncate max-w-[120px]" title={method}>{method}</span>
                      <span className="text-[10px] text-slate-500 flex items-center gap-1"><Clock size={10} /> {formatTimeAgo(tx.timestamp * 1000, lang)}</span>
                   </div>
                   <div className="text-[10px] text-slate-500 font-mono truncate">{isIn ? `From: ${tx.from.slice(0,6)}...` : `To: ${tx.to?.slice(0,6)}...`}</div>
                </div>
                <div className="text-right min-w-[70px]">
                   <div className={`text-xs font-mono ${isZero ? 'text-slate-600' : 'text-slate-200 font-medium'}`}>{isZero ? 'Interaction' : `${formatEth(tx.value)} ETH`}</div>
                </div>
                <a href={`https://etherscan.io/tx/${tx.hash}`} target="_blank" className="text-slate-600 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition"><ExternalLink size={12} /></a>
             </div>
             )
          })}
       </div>
    </div>
  );
}

function AssetTable({ assets, lang }: { assets: Report['assets'], lang: 'cn'|'en' }) {
    const D = DICT[lang];
    const allAssets = useMemo(() => {
      const list = [
        { symbol: "ETH", address: "", amount: assets.eth.amount, value: assets.eth.value, ratio: assets.totalValue > 0 ? assets.eth.value / assets.totalValue : 0 },
        ...assets.tokens.map(t => ({ symbol: t.symbol, address: t.contractAddress, amount: t.amount, value: t.value, ratio: assets.totalValue > 0 ? t.value / assets.totalValue : 0 }))
      ];
      return list.filter(a => a.value > 1).sort((a, b) => b.value - a.value);
    }, [assets]);
  
    return (
      <div className="w-full space-y-2">
        <div className="grid grid-cols-12 text-[10px] text-slate-500 uppercase tracking-wider px-2 font-medium">
          <div className="col-span-4">{D.assetHeader}</div>
          <div className="col-span-3 text-right">{D.priceHeader}</div>
          <div className="col-span-3 text-right">{D.valueHeader}</div>
          <div className="col-span-2 text-right">{D.allocHeader}</div>
        </div>
        <div className="space-y-1 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
          {allAssets.map((item, idx) => (
            <div key={idx} className="grid grid-cols-12 items-center p-2 rounded-lg bg-slate-900/30 border border-slate-800/50 hover:bg-slate-800/60 transition">
              <div className="col-span-4 flex items-center gap-2">
                 <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-300 border border-slate-700 shrink-0">
                    {item.symbol ? item.symbol[0] : '?'}
                 </div>
                 <div className="min-w-0">
                    <div className="font-bold text-slate-200 text-sm truncate">{item.symbol}</div>
                 </div>
              </div>
              <div className="col-span-3 text-right">
                 <div className="text-[11px] text-slate-400 font-mono">{item.amount < 0.001 ? '<0.001' : (item.amount > 10000 ? (item.amount/1000).toFixed(1)+'k' : item.amount.toFixed(3))}</div>
              </div>
              <div className="col-span-3 text-right">
                 <div className="text-sm font-medium text-slate-200 font-mono">{formatMoney(item.value, lang)}</div>
              </div>
              <div className="col-span-2 flex items-center justify-end gap-2">
                 <div className="text-[11px] text-slate-400 font-mono w-8 text-right">{(item.ratio * 100).toFixed(0)}%</div>
                 <div className="w-1.5 h-6 bg-slate-800 rounded-full overflow-hidden relative">
                    <div className="absolute bottom-0 left-0 w-full bg-blue-500" style={{ height: `${item.ratio * 100}%` }}></div>
                 </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
}

// ==========================================
// 4. 分享卡片组件 (Hidden)
// ==========================================
// 这是一个隐藏的 DOM 结构，专门用来生成图片
function ShareCardView({ report, lang, targetRef }: { report: Report, lang: 'cn'|'en', targetRef: any }) {
    const D = DICT[lang];
    const score = report.risk.score;
    const isSafe = score >= 80;
    const color = isSafe ? 'text-emerald-400' : score <= 50 ? 'text-red-500' : 'text-amber-400';
    const borderColor = isSafe ? 'border-emerald-500' : score <= 50 ? 'border-red-500' : 'border-amber-500';

    return (
        <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
            <div ref={targetRef} className="w-[600px] bg-[#050505] p-8 text-slate-100 font-sans border-2 border-slate-800 relative overflow-hidden">
                {/* 装饰背景 */}
                <div className={`absolute top-0 right-0 w-[400px] h-[400px] rounded-full blur-[120px] opacity-20 pointer-events-none ${isSafe ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                
                {/* Header */}
                <div className="flex items-center justify-between mb-8 relative z-10">
                    <div className="flex items-center gap-2">
                        <Activity className="text-blue-500" size={24} />
                        <span className="text-2xl font-bold tracking-tighter text-white">WalletAudit</span>
                    </div>
                    <span className="text-xs text-slate-500 font-mono">{new Date().toLocaleDateString()}</span>
                </div>

                {/* Score & Address */}
                <div className="text-center mb-10 relative z-10">
                    <div className={`w-32 h-32 rounded-2xl border-4 ${borderColor} bg-slate-900/50 flex flex-col items-center justify-center mx-auto mb-4`}>
                        <span className={`text-5xl font-bold font-mono ${color}`}>{score}</span>
                        <span className="text-[10px] uppercase tracking-widest opacity-70 mt-1">{D.riskScore}</span>
                    </div>
                    <h2 className="text-xl font-bold font-mono text-white mb-1">{report.address.slice(0,8)}...{report.address.slice(-6)}</h2>
                    <div className="inline-block px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs text-slate-300">
                        {lang === 'cn' ? (PERSONA_MAP[report.risk.personaType] || report.risk.personaType) : report.risk.personaType}
                    </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 gap-4 mb-8 relative z-10">
                    <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl">
                        <div className="text-xs text-slate-500 uppercase mb-1">{D.netWorth}</div>
                        <div className="text-2xl font-bold text-white">{formatMoney(report.assets.totalValue, lang)}</div>
                    </div>
                    <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl">
                        <div className="text-xs text-slate-500 uppercase mb-1">{D.riskCount}</div>
                        <div className={`text-2xl font-bold ${report.approvals && report.approvals.riskCount > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                            {report.approvals ? report.approvals.riskCount : 0}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-t border-slate-800 pt-4 relative z-10">
                    <div className="flex flex-col">
                        <span className="text-xs text-slate-500 uppercase">{D.shareTitle}</span>
                        <span className="text-sm font-bold text-blue-400">walletaudit.me</span>
                    </div>
                    <div className="bg-white p-1 rounded">
                       {/* 这里用一个简单的方块模拟二维码占位 */}
                       <div className="w-12 h-12 bg-black flex items-center justify-center text-[8px] text-white text-center leading-tight">SCAN<br/>ME</div>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ==========================================
// 5. 主页面
// ==========================================
export default function HomePage() {
  const [lang, setLang] = useState<'cn' | 'en'>('cn');
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [showNickModal, setShowNickModal] = useState(false);
  const [tempNick, setTempNick] = useState("");
  
  // 截图相关
  const shareRef = useRef<HTMLDivElement>(null);
  const [generatingImg, setGeneratingImg] = useState(false);

  const D = DICT[lang];

  useEffect(() => {
    const saved = localStorage.getItem("walletaudit:favs:v3");
    if (saved) try { setFavorites(JSON.parse(saved)); } catch (e) {}
  }, []);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!address) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/report?address=${address}`);
      if (!res.ok) throw new Error("API Error");
      const data = await res.json();
      setReport(data);
    } catch (err) {
      alert("Error fetching report");
    } finally {
      setLoading(false);
    }
  };

  const loadFav = (addr: string) => {
      setAddress(addr);
      setLoading(true);
      fetch(`/api/report?address=${addr}`).then(r => r.json()).then(d => {
          setReport(d);
          setLoading(false);
      }).catch(() => setLoading(false));
  };

  const saveFavorite = () => {
    if (!report) return;
    const newItem: FavoriteItem = {
        address: report.address,
        nickname: tempNick || (lang === 'cn' ? (PERSONA_MAP[report.risk.personaType] || report.risk.personaType) : report.risk.personaType),
        addedAt: Date.now()
    };
    const next = [newItem, ...favorites.filter(f => f.address.toLowerCase() !== report.address.toLowerCase())];
    setFavorites(next);
    localStorage.setItem("walletaudit:favs:v3", JSON.stringify(next));
    setShowNickModal(false);
    setTempNick("");
  };

  const removeFavorite = (addr: string) => {
      const next = favorites.filter(f => f.address.toLowerCase() !== addr.toLowerCase());
      setFavorites(next);
      localStorage.setItem("walletaudit:favs:v3", JSON.stringify(next));
  };

  const isFav = report ? favorites.some(f => f.address.toLowerCase() === report.address.toLowerCase()) : false;
  
  const getScoreStyle = (score: number) => {
      if (score >= 80) return { color: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-500/10' };
      if (score >= 50) return { color: 'text-amber-400', border: 'border-amber-500/30', bg: 'bg-amber-500/10' };
      return { color: 'text-rose-500', border: 'border-rose-500/30', bg: 'bg-rose-500/10' };
  };

  const getSummaryText = () => {
      if (!report) return "";
      const { assets, identity, risk } = report;
      const totalVal = formatMoney(assets.totalValue, lang);
      const ageDate = identity.createdAt ? new Date(identity.createdAt).getFullYear() : null;
      // ✅ 核心资产判断修复
      const ethVal = assets.eth.value;
      const topToken = assets.tokens.length > 0 ? assets.tokens[0] : null;
      const topAsset = (topToken && topToken.value > ethVal) ? topToken.symbol : "ETH";
      
      let text = "";
      if (lang === 'cn') {
          text += `此地址目前管理约 ${totalVal} 资产，核心配置为 ${topAsset}。`;
          if (ageDate) text += ` 账户创建于 ${ageDate} 年，`;
          
          if (risk.level === 'High' && risk.score === 0) {
             text += `被标记为「${risk.personaType}」。请务必远离！`;
          } else {
             text += `属于「${PERSONA_MAP[risk.personaType] || risk.personaType}」。`;
          }

          if (risk.score < 50) text += ` 系统检测到较高的资产集中度或异常交互行为，请注意风险。`;
          else text += ` 资产结构相对稳健。`;
      } else {
          text += `Managing approx ${totalVal}, mainly allocated in ${topAsset}. `;
          if (ageDate) text += `Created in ${ageDate}, `;
          text += `identified as "${risk.personaType}". `;
          if (risk.score < 50) text += ` High concentration or unusual activity detected.`;
          else text += ` The portfolio structure appears stable.`;
      }
      return text;
  };

  // 生成并下载图片
  const handleShare = async () => {
      if (!shareRef.current) return;
      setGeneratingImg(true);
      try {
          const canvas = await html2canvas(shareRef.current, {
              backgroundColor: "#050505",
              scale: 2, // 高清
          });
          const image = canvas.toDataURL("image/png");
          const link = document.createElement("a");
          link.href = image;
          link.download = `WalletAudit-${report?.address.slice(0,6)}.png`;
          link.click();
      } catch (e) {
          console.error("Share gen failed", e);
          alert("Failed to generate image");
      } finally {
          setGeneratingImg(false);
      }
  };

  return (
    <main className="min-h-screen bg-[#050505] text-slate-200 font-sans selection:bg-blue-500/30 pb-20">
      
      {/* 隐藏的分享卡片渲染区 */}
      {report && <ShareCardView report={report} lang={lang} targetRef={shareRef} />}

      <nav className="border-b border-slate-900 bg-[#050505]/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="text-blue-500" size={20} />
            <span className="text-xl font-bold tracking-tighter text-white">WalletAudit</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setLang(l => l==='cn'?'en':'cn')} className="text-xs font-mono font-medium text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-slate-800 transition">
                {lang === 'cn' ? '🇺🇸 EN' : '🇨🇳 中文'}
            </button>
            <a href={TG_CHANNEL_URL} target="_blank" className="hidden sm:flex items-center gap-1 bg-white hover:bg-slate-200 text-black text-xs px-3 py-1.5 rounded-full font-bold transition">
               <Star size={12} fill="black" /> {D.proBtn}
            </a>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        
        <section className="max-w-4xl mx-auto space-y-4">
            <div className="text-center mb-8">
                <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 tracking-tight">
                    {lang === 'cn' ? '洞察巨鲸，追踪聪明钱' : 'Track Whales & Smart Money'}
                </h1>
                <p className="text-slate-500 text-sm">
                    {lang === 'cn' ? '一站式链上战绩分析、交易流追踪与风险审计终端' : 'All-in-one terminal for On-chain PnL analysis, Transaction feeds and Risk audit.'}
                </p>
            </div>
            
            <form onSubmit={handleSubmit} className="relative z-10 group">
                <div className="absolute inset-0 bg-blue-600/20 rounded-xl blur-xl opacity-0 group-hover:opacity-100 transition duration-700"></div>
                <div className="relative flex items-center bg-[#0a0a0a] border border-slate-800 rounded-xl p-1.5 shadow-2xl focus-within:border-blue-500/50 transition">
                    <Search className="ml-3 text-slate-500" size={18} />
                    <input 
                      value={address}
                      onChange={e => setAddress(e.target.value)}
                      placeholder={D.placeholder}
                      className="flex-1 bg-transparent border-none outline-none text-sm px-3 text-white placeholder:text-slate-600 font-mono h-10"
                    />
                    <button disabled={loading} className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-6 h-10 rounded-lg transition">
                        {loading ? 'Thinking...' : D.analyze}
                    </button>
                </div>
            </form>

            <div className="pt-2 flex flex-wrap gap-2 justify-center">
                {favorites.length > 0 && favorites.map(fav => (
                    <div key={fav.address} onClick={() => loadFav(fav.address)} className="group flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-full px-3 py-1.5 hover:border-blue-500/50 hover:bg-slate-800 transition cursor-pointer select-none">
                        <span className="text-[11px] text-slate-300 font-medium">{fav.nickname}</span>
                        <button onClick={(e) => { e.stopPropagation(); removeFavorite(fav.address); }} className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition">
                            <Trash2 size={11} />
                        </button>
                    </div>
                ))}
            </div>
        </section>

        {report && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            {/* [A] HERO SECTION */}
            <div className="lg:col-span-12 bg-[#0a0a0a] border border-slate-800 rounded-2xl p-6 relative overflow-hidden shadow-2xl">
               <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-blue-600/5 rounded-full blur-[100px] pointer-events-none"></div>
               <div className="flex flex-col md:flex-row gap-6 relative z-10">
                  <div className="flex gap-5 shrink-0">
                      {(() => {
                          const s = getScoreStyle(report.risk.score);
                          return (
                            <div className={`flex flex-col items-center justify-center w-24 h-24 md:w-28 md:h-28 rounded-xl border ${s.bg} ${s.border} ${s.color} shrink-0`}>
                                <div className="flex items-baseline">
                                    <span className="text-3xl md:text-4xl font-bold font-mono">{report.risk.score}</span>
                                    <span className="text-sm opacity-60 font-mono ml-0.5">/100</span>
                                </div>
                                <span className="text-[10px] opacity-80 uppercase mt-1 font-bold text-center leading-tight px-1">{D.riskScore}</span>
                            </div>
                          )
                      })()}
                  </div>

                  <div className="flex-1 space-y-4">
                      <div>
                          <div className="flex items-center justify-between mb-2">
                             <h1 className="text-xl md:text-2xl font-bold text-white font-mono break-all tracking-tight">{report.address}</h1>
                             {/* 分享按钮 (New) */}
                             <button 
                                onClick={handleShare}
                                disabled={generatingImg}
                                className="md:hidden flex items-center gap-1 bg-slate-800 text-xs px-3 py-1.5 rounded-full border border-slate-700 text-slate-300 hover:text-white"
                             >
                                 {generatingImg ? <Clock size={12} className="animate-spin"/> : <Share2 size={12} />}
                                 {generatingImg ? D.downloading : D.shareBtn}
                             </button>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs px-2 py-0.5 rounded bg-slate-900 border border-slate-800 flex items-center gap-1 text-slate-300">
                                  {report.identity.isContract ? <Activity size={12} /> : <Wallet size={12} />}
                                  {report.identity.isContract ? D.contract : D.wallet}
                              </span>
                              <span className="text-xs px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
                                  {lang === 'cn' ? (PERSONA_MAP[report.risk.personaType] || report.risk.personaType) : report.risk.personaType}
                              </span>
                              
                              <div className="flex gap-1 ml-2 text-slate-500">
                                  <button onClick={() => navigator.clipboard.writeText(report.address)} className="p-1 hover:text-white transition"><Copy size={14} /></button>
                                  <button onClick={() => setShowNickModal(true)} className={`p-1 transition ${isFav?'text-amber-400':'hover:text-amber-400'}`}><Star size={14} fill={isFav?"currentColor":"none"} /></button>
                                  <a href={`https://etherscan.io/address/${report.address}`} target="_blank" className="p-1 hover:text-white transition"><ExternalLink size={14} /></a>
                              </div>

                              {/* 桌面版分享按钮 */}
                              <button 
                                onClick={handleShare}
                                disabled={generatingImg}
                                className="hidden md:flex ml-auto items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition shadow-lg shadow-blue-900/30"
                              >
                                 {generatingImg ? <Clock size={12} className="animate-spin"/> : <Share2 size={14} />}
                                 {generatingImg ? D.downloading : D.shareBtn}
                              </button>
                          </div>
                      </div>

                      <div className="p-3 bg-slate-900/40 rounded-lg border border-slate-800/50 text-xs md:text-sm text-slate-300 leading-relaxed font-sans">
                         <span className="text-blue-400 font-bold mr-2">⚡️ Insight:</span>
                         {getSummaryText()}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2">
                         <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/30 rounded border border-slate-800/50">
                            <Zap size={14} className="text-yellow-500" />
                            <div>
                               <div className="text-[10px] text-slate-500 uppercase">{D.metricTx}</div>
                               <div className="text-sm font-mono font-bold">{report.activity.txCount}</div>
                            </div>
                         </div>
                         <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/30 rounded border border-slate-800/50">
                            <Calendar size={14} className="text-blue-500" />
                            <div>
                               <div className="text-[10px] text-slate-500 uppercase">{D.metricDays}</div>
                               <div className="text-sm font-mono font-bold">{report.activity.activeDays}</div>
                            </div>
                         </div>
                         <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/30 rounded border border-slate-800/50">
                            <Flame size={14} className="text-orange-500" />
                            <div>
                               <div className="text-[10px] text-slate-500 uppercase">{D.metricGas}</div>
                               <div className="text-sm font-mono font-bold">{formatMoney(report.gas.totalGasUsd, lang)}</div>
                            </div>
                         </div>
                         <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/30 rounded border border-slate-800/50">
                            <Layers size={14} className="text-purple-500" />
                            <div>
                               <div className="text-[10px] text-slate-500 uppercase">{D.metricInteract}</div>
                               <div className="text-sm font-mono font-bold">{report.activity.contractsInteracted}</div>
                            </div>
                         </div>
                      </div>
                  </div>

                  <div className="hidden md:block text-right min-w-[120px]">
                      <div className="text-[11px] text-slate-500 uppercase tracking-widest mb-1">{D.netWorth}</div>
                      <div className="text-3xl font-bold text-white font-mono tracking-tight">{formatMoney(report.assets.totalValue, lang)}</div>
                      <div className="text-[11px] text-slate-400 mt-2 font-mono">
                          {D.firstActive}: {report.identity.createdAt ? new Date(report.identity.createdAt).toLocaleDateString() : D.unknownDate}
                      </div>
                  </div>
               </div>
            </div>

            {/* [B] LEFT COLUMN: 资产 & 授权 */}
            <div className="lg:col-span-7 space-y-5">
                {report.approvals && (
                    <ApprovalsCard approvals={report.approvals} lang={lang} />
                )}
                <div className="bg-[#0a0a0a] border border-slate-800 rounded-xl p-5">
                    <h3 className="font-bold text-slate-200 text-sm mb-4 flex items-center gap-2">
                        <Wallet size={16} className="text-blue-500" /> {D.assetsTitle}
                    </h3>
                    <AssetTable assets={report.assets} lang={lang} />
                </div>
            </div>

            {/* [C] RIGHT COLUMN: 真实交易流 */}
            <div className="lg:col-span-5 flex flex-col gap-5">
                <div className="flex-1">
                    <RealTransactionFeed txs={report.activity.recentTxs} address={report.address} lang={lang} />
                </div>
                <a href={TG_CHANNEL_URL} target="_blank" className="block p-5 rounded-xl border border-blue-600/30 bg-gradient-to-br from-blue-900/20 to-black hover:border-blue-500/50 transition group">
                    <div className="flex justify-between items-center mb-2">
                        <h4 className="font-bold text-blue-400 text-sm">Upgrade to PRO</h4>
                        <ArrowUpRight size={16} className="text-blue-500 group-hover:translate-x-1 group-hover:-translate-y-1 transition" />
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                        {lang === 'cn' ? '解锁完整资金流向图谱、无限期交易历史与实时巨鲸异动推送。' : 'Unlock full fund flow graph, unlimited history and real-time whale alerts.'}
                    </p>
                </a>
            </div>

          </div>
        )}

        {/* 收藏弹窗 */}
        {showNickModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <div className="bg-[#111] border border-slate-800 rounded-xl p-6 w-full max-w-sm shadow-2xl">
                    <h3 className="text-lg font-bold text-white mb-4">{D.setNickname}</h3>
                    <input 
                        autoFocus
                        value={tempNick}
                        onChange={e => setTempNick(e.target.value)}
                        placeholder="e.g. Smart Money / Hacker..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-sm text-white outline-none focus:border-blue-500 mb-6"
                    />
                    <div className="flex gap-3">
                        <button onClick={() => setShowNickModal(false)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 rounded-lg text-sm font-medium transition">{D.cancel}</button>
                        <button onClick={saveFavorite} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-lg text-sm font-medium transition">{D.confirm}</button>
                    </div>
                </div>
            </div>
        )}
      </div>
    </main>
  );
}