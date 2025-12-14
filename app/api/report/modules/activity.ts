// app/api/report/modules/activity.ts
import { fetchJsonWithTimeout } from "../utils/fetch";
import type { ActivityModule } from "./types";

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;

async function getRealTransactions(address: string) {
  // 1. 检查 Key 是否存在
  if (!ETHERSCAN_API_KEY) {
    console.error("❌ Etherscan API Key is MISSING in environment variables!");
    return [];
  }
  
  // 2. 构造 URL
  const url = `https://api.etherscan.io/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=20&sort=desc&apikey=${ETHERSCAN_API_KEY}`;
  
  try {
    // 3. 发起请求
    const res = await fetchJsonWithTimeout(url);

    // 🔍 暴力调试：打印 Etherscan 返回的原始数据
    // 请在 Vercel Logs 里搜 "Etherscan Debug"
    console.log("🔍 Etherscan Debug for:", address);
    console.log("Status:", res?.status);
    console.log("Message:", res?.message);
    if (res?.status !== "1") {
        console.error("❌ Etherscan Error Result:", res?.result);
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