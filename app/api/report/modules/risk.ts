// app/api/report/modules/risk.ts
import type { AssetModule, ActivityModule, RiskModule } from "./types";

// ... (前面的辅助函数 calculateHHI, calculateDegenIndex, calculateWealthScore, generatePersona 全部保持不变，省略以节省篇幅) ...
// 请保留上面的所有辅助函数代码，只替换下面的 buildRiskModule 主函数

// ==========================================
// 1. 金融数学模型工具函数 (保持不变)
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

// ... (generatePersona 函数保持不变) ...
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
  
  // 处理 txCount 可能是字符串的情况
  const txNum = typeof activity.txCount === 'string' 
    ? parseInt(activity.txCount.replace(/\D/g, '')) || 0 
    : activity.txCount;

  let stableRatio = 0;
  let memeRatio = 0;
  let majorRatio = 0;

  for (const item of assets.allocation) {
    if (item.category === "Stablecoins") {
      stableRatio += item.ratio;
    } else if (item.category === "Meme") {
      memeRatio += item.ratio;
    } else if (item.category === "Majors" || item.category === "ETH") { 
      // ✅ 核心修复：把 ETH 也算作 Major (主流资产)！
      // 之前漏了 || item.category === "ETH"，导致 ETH 被算进了 Other
      majorRatio += item.ratio;
    }
  }
  
  // 计算剩余的“其他/垃圾”资产比例
  let otherRatio = 1 - stableRatio - memeRatio - majorRatio;
  if (otherRatio < 0) otherRatio = 0;

  // 运行模型
  const hhi = calculateHHI(assets.allocation);
  const degenIndex = calculateDegenIndex(memeRatio, otherRatio, txNum);
  const wealthScore = calculateWealthScore(total);

  // 计算评分
  let score = 100;
  
  // 扣分逻辑
  score -= degenIndex * 0.8; // 土狗越多扣分越多
  
  // 集中度扣分：只有当资金不集中在稳定币/主流币时，才扣分
  // ✅ 修复逻辑：如果是 ETH Maxi (ETH 梭哈者)，不应该扣太多分
  if (hhi > 5000 && (stableRatio + majorRatio) < 0.8) {
      score -= 15;
  }

  // 加分逻辑：有钱就是抗风险
  if (wealthScore > 5) score += 10;
  
  score = Math.max(0, Math.min(100, Math.round(score)));

  // 等级判定
  let level: "Low" | "Medium" | "High" = "Medium";
  if (score >= 80) level = "Low";
  else if (score <= 50) level = "High"; // 调整了一下阈值，低于50就算高危

  // 生成点评
  let comment = "";
  if (total < 10) {
    comment = "钱包空置或仅有微量残余资产。";
  } else if (degenIndex > 70) {
    comment = `⚠️ 高危预警：资产高度集中于 Meme (Degen指数: ${degenIndex.toFixed(0)})。`;
  } else if (hhi > 6000 && stableRatio > 0.9) {
    comment = "🛡️ 避险模式：资金极度集中于稳定币。";
  } else if (hhi > 6000 && majorRatio > 0.9) {
    // ✅ 新增点评：针对 ETH 巨鲸
    comment = "💎 信仰持仓：该地址是坚定的主流币 (ETH/BTC) 长期持有者。";
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
    metrics: { hhi, degenIndex, wealthScore }
  };
}

export default buildRiskModule;