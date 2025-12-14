// app/api/report/modules/summary.ts
// ✅ v1.1 — Summary module (stable compile)

import type {
  IdentityModule,
  AssetModule,
  ActivityModule,
  RiskModule,
  SummaryModule,
} from "./types";

function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(2) + "K";
  return n.toFixed(2);
}

export function buildSummaryModule(
  identity: IdentityModule,
  assets: AssetModule,
  activity: ActivityModule,
  risk: RiskModule
): SummaryModule {
  const yearsText =
    identity.createdAt ? `创建于约 ${Math.max(0, Math.round((Date.now() - identity.createdAt) / (365 * 24 * 3600 * 1000)))} 年前` : "创建时间暂不可确定";

  const totalUsd = assets.totalValue || 0;

  const ethItem = assets.allocation.find((a) => a.category === "ETH");
  const ethRatio = ethItem ? ethItem.ratio : 0;

  const stableItem = assets.allocation.find((a) => a.category === "Stablecoins");
  const stableRatio = stableItem ? stableItem.ratio : 0;

  const text =
    `这是一个${identity.isContract ? "合约" : "普通"}地址，${yearsText}。` +
    `当前主网资产规模约 $${fmtUsd(totalUsd)}，整体偏向「${risk.personaType}」。` +
    `资产结构上，ETH 仓位约 ${(ethRatio * 100).toFixed(1)}%，稳定币约 ${(stableRatio * 100).toFixed(1)}%。` +
    `近期链上记录共发起约 ${activity.txCount} 笔交易，涉及 ${activity.contractsInteracted} 个交互对象，系统风险评分 ${risk.score} / 100（${risk.level}）。`;

  return { text };
}

export default buildSummaryModule;