// app/api/report/modules/gas.ts
import { fetchJsonWithTimeout } from "../utils/fetch";
import { formatUnits, hexToBigInt, safeFloat } from "../utils/hex";
import { GasModule } from "./types";
import { getEthPrice } from "./prices";
import { getDisplayName } from "./labels";

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
            category: ["external", "erc20"],
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

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: Promise<R>[] = [];
  const executing: Promise<void>[] = [];
  
  for (const item of items) {
    const p = fn(item);
    results.push(p);
    
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
  
  // ✅ 修复 1：这里补上了 txCount
  if (!hashes.length) {
    return { txCount: 0, totalGasEth: 0, totalGasUsd: 0, topTxs: [] };
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

      return { hash, gasEth, toDisplay };
    })
  );

  const validEntries = entries.filter((e): e is NonNullable<typeof e> => e !== null);

  const totalGasEth = validEntries.reduce((sum, x) => sum + x.gasEth, 0);
  const totalGasUsd = safeFloat(totalGasEth * ethPrice, 0);

  const topTxs = validEntries
    .sort((a, b) => b.gasEth - a.gasEth)
    .slice(0, 3);

  return {
    txCount: hashes.length, // ✅ 修复 2：这里也补上了 txCount
    totalGasEth,
    totalGasUsd,
    topTxs, 
  };
}