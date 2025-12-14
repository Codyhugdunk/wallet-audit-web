// app/api/report/modules/risk.ts
// WalletAudit Pro - Advanced Risk Quant Model

import type { AssetModule, ActivityModule, RiskModule } from "./types";

// ==========================================
// 1. 金融数学模型工具函数
// ==========================================

function calculateHHI(allocation: { ratio: number }[]): number {
  return allocation.reduce((sum, item) => sum + Math.pow(item.ratio * 100, 2), 0);
}

function calculateDegenIndex(memeRatio: number, otherRatio: number, txCount: number): number {
  let rawRisk = (memeRatio * 1.5 + otherRatio * 1.0) * 100;
  const frequencyMultiplier = txCount > 500 ? 1.2 : 1.0;
  return Math.min(rawRisk * frequencyMultiplier, 100);
}

function calculateWealthScore(totalUsd: number): number {
  if (totalUsd <= 1) return 0;
  return Math.log10(totalUsd);
}

// ==========================================
// 2. 核心画像生成逻辑
// ==========================================

function generatePersona(
  hhi: number,
  degenIndex: number,
  wealthScore: number,
  activeDays: number
): { type: string; tags: string[] } {
  const tags: string[] = [];
  
  if (wealthScore >= 7) tags.push("🐋 顶级巨鲸");
  else if (wealthScore >= 6) tags.push("🦈 聪明钱大户");
  else if (wealthScore >= 5) tags.push("🐬 中产阶级");
  else if (wealthScore <= 3) tags.push("🦐 链上小虾米");

  if (hhi > 5000) tags.push("🎲 单币梭哈者");
  else if (hhi < 1500) tags.push("🏦 指数化配置");

  if (degenIndex > 80) tags.push("🔥 链上赌徒");
  else if (degenIndex < 10) tags.push("🛡️ 风险厌恶者");

  if (activeDays > 365) tags.push("⏳ 钻石手老兵");
  if (activeDays < 7 && wealthScore > 4) tags.push("⚡ 突击新钱包");

  let type = "普通链上用户";

  if (wealthScore >= 6 && hhi < 2000) type = "机构级做市商/基金";
  else if (wealthScore >= 5 && degenIndex > 60) type = "金狗猎人 (Golden Dog Hunter)";
  else if (degenIndex > 90) type = "高危 Degen 玩家";
  else if (hhi > 8000) type = "信仰持仓者 (Maxi)";
  else if (wealthScore < 3 && degenIndex < 20) type = "链上观光客";

  return { type, tags };
}

// ==========================================
// 3. 风险模块主导出
// ==========================================

export function buildRiskModule(
  assets: AssetModule,
  activity: ActivityModule
): RiskModule {
  const total = assets.totalValue;

  // ✅ 核心修复：把字符串 "20+" 转回数字 20，如果是数字则保持不变
  const txNum = typeof activity.txCount === 'string' 
    ? parseInt(activity.txCount.replace(/\D/g, '')) || 0 
    : activity.txCount;

  let stableRatio = 0;
  let memeRatio = 0;
  let majorRatio = 0;

  for (const item of assets.allocation) {
    if (item.category === "Stablecoins") stableRatio += item.ratio;
    else if (item.category === "Meme") memeRatio += item.ratio;
    else if (item.category === "Majors") majorRatio += item.ratio;
  }
  
  let otherRatio = 1 - stableRatio - memeRatio - majorRatio;
  if (otherRatio < 0) otherRatio = 0;

  const hhi = calculateHHI(assets.allocation);
  // 现在这里传入的是 txNum (number)，不会报错了
  const degenIndex = calculateDegenIndex(memeRatio, otherRatio, txNum);
  const wealthScore = calculateWealthScore(total);

  let score = 100;
  score -= degenIndex * 0.8; 
  if (hhi > 5000 && stableRatio < 0.8) score -= 15;
  if (wealthScore > 5) score += 10;
  score = Math.max(0, Math.min(100, Math.round(score)));

  let level: "Low" | "Medium" | "High" = "Medium";
  if (score >= 80) level = "Low";
  else if (score <= 40) level = "High";

  let comment = "";
  if (total < 10) {
    comment = "钱包空置或仅有微量残余资产。";
  } else if (degenIndex > 70) {
    comment = `⚠️ 高危预警：资产高度集中于 Meme (Degen指数: ${degenIndex.toFixed(0)})。`;
  } else if (hhi > 6000 && stableRatio > 0.9) {
    comment = "🛡️ 避险模式：资金极度集中于稳定币。";
  } else if (score > 80) {
    comment = "✅ 稳健模型：资产配置多元化且持有大量蓝筹。";
  } else {
    comment = "⚖️ 均衡风险：在追求收益与安全之间保持了平衡。";
  }

  const { type, tags } = generatePersona(hhi, degenIndex, wealthScore, activity.activeDays || 0);

  return {
    level,
    score,
    comment,
    stableRatio,
    memeRatio,
    otherRatio,
    txCount: activity.txCount,
    personaType: type,
    personaTags: tags,
    metrics: {
      hhi,
      degenIndex,
      wealthScore
    }
  };
}

export default buildRiskModule;