// app/api/report/modules/activity.ts — WalletAudit v1.1
import { fetchJsonWithTimeout } from "../utils/fetch";
import { ActivityModule } from "./types";
import { formatAddressWithLabel } from "../utils/etherscan";

const ALCHEMY_RPC = process.env.ALCHEMY_RPC_URL!;

interface RawTransfer {
  hash?: string;
  from?: string;
  to?: string;
  metadata?: { blockTimestamp?: string };
}

function toTimestamp(blockTimestamp?: string): number | null {
  if (!blockTimestamp) return null;
  const t = Date.parse(blockTimestamp);
  return Number.isFinite(t) ? t : null;
}

function getWeekStart(ts: number): number {
  const d = new Date(ts);
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

async function fetchRecentTransfers(address: string): Promise<RawTransfer[]> {
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
            maxCount: "0x1f4",
            category: ["external", "erc20", "internal", "erc721", "erc1155"],
            withMetadata: true,
          },
        ],
      }),
    });

    return (res?.result?.transfers ?? []) as RawTransfer[];
  } catch {
    return [];
  }
}

export async function buildActivityModule(address: string): Promise<ActivityModule> {
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
  const contractMap = new Map<string, number>();
  const weekMap = new Map<number, number>();

  for (const t of transfers) {
    const ts = toTimestamp(t.metadata?.blockTimestamp);
    if (ts) {
      const d = new Date(ts);
      const dayKey = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
      daySet.add(dayKey);

      const ws = getWeekStart(ts);
      weekMap.set(ws, (weekMap.get(ws) || 0) + 1);
    }

    const to = t.to?.toLowerCase();
    if (to && to !== address.toLowerCase()) {
      contractMap.set(to, (contractMap.get(to) || 0) + 1);
    }
  }

  const txCount = transfers.length;
  const activeDays = daySet.size;
  const contractsInteracted = contractMap.size;

  const topAddrs = Array.from(contractMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([addr]) => addr);

  // ✅ 地址→标签（失败自动降级）
  const topContracts = await Promise.all(topAddrs.map((a) => formatAddressWithLabel(a)));

  const weeklyHistogram = Array.from(weekMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([weekStart, count]) => ({ weekStart, count }));

  return {
    txCount,
    activeDays,
    contractsInteracted,
    topContracts,
    weeklyHistogram,
  };
}