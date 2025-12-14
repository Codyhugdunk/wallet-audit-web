// app/api/report/modules/risk.ts
// WalletAudit Pro - Advanced Risk Quant Model
// CPO: Designed for Real Financial Insight

import type { AssetModule, ActivityModule, RiskModule } from "./types";

// ==========================================
// 1. 金融数学模型工具函数
// ==========================================

/**
 * 计算 HHI (Herfindahl-Hirschman Index) 集中度指数
 * 范围: 0 ~ 10000
 * > 2500: 高度集中 (梭哈型)
 * 1500 ~ 2500: 中度集中
 * < 1500: 分散投资 (基金型)
 */
function calculateHHI(allocation: { ratio: number }[]): number {
  return allocation.reduce((sum, item) => sum + Math.pow(item.ratio * 100, 2), 0);
}

/**
 * 计算 Degen Index (土狗/投机指数)
 * 基于 Meme 占比和其他非主流资产占比的加权风险
 * 范围: 0 ~ 100
 */
function calculateDegenIndex(memeRatio: number, otherRatio: number, txCount: number): number {
  // Meme 币风险系数 1.5倍，其他长尾资产风险系数 1.0倍
  let rawRisk = (memeRatio * 1.5 + otherRatio * 1.0) * 100;
  
  // 交易频率修正：如果交易极其频繁 (>500)，说明是高频冲土狗，风险加权
  const frequencyMultiplier = txCount > 500 ? 1.2 : 1.0;
  
  return Math.min(rawRisk * frequencyMultiplier, 100);
}

/**
 * 计算财富等级 (对数标尺)
 * $100 => 2.0
 * $10,000 => 4.0
 * $1,000,000 => 6.0
 */
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
  
  // --- 财富标签 ---
  if (wealthScore >= 7) tags.push("🐋 顶级巨鲸");     // > $10M
  else if (wealthScore >= 6) tags.push("🦈 聪明钱大户"); // > $1M
  else if (wealthScore >= 5) tags.push("🐬 中产阶级");   // > $100K
  else if (wealthScore <= 3) tags.push("🦐 链上小虾米"); // < $1K

  // --- 风格标签 (基于 HHI) ---
  if (hhi > 5000) tags.push("🎲 单币梭哈者");
  else if (hhi < 1500) tags.push("🏦 指数化配置");

  // --- 风险标签 (基于 Degen Index) ---
  if (degenIndex > 80) tags.push("🔥 链上赌徒");
  else if (degenIndex < 10) tags.push("🛡️ 风险厌恶者");

  // --- 活跃标签 ---
  if (activeDays > 365) tags.push("⏳ 钻石手老兵");
  if (activeDays < 7 && wealthScore > 4) tags.push("⚡ 突击新钱包");

  // --- 核心人格判定 ---
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

  // 1. 提取基础比率
  let stableRatio = 0;
  let memeRatio = 0;
  let majorRatio = 0;

  for (const item of assets.allocation) {
    if (item.category === "Stablecoins") stableRatio += item.ratio;
    else if (item.category === "Meme") memeRatio += item.ratio;
    else if (item.category === "Majors") majorRatio += item.ratio;
  }
  
  // "Others" 是除了上述三种之外的资产
  let otherRatio = 1 - stableRatio - memeRatio - majorRatio;
  if (otherRatio < 0) otherRatio = 0;

  // 2. 运行量化模型
  const hhi = calculateHHI(assets.allocation);
  const degenIndex = calculateDegenIndex(memeRatio, otherRatio, activity.txCount);
  const wealthScore = calculateWealthScore(total);

  // 3. 计算最终风险评分 (0-100)
  // 基础分 100，根据风险因子扣分
  let score = 100;
  
  // 扣分项：土狗指数过高
  score -= degenIndex * 0.8; 
  
  // 扣分项：过度集中 (除非是稳定币集中)
  if (hhi > 5000 && stableRatio < 0.8) score -= 15;

  // 加分项：资产规模大 (通常意味着抗风险能力强)
  if (wealthScore > 5) score += 10;
  
  // 修正范围
  score = Math.max(0, Math.min(100, Math.round(score)));

  // 4. 判定风险等级
  let level: "Low" | "Medium" | "High" = "Medium";
  if (score >= 80) level = "Low";       // 分数越高，风险越低 (安全)
  else if (score <= 40) level = "High"; // 分数越低，风险越高

  // 5. 生成专业点评
  let comment = "";
  if (total < 10) {
    comment = "钱包空置或仅有微量残余资产，缺乏足够数据进行风险评估。";
  } else if (degenIndex > 70) {
    comment = `⚠️ 高危预警：该地址资产高度集中于 Meme 或长尾资产 (Degen指数: ${degenIndex.toFixed(0)})，且缺乏主流资产对冲。属于典型的激进投机风格，需警惕归零风险。`;
  } else if (hhi > 6000 && stableRatio > 0.9) {
    comment = "🛡️ 避险模式：资金极度集中于稳定币，显示出该用户当前处于观望或避险状态，链上交互意愿较低。";
  } else if (score > 80) {
    comment = "✅ 稳健模型：资产配置多元化（低 HHI），且持有大量蓝筹资产。该地址表现出成熟投资者的风险控制能力。";
  } else {
    comment = "⚖️ 均衡风险：在追求 Alpha 收益与资金安全之间保持了动态平衡，资产结构呈现典型的哑铃型分布。";
  }

  // 6. 生成人格画像
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
    // 将高级指标暴露出去，未来 Pro 版前端可以画雷达图
    metrics: {
      hhi,
      degenIndex,
      wealthScore
    }
  };
}

export default buildRiskModule;