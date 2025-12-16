import { Flame } from "lucide-react";

// 热门地址库
const HOT_WALLETS = [
  { name: "Vitalik", address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", tag: "💎 V神" },
  { name: "Justin Sun", address: "0x3DdfA8eC3052539b6C9549F12cEA2C295cfF5296", tag: "🐋 孙宇晨" },
  { name: "Trump", address: "0x94845333028B1204Fbe14E1278Fd4Adde4660273", tag: "🇺🇸 特朗普" },
  { name: "Wintermute", address: "0xdbf5e9c5206d0db70a90108bf936da60221dc080", tag: "🏦 做市商" },
  { name: "Jump Trading", address: "0xf584f8728b874a6a5c7a8d4d387c9aae9172d621", tag: "🏦 机构" },
  { name: "Paradigm", address: "0x6E0d01A76C3Cf4288372a29124A26D4353EE51BE", tag: "💰 VC" },
  { name: "a16z", address: "0x05Af912CC0781E63038D920Fd423e277329d009C", tag: "💰 VC" },
  { name: "BlackRock", address: "0x13e382A38aC10f044421290D45D8197EE0961443", tag: "🇺🇸 贝莱德" },
  { name: "Ronin Hacker", address: "0x098B716B8Aaf21512996dC57EB0615e2383E2f96", tag: "☠️ 黑客" },
  { name: "FTX Drainer", address: "0x59ABf3837Fa963d69c5468e492D581013164939F", tag: "🚨 FTX" },
  { name: "Poloniex Hack", address: "0x3A8F5374544dD790938f3227d69C894F06723698", tag: "🚨 被盗" },
  { name: "SHIB Whale", address: "0x1406899696aDb2fA7a95eA68e80D4f9C82FCDeDd", tag: "🐕 SHIB" },
  { name: "Pepe Dev", address: "0x2af0b215e078f8d85241daf8d6e732f602569263", tag: "🐸 PEPE" },
  { name: "Machi BigBrother", address: "0x020cA66C30beC2c4Fe3861a94E4DB4A498A35872", tag: "🖼️ 麻吉" },
  { name: "Binance 14", address: "0x28C6c06298d514Db089934071355E5743bf21d60", tag: "🏦 币安" },
  { name: "OKX", address: "0x6cC5F688a315f3dC28A7781717a9a798a59fDA7b", tag: "🏦 OKX" },
];

export function TrendingWallets({ onLoad, title }: { onLoad: (addr: string) => void, title: string }) {
  return (
    <div className="px-2">
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-2 font-medium">
            <Flame size={12} className="text-orange-500" /> {title}
        </div>
        <div className="flex flex-wrap gap-2">
            {HOT_WALLETS.map(w => (
                <button 
                    key={w.address} 
                    onClick={() => onLoad(w.address)} 
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-800 hover:border-slate-600 hover:bg-slate-800 rounded-full transition text-xs group"
                >
                    <span className="text-slate-300 font-medium group-hover:text-white">{w.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded transition ${
                        w.tag.includes("黑客") || w.tag.includes("🚨") ? "bg-red-900/30 text-red-400" : 
                        w.tag.includes("机构") || w.tag.includes("VC") || w.tag.includes("币安") ? "bg-blue-900/30 text-blue-400" :
                        "bg-slate-800 text-slate-500 group-hover:bg-slate-700 group-hover:text-slate-300"
                    }`}>
                        {w.tag}
                    </span>
                </button>
            ))}
        </div>
    </div>
  );
}