// activity.ts — WalletAudit v1.0
// Level 1 行为画像（最近 500 笔，轻量版）
// - 只看 fromAddress = 钱包地址（主动发起的交易）
// - 统计：txCount / activeDays / contractsInteracted / topContracts / weeklyHistogram

import { fetchJsonWithTimeout } from "../utils/fetch";
import { ActivityModule } from "./types";

const ALCHEMY_RPC = process.env.ALCHEMY_RPC_URL!;

interface RawTransfer {
  hash?: string;
  from?: string;
  to?: string;
  metadata?: {
    blockTimestamp?: string;
  };
}

// 将日期字符串转为时间戳（毫秒）
function toTimestamp(blockTimestamp?: string): number | null {
  if (!blockTimestamp) return null;
  const t = Date.parse(blockTimestamp);
  return Number.isFinite(t) ? t : null;
}

// 取一周的起始时间（周一 00:00）
function getWeekStart(ts: number): number {
  const d = new Date(ts);
  const day = d.getUTCDay(); // 0 = Sunday
  const diff = (day + 6) % 7; // 将周一作为 0
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

// 获取最近 500 笔 fromAddress = address 的转账
async function fetchRecentTransfers(
  address: string
): Promise<RawTransfer[]> {
  try {
    const res = await fetchJsonWithTimeout(ALCHEMY_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "alchemy_getAssetTransfers",
        params: [
          {
            fromAddress: address,
            maxCount: "0x1f4", // 500 笔
            category: ["external", "erc20", "internal", "erc721", "erc1155"],
            withMetadata: true,
          },
        ],
      }),
    });

    const transfers: RawTransfer[] = res?.result?.transfers ?? [];
    return transfers;
  } catch {
    return [];
  }
}

// 主构建函数
export async function buildActivityModule(
  address: string
): Promise<ActivityModule> {
  const transfers = await fetchRecentTransfers(address);

  if (!transfers.length) {
    return {
      txCount: 0,
      activeDays: 0,
      contractsInteracted: 0,
      topContracts: [],
      weeklyHistogram: [],
    };
  }

  const daySet = new Set<string>();
  const contractMap = new Map<string, number>(); // counterparty -> count
  const weekMap = new Map<number, number>(); // weekStart -> count

  for (const t of transfers) {
    const ts = toTimestamp(t.metadata?.blockTimestamp);
    if (ts) {
      // 活跃天数：按日期去重（UTC）
      const d = new Date(ts);
      const dayKey = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
      daySet.add(dayKey);

      // weekly histogram
      const ws = getWeekStart(ts);
      weekMap.set(ws, (weekMap.get(ws) || 0) + 1);
    }

    // 交互合约：简单用 to 地址作为 counterparty
    const to = t.to?.toLowerCase();
    if (to && to !== address.toLowerCase()) {
      contractMap.set(to, (contractMap.get(to) || 0) + 1);
    }
  }

  const txCount = transfers.length;
  const activeDays = daySet.size;
  const contractsInteracted = contractMap.size;

  // Top 3 合约地址
  const topContracts = Array.from(contractMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([addr]) => addr);

  // weeklyHistogram：按时间排序
  const weeklyHistogram = Array.from(weekMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([weekStart, count]) => ({
      weekStart,
      count,
    }));

  return {
    txCount,
    activeDays,
    contractsInteracted,
    topContracts,
    weeklyHistogram,
  };
}