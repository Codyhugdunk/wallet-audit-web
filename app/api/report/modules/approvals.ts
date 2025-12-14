// app/api/report/modules/approvals.ts
import { fetchJsonWithTimeout } from "../utils/fetch";
import type { ApprovalsModule, ApprovalItem } from "./types";

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;

// 知名安全合约白名单 (Spender Whitelist)
// 包含：Uniswap, OpenSea, Metamask Swap, 1inch, Sushi, Permit2
const SAFE_SPENDERS: Record<string, string> = {
  "0x7a250d5630b4cf539739df2c5dacb4c659f2488d": "Uniswap V2 Router",
  "0xe592427a0aece92de3edee1f18e0157c05861564": "Uniswap V3 Router",
  "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": "Uniswap V3 Router 2",
  "0x1111111254fb6c44bac0bed2854e76f90643097d": "1inch v5 Router",
  "0xdef1c0ded9bec7f1a1670819833240f027b25eff": "0x Protocol",
  "0x000000000022d473030f116ddee9f6b43ac78ba3": "Permit2",
  "0x881d40237659c251811cec9c35e92faf6fb46a60": "Metamask Swap",
  "0x1b02da8cb0d097eb8d57a175b88c7d8b47997506": "SushiSwap Router",
  "0x00000000006c3852cbef3e08e8df289169ede581": "OpenSea Seaport",
};

async function fetchHistoryForApprovals(address: string) {
  if (!ETHERSCAN_API_KEY) return [];
  // 扫描最近 100 笔足矣，做 MVP 不需要全量扫描
  const url = `https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=100&sort=desc&apikey=${ETHERSCAN_API_KEY}`;
  
  try {
    const res = await fetchJsonWithTimeout(url);
    if (res.status === "1" && Array.isArray(res.result)) {
      return res.result;
    }
    return [];
  } catch {
    return [];
  }
}

export async function buildApprovalsModule(address: string): Promise<ApprovalsModule> {
  const txs = await fetchHistoryForApprovals(address);
  
  const items: ApprovalItem[] = [];
  
  // 简单的去重 Set，防止同一个 Token 显示多次
  const seenTokenSpender = new Set<string>();

  for (const tx of txs) {
    // 筛选 approve 方法 (Method ID: 0x095ea7b3)
    // 或者检查 functionName 包含 'approve'
    const methodId = tx.methodId || tx.input?.slice(0, 10);
    const funcName = tx.functionName ? tx.functionName.toLowerCase() : "";

    if (methodId === "0x095ea7b3" || funcName.startsWith("approve")) {
        // 解析 Spender (从 Input Data 的第 34-74 位)
        // input: 0x095ea7b3000000000000000000000000[spender]...
        let spender = "";
        try {
            if (tx.input && tx.input.length >= 74) {
               spender = "0x" + tx.input.slice(34, 74);
            }
        } catch (e) {}

        if (!spender) continue;
        
        // 构造唯一键，只取最近一次操作
        const key = `${tx.to}-${spender}`; // Token Contract - Spender
        if (seenTokenSpender.has(key)) continue;
        seenTokenSpender.add(key);

        const spenderLower = spender.toLowerCase();
        const isSafe = SAFE_SPENDERS[spenderLower];
        
        // 判断金额是否无限 (简单判断 input 结尾是否全是 f)
        const isUnlimited = tx.input.includes("ffffffff");
        
        // 风险判定：如果是未知合约 且 进行了无限授权 -> 高危
        const isRisk = !isSafe && isUnlimited;

        items.push({
            token: tx.to, // 合约地址即 Token 地址
            spender: spender,
            spenderName: isSafe || "Unknown Contract",
            amount: isUnlimited ? "Unlimited" : "Specific",
            riskLevel: isRisk ? "High" : "Low",
            lastUpdated: Number(tx.timeStamp) * 1000,
            txHash: tx.hash
        });
    }
  }

  // 统计高危数量
  const riskCount = items.filter(i => i.riskLevel === "High").length;

  // 只返回前 5 条展示
  return {
    riskCount,
    items: items.slice(0, 5)
  };
}