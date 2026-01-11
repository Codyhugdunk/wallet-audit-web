// app/api/report/modules/risk.ts
import type { AssetModule, ActivityModule, RiskModule } from "./types";

// ... (前置常量和辅助函数 calculateHHI, calculateDegenIndex... 保持不变，请保留) ...
// 为了方便，这里只写修改后的 buildRiskModule 函数，前面的辅助函数请保留原样！
// 如果你需要全量代码防止出错，请告诉我。下面我只列出 buildRiskModule 的变化：

// ⚠️ 记得在文件顶部加上黑名单定义 (如果之前文件里有就保留)
const RISK_BLACKLIST = new Set([
  "0x098b716b8aaf21512996dc57eb0615e2383e2f96", 
  "0xa0ac69911943480d2432ebcb23b318d910d95b71", 
  "0x629552782427a9223e7f471df0778c772e232970", 
].map(a => a.toLowerCase()));

// 辅助函数 (请确保文件里有这些)
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
function generatePersona(hhi: number, degenIndex: number, wealthScore: number, activeDays: number): { type: string; tags: string[] } {
  const tags: string[] = [];
  if (wealthScore >= 7) tags.push("WHALE");     
  else if (wealthScore >= 6) tags.push("SMART_MONEY"); 
  else if (wealthScore >= 5) tags.push("MID_CLASS");   
  else if (wealthScore <= 3) tags.push("SHRIMP"); 
  if (hhi > 5000) tags.push("SNIPER");
  else if (hhi < 1500) tags.push("ETF_STYLE");
  if (degenIndex > 80) tags.push("GAMBLER");
  else if (degenIndex < 10) tags.push("RISK_AVERSE");
  if (activeDays > 365) tags.push("OG");
  if (activeDays < 7 && wealthScore > 4) tags.push("NEW_MONEY");
  
  let type = "General_User";
  if (wealthScore >= 6 && hhi < 2000) type = "Institutional";
  else if (wealthScore >= 5 && degenIndex > 60) type = "Alpha_Hunter";
  else if (degenIndex > 90) type = "High_Risk_Degen";
  else if (hhi > 8000) type = "Maxi";
  else if (wealthScore < 3 && degenIndex < 20) type = "Tourist";
  return { type, tags };
}

// ✅ 修改后的主函数
export function buildRiskModule(
  assets: AssetModule,
  activity: ActivityModule,
  address: string,
  approvalRiskCount: number = 0 // ✅ 新增参数：接收高危授权数量
): RiskModule {
  const total = assets.totalValue;
  const cleanAddr = address.toLowerCase();

  // 1. 黑名单熔断
  if (RISK_BLACKLIST.has(cleanAddr)) {
      return {
          level: "High",
          score: 0,
          comment: "⛔️ 极度高危：黑客/攻击者地址。",
          stableRatio: 0, memeRatio: 0, otherRatio: 0, txCount: 0,
          personaType: "Criminal", personaTags: ["Hacker"],
          metrics: { hhi: 10000, degenIndex: 100, wealthScore: 10 }
      };
  }

  // 2. 基础计算
  const txNum = typeof activity.txCount === 'string' ? parseInt(activity.txCount.replace(/\D/g, '')) || 0 : activity.txCount;
  let stableRatio = 0, memeRatio = 0, majorRatio = 0;
  for (const item of assets.allocation) {
    if (item.category === "Stablecoins") stableRatio += item.ratio;
    else if (item.category === "Meme") memeRatio += item.ratio;
    else if (item.category === "Majors" || item.category === "ETH") majorRatio += item.ratio;
  }
  let otherRatio = Math.max(0, 1 - stableRatio - memeRatio - majorRatio);

  const hhi = calculateHHI(assets.allocation);
  const degenIndex = calculateDegenIndex(memeRatio, otherRatio, txNum);
  const wealthScore = calculateWealthScore(total);

  // 3. 评分逻辑
  let score = 100;
  
  // 因子扣分
  score -= degenIndex * 0.8; 
  if (hhi > 5000 && (stableRatio + majorRatio) < 0.8) score -= 15;
  if (wealthScore > 5) score += 10;

  // ✅ 新增：授权风险扣分 (关键！)
  // 每个高危授权扣 5 分，扣完为止
  if (approvalRiskCount > 0) {
      score -= approvalRiskCount * 5; 
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  // 4. 等级判定
  let level: "Low" | "Medium" | "High" = "Medium";
  if (score >= 80) level = "Low";
  else if (score <= 50) level = "High";

  // 5. 评价文案 (优先报授权风险)
  let comment = "";
  if (approvalRiskCount > 5) {
     comment = `⚠️ 安全漏洞：检测到 ${approvalRiskCount} 个高危无限授权。如果不及时取消，资金随时可能被盗。`; // 中文文案逻辑在 Page 统一处理，这里留个底
  } else if (total < 10) {
     comment = "Wallet is empty.";
  } else if (degenIndex > 70) {
     comment = "High exposure to Meme/Junk assets.";
  } else if (score > 80) {
     comment = "Healthy Portfolio.";
  } else {
     comment = "Balanced Risk.";
  }

  const { type, tags } = generatePersona(hhi, degenIndex, wealthScore, activity.activeDays || 0);

  return {
    level, score, comment, stableRatio, memeRatio, otherRatio,
    txCount: activity.txCount,
    personaType: type, personaTags: tags,
    metrics: { hhi, degenIndex, wealthScore }
  };
}
export default buildRiskModule;