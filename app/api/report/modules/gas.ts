// app/api/report/modules/gas.ts
// v4.1 - Fix Types for topTxs

import { fetchJsonWithTimeout } from "../utils/fetch";
import { formatUnits, hexToBigInt, safeFloat } from "../utils/hex";
import { GasModule } from "./types";
import { getEthPrice } from "./prices";
import { getDisplayName } from "./labels";

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const ALCHEMY_RPC = process.env.ALCHEMY_RPC_URL;

// 定义单个交易的结构，确保与 GasModule.topTxs 匹配
interface GasTx {
  hash: string;
  gasEth: number;
  toDisplay: string;
}

// 1. 获取最近交易列表
async function fetchRecentTxList(address: string): Promise<any[]> {
  if (!ETHERSCAN_API_KEY) return [];
  const url = `https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=50&sort=desc&apikey=${ETHERSCAN_API_KEY}`;
  try {
    const res = await fetchJsonWithTimeout(url);
    if (res.status === "1" && Array.isArray(res.result)) return res.result;
    return [];
  } catch { return []; }
}

// 2. 并发控制
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: Promise<R>[] = [];
  const executing: Set<Promise<void>> = new Set();
  
  for (const item of items) {
    const p = fn(item);
    results.push(p);
    const e: Promise<void> = p.then(() => {}).catch(() => {}).finally(() => {
        executing.delete(e);
    });
    executing.add(e);
    if (executing.size >= limit) {
        await Promise.race(executing);
    }
  }
  return Promise.allSettled(results).then(res => 
      res.filter(r => r.status === 'fulfilled').map(r => (r as any).value)
  );
}

// 获取 Receipt
async function fetchReceipt(hash: string): Promise<any | null> {
  if (!ALCHEMY_RPC) return null;
  try {
    const res = await fetchJsonWithTimeout(ALCHEMY_RPC, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "eth_getTransactionReceipt", params: [hash] }),
    });
    return res?.result ?? null;
  } catch { return null; }
}

export async function buildGasModule(address: string): Promise<GasModule> {
  const rawTxs = await fetchRecentTxList(address);
  if (!rawTxs.length) {
    return { txCount: 0, totalGasEth: 0, totalGasUsd: 0, topTxs: [] };
  }

  const hashes = rawTxs.map(tx => tx.hash);

  const [ethPrice, receipts] = await Promise.all([
    getEthPrice(),
    mapWithConcurrency(hashes, 8, fetchReceipt),
  ]);

  // Label 去重查询
  const uniqueToAddresses = new Set<string>();
  receipts.forEach((r: any) => {
      if (r && r.to) uniqueToAddresses.add(r.to.toLowerCase());
  });
  
  const labelMap: Record<string, string> = {};
  await Promise.all(
      Array.from(uniqueToAddresses).map(async (addr) => {
          labelMap[addr] = await getDisplayName(addr);
      })
  );

  // 计算并构建对象
  const entries = receipts.map((r: any, idx: number): GasTx | null => {
    if (!r || !r.gasUsed || !r.effectiveGasPrice) return null;
    
    const gasWei = hexToBigInt(r.gasUsed) * hexToBigInt(r.effectiveGasPrice);
    const gasEth = safeFloat(formatUnits(gasWei, 18), 0);
    if (gasEth <= 0) return null;

    const to = r.to ? r.to.toLowerCase() : "";
    
    return { 
        hash: hashes[idx], 
        gasEth, 
        toDisplay: labelMap[to] || "" 
    };
  });

  // ✅ 关键修复：使用类型断言过滤掉 null，确保类型是 GasTx[]
  const validEntries = entries.filter((e): e is GasTx => e !== null);

  const totalGasEth = validEntries.reduce((sum, x) => sum + x.gasEth, 0);

  const topTxs = validEntries
    .sort((a, b) => b.gasEth - a.gasEth)
    .slice(0, 3);

  return {
    txCount: validEntries.length,
    totalGasEth,
    totalGasUsd: safeFloat(totalGasEth * ethPrice, 0),
    topTxs, 
  };
}