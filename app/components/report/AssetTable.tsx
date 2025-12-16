import { Wallet } from "lucide-react";
import { useMemo } from "react";
import { DICT } from "../../utils/dictionary";
import { formatMoney } from "../../utils/format";

interface TokenBalance { contractAddress: string; symbol: string; amount: number; value: number; decimals: number; hasPrice: boolean; }
interface Assets { eth: { value: number; amount: number }; tokens: TokenBalance[]; totalValue: number; }

export function AssetTable({ assets, lang }: { assets: Assets, lang: 'cn'|'en' }) {
    const D = DICT[lang];
    const allAssets = useMemo(() => {
      const list = [
        { symbol: "ETH", address: "", amount: assets.eth.amount, value: assets.eth.value, ratio: assets.totalValue > 0 ? assets.eth.value / assets.totalValue : 0 },
        ...assets.tokens.map(t => ({ symbol: t.symbol, address: t.contractAddress, amount: t.amount, value: t.value, ratio: assets.totalValue > 0 ? t.value / assets.totalValue : 0 }))
      ];
      return list.filter(a => a.value > 1).sort((a, b) => b.value - a.value);
    }, [assets]);
  
    return (
      <div className="bg-[#0a0a0a] border border-slate-800 rounded-xl p-5">
        <h3 className="font-bold text-slate-200 text-sm mb-4 flex items-center gap-2">
            <Wallet size={16} className="text-blue-500" /> {D.assetsTitle}
        </h3>
        <div className="w-full space-y-2">
            <div className="grid grid-cols-12 text-[10px] text-slate-500 uppercase tracking-wider px-2 font-medium">
            <div className="col-span-4">{D.assetHeader}</div>
            <div className="col-span-3 text-right">{D.priceHeader}</div>
            <div className="col-span-3 text-right">{D.valueHeader}</div>
            <div className="col-span-2 text-right">{D.allocHeader}</div>
            </div>
            <div className="space-y-1 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
            {allAssets.map((item: any, idx: number) => (
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
      </div>
    )
}