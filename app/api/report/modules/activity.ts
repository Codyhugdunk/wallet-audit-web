// app/api/report/modules/activity.ts
import { fetchJsonWithTimeout } from "../utils/fetch";
// 如果你有 cached 方法请保留引用，没有则忽略
// import { cached } from "../utils/cache";
import type { ActivityModule } from "./types";

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;

async function getRealTransactions(address: string) {
  if (!ETHERSCAN_API_KEY) return [];
  
  // 获取最近 20 笔交易
  const url = `https://api.etherscan.io/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=20&sort=desc&apikey=${ETHERSCAN_API_KEY}`;
  
  try {
    const res = await fetchJsonWithTimeout(url);
    if (res.status === "1" && Array.isArray(res.result)) {
      return res.result;
    }
    return [];
  } catch (e) {
    console.error("Failed to fetch txs", e);
    return [];
  }
}

export async function buildActivityModule(address: string): Promise<ActivityModule> {
  const rawTxs = await getRealTransactions(address);

  // ✅ 核心修复：数据清洗
  // Etherscan 返回的 timeStamp 是字符串秒数，前端需要数字毫秒或秒，这里保持一致性
  const recentTxs = rawTxs.map((tx: any) => ({
    hash: tx.hash,
    timestamp: Number(tx.timeStamp), // 转成数字
    from: tx.from,
    to: tx.to,
    value: tx.value,
    isError: tx.isError,
    gasUsed: tx.gasUsed,
    functionName: tx.functionName || "",
  }));

  // 简单的统计逻辑
  const txCount = rawTxs.length >= 20 ? "20+" : rawTxs.length;
  
  const days = new Set(rawTxs.map((tx: any) => new Date(Number(tx.timeStamp)*1000).toDateString()));

  const contractCounts: Record<string, number> = {};
  rawTxs.forEach((tx: any) => {
    if (tx.to && tx.to !== "") {
      const to = tx.to.toLowerCase();
      contractCounts[to] = (contractCounts[to] || 0) + 1;
    }
  });

  const topContracts = Object.entries(contractCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([addr]) => addr);

  return {
    txCount: txCount,
    activeDays: days.size,
    contractsInteracted: Object.keys(contractCounts).length,
    topContracts,
    weeklyHistogram: [], 
    recentTxs: recentTxs, // ✅ 现在类型匹配了
  };
}