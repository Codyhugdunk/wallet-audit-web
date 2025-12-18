import { DICT, getTrans } from "../../utils/dictionary";
import { formatMoney } from "../../utils/format";

// 简单的类型定义，防止 TS 报错
interface ShareReport {
    risk: { score: number; personaType: string };
    address: string;
    assets: { totalValue: number };
    approvals?: { riskCount: number };
}

// ✅ 修复版：无 Tailwind，纯 CSS，绝对防报错
export function ShareCardView({ report, lang, targetRef }: { report: ShareReport, lang: 'cn'|'en', targetRef: any }) {
    const D = DICT[lang];
    const score = report.risk.score;
    const isSafe = score >= 80;
    
    const bgMain = '#0a0a0a'; 
    const textWhite = '#ffffff';
    const textMuted = '#94a3b8'; 
    const accentColor = isSafe ? '#34d399' : score <= 50 ? '#f87171' : '#fbbf24'; 
    const bgCard = '#171717';
    const borderCard = '#262626';

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, zIndex: -9999, opacity: 0, pointerEvents: 'none' }}>
            <div ref={targetRef} data-share-card style={{ width: '400px', backgroundColor: bgMain, padding: '24px', fontFamily: 'Arial, sans-serif', border: '1px solid #333', borderRadius: '16px', position: 'relative', display: 'flex', flexDirection: 'column', gap: '24px', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '6px', backgroundColor: accentColor }}></div>
                
                {/* Header: 纯 SVG 图标，无 className */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', position: 'relative', zIndex: 10 }}>
                    <div style={{ fontSize: '20px', fontWeight: '900', color: textWhite, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path>
                        </svg>
                        WalletAudit
                    </div>
                    <div style={{ fontSize: '12px', color: textMuted }}>{new Date().toLocaleDateString()}</div>
                </div>

                <div style={{ textAlign: 'center', padding: '20px 0', borderBottom: '1px solid #333', position: 'relative', zIndex: 10 }}>
                    <div style={{ fontSize: '12px', color: textMuted, textTransform: 'uppercase', marginBottom: '8px' }}>{D.riskScore}</div>
                    <div style={{ fontSize: '64px', fontWeight: 'bold', color: accentColor, lineHeight: '1' }}>{score}</div>
                    <div style={{ marginTop: '16px', display: 'inline-block', padding: '6px 16px', borderRadius: '99px', backgroundColor: '#1e293b', color: '#e2e8f0', fontSize: '12px', border: '1px solid #334155' }}>
                        {getTrans(report.risk.personaType, lang)}
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', position: 'relative', zIndex: 10 }}>
                    <div style={{ backgroundColor: bgCard, padding: '16px', borderRadius: '12px', border: `1px solid ${borderCard}` }}>
                        <div style={{ fontSize: '10px', color: textMuted, textTransform: 'uppercase' }}>{D.netWorth}</div>
                        <div style={{ fontSize: '20px', fontWeight: 'bold', color: textWhite, marginTop: '4px' }}>{formatMoney(report.assets.totalValue, lang)}</div>
                    </div>
                    <div style={{ backgroundColor: bgCard, padding: '16px', borderRadius: '12px', border: `1px solid ${borderCard}` }}>
                        <div style={{ fontSize: '10px', color: textMuted, textTransform: 'uppercase' }}>{D.riskCount}</div>
                        <div style={{ fontSize: '20px', fontWeight: 'bold', color: report.approvals && report.approvals.riskCount > 0 ? '#f87171' : accentColor, marginTop: '4px' }}>
                            {report.approvals ? report.approvals.riskCount : 0}
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', position: 'relative', zIndex: 10 }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '10px', color: textMuted }}>{D.scanToUse}</span>
                        <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#60a5fa' }}>walletaudit.me</span>
                    </div>
                    <div style={{ width: '48px', height: '48px', backgroundColor: 'white', borderRadius: '4px', padding: '4px' }}>
                        <div style={{ width: '100%', height: '100%', backgroundColor: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: '8px', color: 'white', fontWeight: 'bold' }}>QR</span></div>
                    </div>
                </div>
            </div>
        </div>
    )
}