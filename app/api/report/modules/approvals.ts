// app/api/report/modules/approvals.ts
import { fetchJsonWithTimeout } from "../utils/fetch";
import type { ApprovalsModule, ApprovalItem } from "./types";

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const ALCHEMY_RPC = process.env.ALCHEMY_RPC_URL!; // ✅ 新增

// 知名安全合约白名单
const SAFE_SPENDERS: Record<string, string> = {
  "0x7a250d5630b4cf539739df2c5dacb4c659f2488d": "Uniswap V2",
  "0xe592427a0aece92de3edee1f18e0157c05861564": "Uniswap V3",
  "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": "Uniswap V3",
  "0x1111111254fb6c44bac0bed2854e76f90643097d": "1inch Aggregator",
  "0xdef1c0ded9bec7f1a1670819833240f027b25eff": "0x Protocol",
  "0x000000000022d473030f116ddee9f6b43ac78ba3": "Permit2",
  "0x881d40237659c251811cec9c35e92faf6fb46a60": "Metamask Swap",
  "0x1b02da8cb0d097eb8d57a175b88c7d8b47997506": "SushiSwap",
  "0x00000000006c3852cbef3e08e8df289169ede581": "OpenSea",
};

// ✅ 新增：简单的获取代币符号函数 (不缓存也没事，数量少)
async function getTokenSymbol(contractAddress: string): Promise<string> {
  try {
    const res = await fetchJsonWithTimeout(ALCHEMY_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "alchemy_getTokenMetadata",
        params: [contractAddress],
      }),
    });
    return (res?.result?.symbol as string) || "TOKEN";
  } catch {
    return "TOKEN";
  }
}

async function fetchHistoryForApprovals(address: string) {
  if (!ETHERSCAN_API_KEY) return [];
  const url = `https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=100&sort=desc&apikey=${ETHERSCAN_API_KEY}`;
  try {
    const res = await fetchJsonWithTimeout(url);
    if (res.status === "1" && Array.isArray(res.result)) return res.result;
    return [];
  } catch { return []; }
}

export async function buildApprovalsModule(address: string): Promise<ApprovalsModule> {
  const txs = await fetchHistoryForApprovals(address);
  const items: ApprovalItem[] = [];
  const seenTokenSpender = new Set<string>();

  for (const tx of txs) {
    const methodId = tx.methodId || tx.input?.slice(0, 10);
    const funcName = tx.functionName ? tx.functionName.toLowerCase() : "";

    if (methodId === "0x095ea7b3" || funcName.startsWith("approve")) {
        let spender = "";
        try {
            if (tx.input && tx.input.length >= 74) {
               spender = "0x" + tx.input.slice(34, 74);
            }
        } catch (e) {}

        if (!spender) continue;
        
        const key = `${tx.to}-${spender}`;
        if (seenTokenSpender.has(key)) continue;
        seenTokenSpender.add(key);

        const spenderLower = spender.toLowerCase();
        const isSafe = SAFE_SPENDERS[spenderLower];
        const isUnlimited = tx.input.includes("ffffffff");
        const isRisk = !isSafe && isUnlimited;

        // ✅ 获取代币符号 (tx.to 就是代币合约地址)
        const tokenSymbol = await getTokenSymbol(tx.to);

        items.push({
            token: tokenSymbol, // ✅ 这里存符号，不再存地址
            spender: spender,
            spenderName: isSafe || "Unknown Contract",
            amount: isUnlimited ? "Unlimited" : "Specific",
            riskLevel: isRisk ? "High" : "Low",
            lastUpdated: Number(tx.timeStamp) * 1000,
            txHash: tx.hash
        });
    }
  }

  // 排序：高危在前
  items.sort((a, b) => (a.riskLevel === 'High' ? -1 : 1));

  const riskCount = items.filter(i => i.riskLevel === "High").length;

  return {
    riskCount,
    items: items.slice(0, 5)
  };
}