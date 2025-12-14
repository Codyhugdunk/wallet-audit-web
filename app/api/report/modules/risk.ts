// app/api/report/modules/risk.ts
// WalletAudit v1.1 — Risk module (named + default export compatible)

import type { AssetModule, ActivityModule, RiskModule } from "./types";

// score >= 70 → Low
// 40 <= score < 70 → Medium
// score < 40 → High
function scoreToLevel(score: number): "Low" | "Medium" | "High" {
  if (score >= 70) return "Low";
  if (score >= 40) return "Medium";
  return "High";
}

function buildPersona(
  total: number,
  stableRatio: number,
  memeRatio: number,
  txCount: number,
  level: "Low" | "Medium" | "High",
  score: number
): { personaType: string; personaTags: string[] } {
  const tags: string[] = [];

  if (stableRatio >= 0.4) tags.push("稳定币占比较高");
  else if (stableRatio <= 0.05 && total > 0) tags.push("稳定币占比较低");

  if (memeRatio >= 0.3) tags.push("高 Meme 仓位");
  else if (memeRatio <= 0.05 && total > 0) tags.push("几乎无 Meme 仓位");

  if (total > 0 && total < 1_000) tags.push("小仓位试验");
  else if (total >= 100_000) tags.push("大额仓位");

  if (txCount === 0) tags.push("近期几乎无主动交易");
  else if (txCount > 200) tags.push("高频交易地址");
  else if (txCount > 50) tags.push("中度活跃");
  else tags.push("轻度活跃");

  if (level === "Low") tags.push("整体偏稳健");
  else if (level === "Medium") tags.push("风险水平中等");
  else tags.push("高波动风险敞口");

  let personaType = "中性持有型地址";
  if (txCount === 0 && total > 0) personaType = "休眠型持仓地址";
  else if (score >= 75 && stableRatio >= 0.3) personaType = "稳健型持仓地址";
  else if (score <= 35 && memeRatio >= 0.2) personaType = "高波动型 Meme 地址";
  else if (score <= 40) personaType = "进取型持仓地址";
  else if (txCount > 200) personaType = "高频交易型地址";

  return { personaType, personaTags: tags };
}

export function buildRiskModule(
  assets: AssetModule,
  activity: ActivityModule
): RiskModule {
  const total = assets.totalValue;

  let stableRatio = 0;
  let memeRatio = 0;

  for (const item of assets.allocation) {
    if (item.category === "Stablecoins") stableRatio += item.ratio;
    else if (item.category === "Meme") memeRatio += item.ratio;
  }

  let otherRatio = 1 - stableRatio - memeRatio;
  if (otherRatio < 0) otherRatio = 0;

  let score = 50;

  if (stableRatio >= 0.5) score += 20;
  else if (stableRatio >= 0.3) score += 10;
  else if (stableRatio <= 0.05 && total > 0) score -= 5;

  if (memeRatio >= 0.3) score -= 20;
  else if (memeRatio >= 0.15) score -= 10;

  if (total >= 100_000) score -= 5;
  else if (total <= 1_000 && total > 0) score += 5;

  const txCount = activity.txCount;
  if (txCount === 0) score += 5;
  else if (txCount > 200) score -= 5;

  if (score < 0) score = 0;
  if (score > 100) score = 100;

  const level = scoreToLevel(score);

  let comment = "";
  if (total === 0) {
    comment = "该钱包当前几乎没有资产，整体风险主要取决于后续操作行为。";
  } else {
    if (level === "Low") {
      comment =
        "资产结构相对稳健，稳定币占比适中，Meme 代币风险敞口有限，整体风险水平偏低。";
    } else if (level === "Medium") {
      comment =
        "资产结构中存在一定风险敞口，稳定币与高波动资产之间相对平衡，需留意市场波动。";
    } else {
      comment =
        "Meme 等高波动资产占比较高或整体仓位较为激进，短期价格波动可能带来较大回撤风险。";
    }
  }

  const { personaType, personaTags } = buildPersona(
    total,
    stableRatio,
    memeRatio,
    txCount,
    level,
    score
  );

  return {
    level,
    score,
    comment,
    stableRatio,
    memeRatio,
    otherRatio,
    txCount,
    personaType,
    personaTags,
  };
}

export default buildRiskModule;