import { ShieldAlert, Lock, ExternalLink } from "lucide-react";
import { DICT } from "../../utils/dictionary";

interface ApprovalItem { token: string; spender: string; spenderName: string; amount: string; riskLevel: string; }
interface ApprovalsModule { riskCount: number; items: ApprovalItem[] }

export function ApprovalsCard({ approvals, lang }: { approvals: ApprovalsModule, lang: 'cn' | 'en' }) {
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