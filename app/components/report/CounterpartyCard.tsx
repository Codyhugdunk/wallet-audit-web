import { Users, ArrowUpRight } from "lucide-react";
import { DICT } from "../../utils/dictionary";

interface Counterparty {
  address: string;
  count: number;
  label?: string;
  lastInteraction: number;
}

export function CounterpartyCard({ data, lang }: { data: Counterparty[], lang: 'cn' | 'en' }) {
  const D = DICT[lang];
  if (!data || data.length === 0) return null;
  
  return (
    <div className="bg-[#0a0a0a] border border-slate-800 rounded-xl p-5">
       <h3 className="font-bold text-slate-200 text-sm mb-4 flex items-center gap-2">
          <Users size={16} className="text-indigo-500" /> {D.cpTitle}
       </h3>
       <div className="space-y-3">
          {data.map((item, idx) => (
             <div key={item.address} className="flex items-center justify-between text-xs p-2 rounded hover:bg-slate-900/50 transition border border-transparent hover:border-slate-800">
                <div className="flex items-center gap-3">
                   <span className="text-slate-600 font-mono w-3 text-center">{idx + 1}</span>
                   <div className="flex flex-col">
                      <span className="text-slate-300 font-medium">
                          {item.label && item.label !== "Unknown" ? item.label : "Unknown Contract"}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                          {item.address.slice(0, 6)}...{item.address.slice(-4)}
                      </span>
                   </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className="bg-indigo-900/30 text-indigo-400 px-1.5 py-0.5 rounded text-[10px] font-mono">
                        {item.count} {D.cpCount}
                    </span>
                    <a href={`https://etherscan.io/address/${item.address}`} target="_blank" className="text-slate-600 hover:text-white">
                        <ArrowUpRight size={12} />
                    </a>
                </div>
             </div>
          ))}
       </div>
    </div>
  );
}