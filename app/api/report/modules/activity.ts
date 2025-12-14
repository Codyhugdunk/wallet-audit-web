// app/api/report/modules/activity.ts
import { fetchJsonWithTimeout } from "../utils/fetch";
import type { ActivityModule } from "./types";

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;

async function getRealTransactions(address: string) {
  if (!ETHERSCAN_API_KEY) {
    console.error("❌ Etherscan API Key is MISSING");
    return [];
  }
  
  // ✅ 核心修复：升级到 Etherscan V2 API
  // 1. 路径改为 /v2/api
  // 2. 增加了 chainid=1 (代表以太坊主网)
  const url = `https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=20&sort=desc&apikey=${ETHERSCAN_API_KEY}`;
  
  try {
    const res = await fetchJsonWithTimeout(url);

    // 依然保留调试日志，以防万一
    if (res?.status !== "1" && res?.message !== "No transactions found") {
        console.log("🔍 Etherscan V2 Debug:", res);
    }

    if (res.status === "1" && Array.isArray(res.result)) {
      return res.result;
    }
    return [];
  } catch (e: any) {
    console.error("❌ Failed to fetch txs:", e.message);
    return [];
  }
}

export async function buildActivityModule(address: string): Promise<ActivityModule> {
  const rawTxs = await getRealTransactions(address);

  // 数据清洗
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
    recentTxs: recentTxs,
  };
}