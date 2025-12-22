// app/api/report/modules/activity.ts
import { fetchJsonWithTimeout } from "../utils/fetch";
import type { ActivityModule, Counterparty } from "./types";
import { getDisplayName } from "./labels"; // 需要用到 labels 来解析名字

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;

async function getRealTransactions(address: string) {
  if (!ETHERSCAN_API_KEY) return [];
  // 获取最近 50 笔
  const url = `https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=50&sort=desc&apikey=${ETHERSCAN_API_KEY}`;
  
  try {
    const res = await fetchJsonWithTimeout(url);
    if (res.status === "1" && Array.isArray(res.result)) {
      return res.result;
    }
    return [];
  } catch (e: any) {
    console.error("Failed to fetch txs:", e.message);
    return [];
  }
}

export async function buildActivityModule(address: string): Promise<ActivityModule> {
  const rawTxs = await getRealTransactions(address);

  // 1. 数据清洗
  const recentTxs = rawTxs.map((tx: any) => ({
    hash: tx.hash,
    timestamp: Number(tx.timeStamp),
    from: tx.from,
    to: tx.to,
    value: tx.value,
    isError: tx.isError,
    gasUsed: tx.gasUsed,
    functionName: tx.functionName || "",
  }));

  const txCount = rawTxs.length >= 50 ? "50+" : rawTxs.length;
  const days = new Set(rawTxs.map((tx: any) => new Date(Number(tx.timeStamp)*1000).toDateString()));

  // 2. 计算 Top Counterparties (核心升级)
  const counterpartyStats: Record<string, { count: number; lastTs: number }> = {};
  
  rawTxs.forEach((tx: any) => {
    // 排除自己给自己转账
    if (!tx.to || tx.to.toLowerCase() === address.toLowerCase()) return;
    
    const target = tx.to.toLowerCase();
    if (!counterpartyStats[target]) {
        counterpartyStats[target] = { count: 0, lastTs: 0 };
    }
    counterpartyStats[target].count += 1;
    counterpartyStats[target].lastTs = Math.max(counterpartyStats[target].lastTs, Number(tx.timeStamp));
  });

  // 排序取前 5
  const topTargets = Object.entries(counterpartyStats)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);

  // 解析名字 (Label)
  const topCounterparties: Counterparty[] = await Promise.all(
      topTargets.map(async ([addr, stats]) => {
          const name = await getDisplayName(addr);
          return {
              address: addr,
              count: stats.count,
              lastInteraction: stats.lastTs,
              label: name || "Unknown"
          };
      })
  );

  return {
    txCount: txCount,
    activeDays: days.size,
    contractsInteracted: Object.keys(counterpartyStats).length,
    topContracts: [], // 暂时不用这个旧字段了
    weeklyHistogram: [], 
    recentTxs: recentTxs,
    topCounterparties: topCounterparties // ✅ 输出给前端
  };
}