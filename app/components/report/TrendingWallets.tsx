import { useState } from "react";
import { Flame } from "lucide-react";
import { DICT } from "../../utils/dictionary"; // ✅ 引入字典

// 热门地址库
const HOT_WALLETS = [
  { name: "Vitalik", address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", tag: "💎 V神", category: "Whales" },
  { name: "Justin Sun", address: "0x3DdfA8eC3052539b6C9549F12cEA2C295cfF5296", tag: "🐋 孙宇晨", category: "Whales" },
  { name: "Trump", address: "0x94845333028B1204Fbe14E1278Fd4Adde4660273", tag: "🇺🇸 特朗普", category: "Whales" },
  { name: "Satoshi (ETH)", address: "0x0000000000000000000000000000000000000000", tag: "👑 创世", category: "Whales" },
  { name: "Wintermute", address: "0xdbf5e9c5206d0db70a90108bf936da60221dc080", tag: "🏦 做市商", category: "Institutions" },
  { name: "Jump Trading", address: "0xf584f8728b874a6a5c7a8d4d387c9aae9172d621", tag: "🏦 机构", category: "Institutions" },
  { name: "Paradigm", address: "0x6E0d01A76C3Cf4288372a29124A26D4353EE51BE", tag: "💰 VC", category: "Institutions" },
  { name: "Binance Hot", address: "0x28C6c06298d514Db089934071355E5743bf21d60", tag: "🔶 币安", category: "Institutions" },
  { name: "Ronin Hacker", address: "0x098B716B8Aaf21512996dC57EB0615e2383E2f96", tag: "☠️ 黑客", category: "Risk" },
  { name: "FTX Drainer", address: "0x59ABf3837Fa963d69c5468e492D581013164939F", tag: "🚨 FTX", category: "Risk" },
  { name: "Poloniex Hack", address: "0x3A8F5374544dD790938f3227d69C894F06723698", tag: "🚨 被盗", category: "Risk" },
  { name: "Curve Exploiter", address: "0xB90DE7426798C7D47a36323E2503911Df5487814", tag: "☠️ 攻击者", category: "Risk" },
  { name: "SHIB Whale", address: "0x1406899696aDb2fA7a95eA68e80D4f9C82FCDeDd", tag: "🐕 SHIB", category: "Degen" },
  { name: "Pepe Dev", address: "0x2af0b215e078f8d85241daf8d6e732f602569263", tag: "🐸 PEPE", category: "Degen" },
  { name: "Machi BigBrother", address: "0x020cA66C30beC2c4Fe3861a94E4DB4A498A35872", tag: "🖼️ 麻吉", category: "Degen" },
  { name: "Franklin", address: "0x4D9720023023E3E0d338a95697B7D50f3B646D08", tag: "🦍 BAYC", category: "Degen" },
];

// ✅ 核心修复：添加了 lang 参数，并定义了类型
export function TrendingWallets({ onLoad, title, lang }: { onLoad: (addr: string) => void, title: string, lang: 'cn' | 'en' }) {
  const [activeTab, setActiveTab] = useState("Whales");
  const D = DICT[lang];

  // 定义分类标签 (支持多语言)
  const categories = [
    { key: "Whales", label: D.catWhales },
    { key: "Institutions", label: D.catInstitutions },
    { key: "Risk", label: D.catRisk },
    { key: "Degen", label: D.catDegen },
  ];

  const list = HOT_WALLETS.filter(w => w.category === activeTab);

  return (
    <div className="px-1 space-y-3">
        {/* Header & Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-slate-400 font-bold">
                <Flame size={16} className="text-orange-500" /> {title}
            </div>
            
            {/* 分类标签栏 */}
            <div className="flex bg-slate-900/80 p-1 rounded-lg border border-slate-800 self-start sm:self-auto overflow-x-auto max-w-full no-scrollbar">
                {categories.map(cat => (
                    <button
                        key={cat.key}
                        onClick={() => setActiveTab(cat.key)}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition whitespace-nowrap ${
                            activeTab === cat.key 
                            ? "bg-slate-800 text-white shadow-sm border border-slate-700" 
                            : "text-slate-500 hover:text-slate-300"
                        }`}
                    >
                        {cat.label}
                    </button>
                ))}
            </div>
        </div>

        {/* 列表网格 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {list.map(w => (
                <button 
                    key={w.address} 
                    onClick={() => onLoad(w.address)} 
                    className="flex flex-col items-start gap-1 p-3 bg-[#0f0f0f] border border-slate-800 hover:border-slate-600 hover:bg-slate-900 rounded-xl transition text-left group"
                >
                    <div className="flex items-center justify-between w-full">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                            w.category === "Risk" ? "bg-red-950/40 text-red-400 border border-red-900/30" : 
                            w.category === "Institutions" ? "bg-blue-950/40 text-blue-400 border border-blue-900/30" :
                            "bg-slate-800 text-slate-400 border border-slate-700"
                        }`}>
                            {w.tag}
                        </span>
                    </div>
                    <span className="text-sm font-medium text-slate-300 group-hover:text-white truncate w-full">
                        {w.name}
                    </span>
                    <span className="text-[10px] text-slate-600 font-mono truncate w-full">
                        {w.address.slice(0, 6)}...{w.address.slice(-4)}
                    </span>
                </button>
            ))}
        </div>
    </div>
  );
}