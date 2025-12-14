// app/api/report/modules/summary.ts
import type { IdentityModule, AssetsModule, ActivityModule, RiskModule, SummaryModule } from "./types";

function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(2) + "K";
  return n.toFixed(2);
}

export function buildSummaryModule(
  identity: IdentityModule,
  assets: AssetsModule,
  activity: ActivityModule,
  risk: RiskModule
): SummaryModule {
  const yearsText = identity.createdAt ? `创建于约 ${Math.max(0, Math.round((Date.now() - identity.createdAt) / (365 * 24 * 3600 * 1000)))} 年前` : "创建时间暂不可确定";
  const ethItem = assets.allocation.find((a) => a.category === "ETH");
  const stableItem = assets.allocation.find((a) => a.category === "Stablecoins");
  
  const text = `这是一个${identity.isContract ? "合约" : "普通"}地址，${yearsText}。` +
    `当前资产规模约 $${fmtUsd(assets.totalValue)}，整体偏向「${risk.personaType}」。` +
    `ETH 仓位约 ${(ethItem?.ratio ?? 0 * 100).toFixed(1)}%，稳定币约 ${(stableItem?.ratio ?? 0 * 100).toFixed(1)}%。` +
    `近期链上记录共发起约 ${activity.txCount} 笔交易，系统风险评分 ${risk.score}/100。`;

  return { text };
}