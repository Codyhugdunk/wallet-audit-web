"use client";

import { useState, useEffect, useRef } from "react";
import html2canvas from "html2canvas";
// 引入所有需要的图标 (增加了 Wifi 图标用于 VPN)
import { 
  Star, Trash2, Copy, ExternalLink, Activity, Wallet, Search, 
  ArrowUpRight, Twitter, Send, Clock, Share2,
  Zap, Calendar, Flame, Layers, ShieldAlert, Lock, Wifi
} from "lucide-react";

// 引入工具
import { DICT, getTrans, PERSONA_MAP } from "./utils/dictionary";
import { formatMoney, calculateWalletAge } from "./utils/format";

// 引入组件
import { WalletAuditLogo } from "./components/ui/WalletAuditLogo";
import { TrendingWallets } from "./components/report/TrendingWallets";
import { ApprovalsCard } from "./components/report/ApprovalsCard";
import { RealTransactionFeed } from "./components/report/RealTransactionFeed";
import { AssetTable } from "./components/report/AssetTable";
import { ShareCardView } from "./components/report/ShareCardView";
import { CounterpartyCard } from "./components/report/CounterpartyCard"; 

const TG_CHANNEL_URL = "https://t.me/walletaudit";
const TWITTER_URL = "https://x.com/PhilWong19";

// ✅ 1. 热门地址库 (已清洗：移除 Trump/Machi/Pepe 等坏账地址)
const HOT_WALLETS = [
  { name: "Vitalik", address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", tag: "TAG_VITALIK", category: "Whales" },
  { name: "Justin Sun", address: "0x3DdfA8eC3052539b6C9549F12cEA2C295cfF5296", tag: "TAG_SUN", category: "Whales" },
  { name: "Satoshi (ETH)", address: "0x0000000000000000000000000000000000000000", tag: "TAG_SATOSHI", category: "Whales" },
  { name: "Wintermute", address: "0xdbf5e9c5206d0db70a90108bf936da60221dc080", tag: "TAG_MM", category: "Institutions" },
  { name: "Jump Trading", address: "0xf584f8728b874a6a5c7a8d4d387c9aae9172d621", tag: "TAG_INST", category: "Institutions" },
  { name: "Paradigm", address: "0x6E0d01A76C3Cf4288372a29124A26D4353EE51BE", tag: "TAG_VC", category: "Institutions" },
  { name: "Binance Hot", address: "0x28C6c06298d514Db089934071355E5743bf21d60", tag: "TAG_BINANCE", category: "Institutions" },
  { name: "Ronin Hacker", address: "0x098B716B8Aaf21512996dC57EB0615e2383E2f96", tag: "TAG_HACKER", category: "Risk" },
  { name: "FTX Drainer", address: "0x59ABf3837Fa963d69c5468e492D581013164939F", tag: "TAG_FTX", category: "Risk" },
  { name: "Poloniex Hack", address: "0x3A8F5374544dD790938f3227d69C894F06723698", tag: "TAG_STOLEN", category: "Risk" },
  { name: "Curve Exploiter", address: "0xB90DE7426798C7D47a36323E2503911Df5487814", tag: "TAG_ATTACKER", category: "Risk" }
];

type Report = any;
type FavoriteItem = { address: string; nickname: string; addedAt: number; tags?: string[] };

export default function HomePage() {
  const [lang, setLang] = useState<'cn' | 'en'>('cn');
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [showNickModal, setShowNickModal] = useState(false);
  const [tempNick, setTempNick] = useState("");
  
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
        nickname: tempNick || getTrans(report.risk.personaType, lang),
        addedAt: Date.now()
    };
    const next = [newItem, ...favorites.filter((f: any) => f.address.toLowerCase() !== report.address.toLowerCase())];
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

  const isFav = report ? favorites.some((f: any) => f.address.toLowerCase() === report.address.toLowerCase()) : false;
  
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
      const ethVal = assets.eth.value;
      const topToken = assets.tokens.length > 0 ? assets.tokens[0] : null;
      const topAsset = (topToken && topToken.value > ethVal) ? topToken.symbol : "ETH";
      
      const persona = getTrans(risk.personaType, lang);

      let text = "";
      if (lang === 'cn') {
          if (risk.score === 0) return `🚨 **红色警报**：此地址已被标记为「${persona}」。资金来源极度可疑，建议立即拉黑！`;
          if (totalVal.includes("亿") || totalVal.includes("B")) return `🐋 **深海巨鳄**：坐拥 ${totalVal} 资产的顶级玩家。${persona === 'Maxi' ? '他是坚定的信仰者。' : '资产配置多元。'}`;
          if (ethVal > assets.totalValue * 0.9) return `💎 **钻石手**：资产规模 ${totalVal}，且 90% 以上梭哈了 ETH。`;
          return `📊 **审计报告**：当前管理 ${totalVal}，核心配置为 ${topAsset}。系统评级为「${persona}」。`;
      } else {
          if (risk.score === 0) return `🚨 **RED FLAG**: Identified as "${persona}". Do NOT interact!`;
          if (ethVal > assets.totalValue * 0.9) return `💎 **Diamond Hand**: Holding ${totalVal} with >90% exposure to ETH.`;
          return `📊 **Audit**: Managing ${totalVal}, focused on ${topAsset}. Rated as "${persona}".`;
      }
  };

  return (
    <main className="min-h-screen bg-[#050505] text-slate-200 font-sans selection:bg-blue-500/30 pb-20 flex flex-col">
      
      {/* 隐藏的 ShareCardView 还是留着吧，万一以后修好了能用，不占地方 */}
      {report && <ShareCardView report={report} lang={lang} targetRef={shareRef} />}

      <nav className="border-b border-slate-900 bg-[#050505]/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <WalletAuditLogo size={28} />
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

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6 flex-1">
        
        <section className="max-w-4xl mx-auto space-y-4">
            <div className="text-center mb-8">
                <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 tracking-tight">{lang === 'cn' ? '洞察巨鲸，追踪聪明钱' : 'Track Whales & Smart Money'}</h1>
                <p className="text-slate-500 text-sm">{lang === 'cn' ? '一站式链上战绩分析、交易流追踪与风险审计终端' : 'All-in-one terminal for On-chain PnL analysis, Transaction feeds and Risk audit.'}</p>
            </div>
            
            <form onSubmit={handleSubmit} className="relative z-10 group px-2">
                <div className="absolute inset-0 bg-blue-600/20 rounded-xl blur-xl opacity-0 group-hover:opacity-100 transition duration-700"></div>
                <div className="relative flex items-center bg-[#0a0a0a] border border-slate-800 rounded-xl p-1.5 shadow-2xl focus-within:border-blue-500/50 transition">
                    <Search className="ml-3 text-slate-500" size={18} />
                    <input value={address} onChange={e => setAddress(e.target.value)} placeholder={D.placeholder} className="flex-1 bg-transparent border-none outline-none text-sm px-3 text-white placeholder:text-slate-600 font-mono h-10 w-full" />
                    <button disabled={loading} className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 md:px-6 h-10 rounded-lg transition whitespace-nowrap">{loading ? 'Thinking...' : D.analyze}</button>
                </div>
            </form>

            <TrendingWallets title={D.hotWallets} onLoad={loadFav} lang={lang} />

            {favorites.length > 0 && (
                <div className="px-2 pt-2 border-t border-slate-800/50 mt-2">
                    <div className="flex items-center gap-2 text-xs text-slate-500 mb-2 font-medium"><Star size={12} /> {D.quickAccess}</div>
                    <div className="flex flex-wrap gap-2">
                        {favorites.map(fav => (
                            <div key={fav.address} onClick={() => loadFav(fav.address)} className="group flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-full px-3 py-1.5 hover:border-blue-500/50 hover:bg-slate-800 transition cursor-pointer select-none">
                                <span className="text-[11px] text-slate-300 font-medium">{fav.nickname}</span>
                                <button onClick={(e) => { e.stopPropagation(); removeFavorite(fav.address); }} className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition"><Trash2 size={11} /></button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </section>

        {report && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Hero Section */}
            <div className="lg:col-span-12 bg-[#0a0a0a] border border-slate-800 rounded-2xl p-6 relative overflow-hidden shadow-2xl">
               <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-blue-600/5 rounded-full blur-[100px] pointer-events-none"></div>
               <div className="flex flex-col md:flex-row gap-6 relative z-10">
                  <div className="flex justify-between md:block">
                      <div className="flex gap-5 shrink-0">
                          {(() => {
                              const s = getScoreStyle(report.risk.score);
                              return (
                                <div className={`flex flex-col items-center justify-center w-24 h-24 md:w-28 md:h-28 rounded-xl border ${s.bg} ${s.border} ${s.color} shrink-0`}>
                                    <div className="flex items-baseline"><span className="text-3xl md:text-4xl font-bold font-mono">{report.risk.score}</span><span className="text-sm opacity-60 font-mono ml-0.5">/100</span></div>
                                    <span className="text-[10px] opacity-80 uppercase mt-1 font-bold text-center leading-tight px-1">{D.riskScore}</span>
                                </div>
                              )
                          })()}
                      </div>
                      
                      <div className="md:hidden text-right">
                          <div className="text-xs text-slate-500 uppercase">{D.netWorth}</div>
                          <div className="text-xl font-bold text-white font-mono">{formatMoney(report.assets.totalValue, lang)}</div>
                      </div>
                  </div>

                  <div className="flex-1 space-y-4 min-w-0">
                      <div>
                          <div className="flex flex-col md:flex-row md:items-center justify-between mb-2 gap-2">
                             <h1 className="text-lg md:text-2xl font-bold text-white font-mono truncate w-full tracking-tight leading-tight">{report.address}</h1>
                             
                             {/* ✅ 3. 已移除生成报告卡片按钮 */}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs px-2 py-0.5 rounded bg-slate-900 border border-slate-800 flex items-center gap-1 text-slate-300">
                                  {report.identity.isContract ? <Activity size={12} /> : <Wallet size={12} />}
                                  {report.identity.isContract ? D.contract : D.wallet}
                              </span>
                              <span className="text-xs px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
                                  {getTrans(report.risk.personaType, lang)}
                              </span>
                              <div className="flex gap-1 ml-1 text-slate-500">
                                  <button onClick={() => navigator.clipboard.writeText(report.address)} className="p-1 hover:text-white transition"><Copy size={14} /></button>
                                  <button onClick={() => setShowNickModal(true)} className={`p-1 transition ${isFav?'text-amber-400':'hover:text-amber-400'}`}><Star size={14} fill={isFav?"currentColor":"none"} /></button>
                                  <a href={`https://etherscan.io/address/${report.address}`} target="_blank" className="p-1 hover:text-white transition"><ExternalLink size={14} /></a>
                              </div>
                          </div>
                      </div>

                      <div className="p-3 bg-slate-900/40 rounded-lg border border-slate-800/50 text-xs md:text-sm text-slate-300 leading-relaxed font-sans">
                         <span className="text-blue-400 font-bold mr-2">⚡️ Insight:</span>{getSummaryText()}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2">
                         <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/30 rounded border border-slate-800/50">
                            <Calendar size={14} className="text-blue-500 shrink-0" />
                            <div className="min-w-0">
                               <div className="text-[10px] text-slate-500 uppercase truncate">{D.walletAge}</div>
                               <div className="text-sm font-mono font-bold truncate">
                                   {calculateWalletAge(report.identity.createdAt, lang)}
                               </div>
                            </div>
                         </div>
                         <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/30 rounded border border-slate-800/50">
                            <Zap size={14} className="text-yellow-500 shrink-0" /><div className="min-w-0"><div className="text-[10px] text-slate-500 uppercase truncate">{D.metricTx}</div><div className="text-sm font-mono font-bold truncate">{report.activity.txCount}</div></div>
                         </div>
                         <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/30 rounded border border-slate-800/50">
                            <Flame size={14} className="text-orange-500 shrink-0" /><div className="min-w-0"><div className="text-[10px] text-slate-500 uppercase truncate">{D.metricGas}</div><div className="text-sm font-mono font-bold truncate">{formatMoney(report.gas.totalGasUsd, lang)}</div></div>
                         </div>
                         <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/30 rounded border border-slate-800/50">
                            <Layers size={14} className="text-purple-500 shrink-0" /><div className="min-w-0"><div className="text-[10px] text-slate-500 uppercase truncate">{D.metricInteract}</div><div className="text-sm font-mono font-bold truncate">{report.activity.contractsInteracted}</div></div>
                         </div>
                      </div>
                  </div>

                  <div className="hidden md:block text-right min-w-[120px]">
                      <div className="text-[11px] text-slate-500 uppercase tracking-widest mb-1">{D.netWorth}</div>
                      <div className="text-3xl font-bold text-white font-mono tracking-tight">{formatMoney(report.assets.totalValue, lang)}</div>
                      <div className="text-[11px] text-slate-400 mt-2 font-mono">{D.firstActive}: {report.identity.createdAt ? new Date(report.identity.createdAt).toLocaleDateString() : D.unknownDate}</div>
                  </div>
               </div>
            </div>

            <div className="lg:col-span-7 space-y-5">
                {report.approvals && <ApprovalsCard approvals={report.approvals} lang={lang} />}
                
                {report.activity.topCounterparties && <CounterpartyCard data={report.activity.topCounterparties} lang={lang} />}
                
                {/* 💰 变现模块：OneKey (收银台 1) */}
                <div className="mb-5 bg-gradient-to-r from-slate-900 to-slate-900/50 border border-emerald-500/30 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-500/20 rounded-lg">
                            <ShieldAlert className="text-emerald-400" size={20} />
                        </div>
                        <div>
                            <h4 className="text-sm font-bold text-slate-200">
                                {lang === 'cn' ? '彻底防止被盗？' : 'Maximum Security?'}
                            </h4>
                            <div className="text-xs text-slate-400 mt-1 space-y-0.5">
                                <p>{lang === 'cn' ? '推荐使用 OneKey 硬件钱包，物理隔绝黑客。' : 'Use OneKey Hardware Wallet.'}</p>
                                <p className="text-emerald-400 font-mono font-bold">
                                    {lang === 'cn' ? '🎁 邀请码: JANMCM' : '🎁 Code: JANMCM'}
                                </p>
                            </div>
                        </div>
                    </div>
                    <a 
                        href="https://onekey.so/r/JANMCM" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition text-center shadow-lg shadow-emerald-500/20 whitespace-nowrap flex flex-col items-center justify-center"
                    >
                        <span>{lang === 'cn' ? '购买 OneKey' : 'Get OneKey'}</span>
                    </a>
                </div>

                {/* 💰 变现模块：VPN (收银台 2) - 紧挨着 OneKey */}
                <div className="mb-5 bg-gradient-to-r from-slate-900 to-slate-900/50 border border-blue-500/30 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/20 rounded-lg">
                            <Wifi className="text-blue-400" size={20} />
                        </div>
                        <div>
                            <h4 className="text-sm font-bold text-slate-200">
                                {lang === 'cn' ? '网络卡顿？链上交互慢？' : 'Network Lag?'}
                            </h4>
                            <div className="text-xs text-slate-400 mt-1 space-y-0.5">
                                <p>{lang === 'cn' ? 'liltpupu 加速器，Web3 专用高速节点。' : 'Fast & Stable Web3 Accelerator.'}</p>
                                <p className="text-blue-400 font-mono font-bold">
                                    {lang === 'cn' ? '🎁 邀请码: X4D4CNij' : '🎁 Code: X4D4CNij'}
                                </p>
                            </div>
                        </div>
                    </div>
                    <a 
                        href="https://training.lilt-pupu.cc/#/register?code=X4D4CNij" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition text-center shadow-lg shadow-blue-500/20 whitespace-nowrap flex flex-col items-center justify-center"
                    >
                         <span>{lang === 'cn' ? '获取加速器' : 'Get Access'}</span>
                    </a>
                </div>

                <div className="relative">
                    <AssetTable assets={report.assets} lang={lang} />
                    <div className="mt-2 text-[10px] text-slate-600 text-right font-mono italic">{D.assetDisclaimer}</div>
                </div>
            </div>

            <div className="lg:col-span-5 flex flex-col gap-5">
                <div className="flex-1"><RealTransactionFeed txs={report.activity.recentTxs} address={report.address} lang={lang} /></div>
                <a href={TG_CHANNEL_URL} target="_blank" className="block p-5 rounded-xl border border-blue-600/30 bg-gradient-to-br from-blue-900/20 to-black hover:border-blue-500/50 transition group">
                    <div className="flex justify-between items-center mb-2">
                        <h4 className="font-bold text-blue-400 text-sm">Upgrade to PRO</h4>
                        <ArrowUpRight size={16} className="text-blue-500 group-hover:translate-x-1 group-hover:-translate-y-1 transition" />
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{lang === 'cn' ? '解锁完整资金流向图谱、无限期交易历史与实时巨鲸异动推送。' : 'Unlock full fund flow graph, unlimited history and real-time whale alerts.'}</p>
                </a>
            </div>
          </div>
        )}

        {showNickModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <div className="bg-[#111] border border-slate-800 rounded-xl p-6 w-full max-w-sm shadow-2xl">
                    <h3 className="text-lg font-bold text-white mb-4">{D.setNickname}</h3>
                    <input autoFocus value={tempNick} onChange={e => setTempNick(e.target.value)} placeholder="e.g. Smart Money / Hacker..." className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-sm text-white outline-none focus:border-blue-500 mb-6" />
                    <div className="flex gap-3">
                        <button onClick={() => setShowNickModal(false)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 rounded-lg text-sm font-medium transition">{D.cancel}</button>
                        <button onClick={saveFavorite} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-lg text-sm font-medium transition">{D.confirm}</button>
                    </div>
                </div>
            </div>
        )}
        
        <footer className="mt-12 py-8 border-t border-slate-900 text-center space-y-4">
            <div className="flex items-center justify-center gap-6">
                <a href={TWITTER_URL} target="_blank" className="text-slate-500 hover:text-white transition flex items-center gap-1.5 text-xs"><Twitter size={14} /> Twitter (X)</a>
                <a href={TG_CHANNEL_URL} target="_blank" className="text-slate-500 hover:text-white transition flex items-center gap-1.5 text-xs"><Send size={14} /> Telegram</a>
            </div>
            <p className="text-[10px] text-slate-600 font-mono">© 2025 WalletAudit. All On-chain Data provided by Etherscan & Alchemy.</p>
        </footer>
      </div>
    </main>
  );
}