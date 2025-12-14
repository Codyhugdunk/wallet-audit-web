// app/api/report/modules/gas.ts — WalletAudit v1.1
import { fetchJsonWithTimeout } from "../utils/fetch";
import { formatUnits, hexToBigInt, safeFloat } from "../utils/hex";
import { GasModule } from "./types";
import { getEthPrice } from "./prices";
import { formatAddressWithLabel } from "../utils/etherscan";

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
            maxCount: "0x1f4",
            category: ["external", "erc20", "internal", "erc721", "erc1155"],
            withMetadata: false,
          },
        ],
      }),
    });

    const transfers: RawTransfer[] = res?.result?.transfers ?? [];
    const hashes = transfers.map((t) => t.hash).filter((h): h is string => !!h);
    return hashes.slice(0, MAX_TX_FOR_GAS);
  } catch {
    return [];
  }
}

async function fetchGasForTx(hash: string): Promise<{ gasEth: number; to?: string }> {
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

    const receipt = res?.result;
    if (!receipt) return { gasEth: 0 };

    const gasUsedHex = receipt.gasUsed as string | undefined;
    const effGasPriceHex = receipt.effectiveGasPrice as string | undefined;
    const gasPriceHex = effGasPriceHex || (receipt.gasPrice as string | undefined);
    const to = typeof receipt.to === "string" ? receipt.to.toLowerCase() : undefined;

    if (!gasUsedHex || !gasPriceHex) return { gasEth: 0, to };

    const gasUsed = hexToBigInt(gasUsedHex);
    const gasPrice = hexToBigInt(gasPriceHex);
    if (gasUsed === 0n || gasPrice === 0n) return { gasEth: 0, to };

    const gasWei = gasUsed * gasPrice;
    const gasEth = formatUnits(gasWei, 18);
    return { gasEth: safeFloat(gasEth, 0), to };
  } catch {
    return { gasEth: 0 };
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current]);
    }
  }

  const workers = [];
  const workerCount = Math.min(limit, items.length);
  for (let i = 0; i < workerCount; i++) workers.push(worker());

  await Promise.all(workers);
  return results;
}

export async function buildGasModule(address: string): Promise<GasModule> {
  const hashes = await fetchRecentTxHashes(address);
  if (!hashes.length) {
    return { txCount: 0, totalGasEth: 0, totalGasUsd: 0, topTxs: [] };
  }

  const [ethPrice, gasList] = await Promise.all([
    getEthPrice(),
    mapWithConcurrency(hashes, 5, (h) => fetchGasForTx(h)),
  ]);

  const gasEntries = hashes
    .map((hash, idx) => ({
      hash,
      gasEth: safeFloat(gasList[idx]?.gasEth ?? 0, 0),
      to: gasList[idx]?.to,
    }))
    .filter((x) => x.gasEth > 0);

  const totalGasEth = gasEntries.reduce((sum, x) => sum + x.gasEth, 0);
  const totalGasUsd = safeFloat(totalGasEth * ethPrice, 0);

  const topTxsRaw = gasEntries
    .slice()
    .sort((a, b) => b.gasEth - a.gasEth)
    .slice(0, 3);

  const topTxs = await Promise.all(
    topTxsRaw.map(async (t) => {
      const to = t.to || "";
      const toDisplay = to ? await formatAddressWithLabel(to) : "";
      return { hash: t.hash, gasEth: t.gasEth, to, toDisplay };
    })
  );

  return { txCount: hashes.length, totalGasEth, totalGasUsd, topTxs };
}