// app/api/report/modules/gas.ts
import { fetchJsonWithTimeout } from "../utils/fetch";
import { formatUnits, hexToBigInt, safeFloat } from "../utils/hex";
import { GasModule } from "./types";
import { getEthPrice } from "./prices";
import { getDisplayName } from "./labels"; // ✅ 现在这个文件存在了

const ALCHEMY_RPC = process.env.ALCHEMY_RPC_URL!;
const MAX_TX_FOR_GAS = 50;

interface RawTransfer {
  hash?: string;
}

async function fetchRecentTxHashes(address: string): Promise<string[]> {
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
            maxCount: "0x32", // Hex 50
            category: ["external", "erc20"], // 只看主动交易
            withMetadata: false,
          },
        ],
      }),
    });

    const transfers: RawTransfer[] = res?.result?.transfers ?? [];
    const hashes = transfers.map((t) => t.hash).filter((h): h is string => Boolean(h));
    return hashes.slice(0, MAX_TX_FOR_GAS);
  } catch {
    return [];
  }
}

async function fetchReceipt(hash: string): Promise<any | null> {
  try {
    const res = await fetchJsonWithTimeout(ALCHEMY_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "eth_getTransactionReceipt",
        params: [hash],
      }),
    });
    return res?.result ?? null;
  } catch {
    return null;
  }
}

// 并发控制函数
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<void>[] = [];
  
  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item));
    results.push(p as any);
    
    const e: Promise<void> = p.then(() => {
        executing.splice(executing.indexOf(e), 1);
    });
    executing.push(e);
    
    if (executing.length >= limit) {
        await Promise.race(executing);
    }
  }
  return Promise.all(results);
}

export async function buildGasModule(address: string): Promise<GasModule> {
  const hashes = await fetchRecentTxHashes(address);
  
  // 默认空返回
  if (!hashes.length) {
    return { totalGasEth: 0, totalGasUsd: 0, topTxs: [] };
  }

  const [ethPrice, receipts] = await Promise.all([
    getEthPrice(),
    mapWithConcurrency(hashes, 5, (h) => fetchReceipt(h)),
  ]);

  const entries = await Promise.all(
    hashes.map(async (hash, idx) => {
      const receipt = receipts[idx];
      if (!receipt) return null;

      const gasUsedHex = receipt.gasUsed as string | undefined;
      const gasPriceHex = (receipt.effectiveGasPrice || receipt.gasPrice) as string | undefined;

      if (!gasUsedHex || !gasPriceHex) return null;

      const gasWei = hexToBigInt(gasUsedHex) * hexToBigInt(gasPriceHex);
      const gasEth = safeFloat(formatUnits(gasWei, 18), 0);
      if (gasEth <= 0) return null;

      const to = (receipt.to as string | undefined) || "";
      const toDisplay = to ? await getDisplayName(to) : "";

      return { hash, gasEth, to, toDisplay };
    })
  );

  const validEntries = entries.filter((e): e is NonNullable<typeof e> => e !== null);

  const totalGasEth = validEntries.reduce((sum, x) => sum + x.gasEth, 0);
  const totalGasUsd = safeFloat(totalGasEth * ethPrice, 0);

  const topTxs = validEntries
    .sort((a, b) => b.gasEth - a.gasEth)
    .slice(0, 3)
    .map(tx => ({
      hash: tx.hash,
      gasEth: tx.gasEth,
      toDisplay: tx.toDisplay // 确保字段名匹配
    }));

  return {
    totalGasEth,
    totalGasUsd,
    topTxs, // ✅ 这里的结构现在符合 types.ts 定义了
  };
}