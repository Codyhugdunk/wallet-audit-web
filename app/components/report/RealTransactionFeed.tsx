import { 
  Activity, ArrowUpRight, ArrowDownRight, Clock, AlertCircle, Zap, ExternalLink, Lock 
} from "lucide-react";
import { DICT } from "../../utils/dictionary";
import { formatTimeAgo, formatEth } from "../../utils/format";

const TG_CHANNEL_URL = "https://t.me/walletaudit";

export interface RecentTx { 
  hash: string; 
  timestamp: number; 
  from: string; 
  to: string; 
  value: string; 
  isError: string; 
  gasUsed: string; 
  functionName?: string; 
}

export function RealTransactionFeed({ txs, address, lang }: { txs: RecentTx[], address: string, lang: 'cn' | 'en' }) {
  const D = DICT[lang];
  
  const FREE_LIMIT = 8;
  const visibleTxs = (txs || []).slice(0, FREE_LIMIT);
  const hasMore = (txs || []).length > FREE_LIMIT;

  if (!txs || txs.length === 0) return (
        <div className="bg-[#0a0a0a] border border-slate-800 rounded-xl p-8 flex flex-col items-center justify-center text-slate-500 h-full min-h-[400px]">
            <Activity size={32} className="opacity-20 mb-2" />
            <span className="text-xs">{D.noTxs}</span>
        </div>
  );

  return (
    <div className="bg-[#0a0a0a] border border-slate-800 rounded-xl overflow-hidden flex flex-col h-full min-h-[400px] relative">
       <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/30">
          <h3 className="font-bold text-slate-200 text-sm flex items-center gap-2">
            <Activity size={14} className="text-blue-500" /> {D.recentActivity}
          </h3>
       </div>
       
       <div className="flex-1 overflow-y-auto custom-scrollbar p-0 pb-16">
          {visibleTxs.map((tx, idx) => {
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
                      <span className="text-[10px] text-slate-500 flex items-center gap-1">
                        <Clock size={10} /> {formatTimeAgo(tx.timestamp * 1000, lang)}
                      </span>
                   </div>
                   <div className="text-[10px] text-slate-500 font-mono truncate">
                     {isIn ? `From: ${tx.from.slice(0,6)}...` : `To: ${tx.to?.slice(0,6)}...`}
                   </div>
                </div>

                <div className="text-right min-w-[70px]">
                   <div className={`text-xs font-mono ${isZero ? 'text-slate-600' : 'text-slate-200 font-medium'}`}>
                     {isZero ? 'Interaction' : `${formatEth(tx.value)} ETH`}
                   </div>
                </div>
                
                <a href={`https://etherscan.io/tx/${tx.hash}`} target="_blank" className="text-slate-600 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition">
                  <ExternalLink size={12} />
                </a>
             </div>
             )
          })}
       </div>

       {hasMore && (
           <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/95 to-transparent flex flex-col items-center justify-end pb-6 z-10">
               <div className="text-center space-y-3 px-4">
                   <p className="text-xs text-slate-400 font-medium">
                       {lang === 'cn' ? `还有 ${txs.length - FREE_LIMIT} 条历史交易记录...` : `+${txs.length - FREE_LIMIT} more transactions...`}
                   </p>
                   <a 
                       href={TG_CHANNEL_URL} 
                       target="_blank"
                       className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-6 py-2.5 rounded-full shadow-lg shadow-blue-900/40 transition transform hover:scale-105"
                   >
                       <Lock size={12} />
                       {lang === 'cn' ? '加入社区解锁完整记录' : 'Join to Unlock Full History'}
                   </a>
               </div>
           </div>
       )}
    </div>
  );
}