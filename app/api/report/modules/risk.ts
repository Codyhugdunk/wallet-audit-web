// app/api/report/modules/risk.ts
// WalletAudit Pro - Advanced Risk Quant Model

import type { AssetModule, ActivityModule, RiskModule } from "./types";

// ✅ 1. 定义黑名单库 (新增)
const RISK_BLACKLIST = new Set([
  "0x098b716b8aaf21512996dc57eb0615e2383e2f96", // Ronin Hacker
  "0xa0ac69911943480d2432ebcb23b318d910d95b71", // Wintermute Exploiter
  "0x629552782427a9223e7f471df0778c772e232970", // Nomad Bridge Exploiter
].map(a => a.toLowerCase()));

// ==========================================
// 2. 金融数学模型工具函数
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
// 3. 核心画像生成逻辑
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
// 4. 风险模块主导出
// ==========================================

export function buildRiskModule(
  assets: AssetModule,
  activity: ActivityModule,
  address: string // ✅ 参数里加入了 address
): RiskModule {
  const total = assets.totalValue;
  const cleanAddr = address.toLowerCase();

  // 🚨 黑名单熔断机制
  if (RISK_BLACKLIST.has(cleanAddr)) {
      return {
          level: "High",
          score: 0,
          comment: "⛔️ 极度高危：该地址被标记为知名黑客/攻击者地址 (Exploiter)。请绝对禁止与其进行任何交互！",
          stableRatio: 0, memeRatio: 0, otherRatio: 0, txCount: 0,
          personaType: "☠️ 网络犯罪者",
          personaTags: ["黑客", "洗钱", "高危"],
          metrics: { hhi: 10000, degenIndex: 100, wealthScore: 10 }
      };
  }

  // 正常计算逻辑
  const txNum = typeof activity.txCount === 'string' 
    ? parseInt(activity.txCount.replace(/\D/g, '')) || 0 
    : activity.txCount;

  let stableRatio = 0;
  let memeRatio = 0;
  let majorRatio = 0;

  for (const item of assets.allocation) {
    if (item.category === "Stablecoins") stableRatio += item.ratio;
    else if (item.category === "Meme") memeRatio += item.ratio;
    // ✅ 修复：ETH 算作主流币
    else if (item.category === "Majors" || item.category === "ETH") majorRatio += item.ratio;
  }
  
  let otherRatio = Math.max(0, 1 - stableRatio - memeRatio - majorRatio);

  const hhi = calculateHHI(assets.allocation);
  const degenIndex = calculateDegenIndex(memeRatio, otherRatio, txNum);
  const wealthScore = calculateWealthScore(total);

  let score = 100;
  score -= degenIndex * 0.8; 
  
  // 集中度扣分豁免逻辑
  if (majorRatio > 0.8) {
      // 如果主要是主流币，不扣分
  } else if (hhi > 5000 && (stableRatio + majorRatio) < 0.8) {
      score -= 15;
  }

  if (wealthScore > 5) score += 10;
  
  score = Math.max(0, Math.min(100, Math.round(score)));

  let level: "Low" | "Medium" | "High" = "Medium";
  if (score >= 80) level = "Low";
  else if (score <= 50) level = "High";

  let comment = "";
  if (total < 10) {
    comment = "钱包空置或仅有微量残余资产。";
  } else if (degenIndex > 70) {
    comment = `⚠️ 高危预警：资产高度集中于 Meme (Degen指数: ${degenIndex.toFixed(0)})。`;
  } else if (hhi > 6000 && stableRatio > 0.9) {
    comment = "🛡️ 避险模式：资金极度集中于稳定币。";
  } else if (hhi > 6000 && majorRatio > 0.9) {
    comment = "💎 信仰持仓：坚定的主流币 (ETH/BTC) 长期持有者。";
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