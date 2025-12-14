// app/api/report/modules/summary.ts — WalletAudit v1.1 (UTF-8)
// 基于 identity / assets / activity / risk 生成一段可读性强的钱包概要文本 + 人格类型

import {
  IdentityInfo,
  AssetModule,
  ActivityModule,
  RiskModule,
  SummaryModule,
} from "./types";

function trimZero(numStr: string): string {
  return numStr.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

// ✅ 你喜欢的中文金额表达：优先 “万美元/亿”
// - 不要 “xxx百万/xxx千万/xxx千美元” 这种英文式
function formatUsd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "接近 0 美元";

  if (value < 1_000) return `${trimZero(value.toFixed(2))} 美元`;
  if (value < 10_000) return `${Math.round(value)} 美元`;

  // 以 “万美元” 为主表达
  const wanUsd = value / 10_000;
  if (wanUsd < 10_000) {
    // 1 万美元 ~ 9999 万美元
    return `${trimZero(wanUsd.toFixed(2))} 万美元`;
  }

  // 亿美元
  const yiUsd = wanUsd / 10_000;
  return `${trimZero(yiUsd.toFixed(2))} 亿美元`;
}

function ratioToText(ratio: number): string {
  if (ratio <= 0.01) return "占比极低";
  if (ratio <= 0.1) return "占比较小";
  if (ratio <= 0.3) return "占比适中";
  if (ratio <= 0.6) return "占比较高";
  return "占比极高";
}

function riskLevelToText(level: string): string {
  if (level === "Low") return "整体风险水平偏低";
  if (level === "Medium") return "整体风险水平中等";
  return "整体风险水平偏高";
}

function formatAge(createdAt: number | null): string {
  if (!createdAt) return "创建时间暂不可确定";

  const now = Date.now();
  const diffDays = Math.max(
    1,
    Math.floor((now - createdAt) / (24 * 3600 * 1000))
  );

  if (diffDays < 7) return `创建于最近 ${diffDays} 天内`;
  if (diffDays < 30) return `创建于最近 ${Math.floor(diffDays / 7)} 周内`;
  if (diffDays < 365) return `创建于 ${Math.floor(diffDays / 30)} 个月前`;
  return `创建于约 ${Math.floor(diffDays / 365)} 年前`;
}

export function buildSummaryModule(
  identity: IdentityInfo,
  assets: AssetModule,
  activity: ActivityModule,
  risk: RiskModule
): SummaryModule {
  const { isContract, createdAt } = identity;
  const { totalValue, allocation } = assets;
  const { txCount, activeDays, contractsInteracted } = activity;
  const { level, score, stableRatio, memeRatio, personaType } = risk;

  const totalValueText = formatUsd(totalValue);
  const ageText = formatAge(createdAt);

  const stableText = ratioToText(stableRatio);
  const memeText = ratioToText(memeRatio);
  const riskText = riskLevelToText(level);

  const typeText = isContract ? "合约地址" : "普通钱包地址";

  const activityText =
    txCount === 0
      ? "近期几乎没有主动交易行为。"
      : `在最近的链上记录中共发起约 ${txCount} 笔交易，分布在 ${activeDays} 个活跃日里，涉及 ${contractsInteracted} 个不同的交互对象。`;

  const summaryParts: string[] = [];

  summaryParts.push(
    `这是一个${typeText}，${ageText}。当前钱包在以太坊主网上的总资产规模约为 ${totalValueText}，整体偏向「${personaType}」。`
  );

  // 资产结构
  const ethAlloc = allocation.find((x) => x.category === "ETH");
  const stableAlloc = allocation.find((x) => x.category === "Stablecoins");
  const memeAlloc = allocation.find((x) => x.category === "Meme");

  const structPieces: string[] = [];

  if (ethAlloc && ethAlloc.value > 0) {
    structPieces.push(
      `其中 ETH 仓位占整体资产的 ${trimZero((ethAlloc.ratio * 100).toFixed(1))}% 左右`
    );
  }

  if (stableAlloc && stableAlloc.value > 0) {
    structPieces.push(
      `稳定币仓位 ${stableText}（约 ${trimZero((stableAlloc.ratio * 100).toFixed(1))}%）`
    );
  }

  if (memeAlloc && memeAlloc.value > 0) {
    structPieces.push(
      `Meme 等高波动代币仓位 ${memeText}（约 ${trimZero((memeAlloc.ratio * 100).toFixed(1))}%）`
    );
  }

  if (structPieces.length) {
    summaryParts.push("从资产结构来看，" + structPieces.join("，") + "。");
  }

  summaryParts.push(`从近期行为上看，${activityText}`);

  summaryParts.push(
    `综合资产结构与交易活跃度，系统给出的风险评分为 ${score} / 100，${riskText}。`
  );

  return { text: summaryParts.join("") };
}