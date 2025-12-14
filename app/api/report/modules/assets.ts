// app/api/report/modules/assets.ts
import { fetchJsonWithTimeout } from "../utils/fetch";
import { formatUnits, hexToBigInt, safeFloat } from "../utils/hex";
import { cached } from "../utils/cache";
import { getEthPrice, getTokenPrices } from "./prices";
import { AssetsModule, TokenBalance } from "./types"; // 使用 AssetsModule

const ALCHEMY_RPC = process.env.ALCHEMY_RPC_URL!;

// ... (省略中间常数定义，STABLE_SYMBOLS 等保持不变) ...
const STABLE_SYMBOLS = new Set(["USDT", "USDC", "DAI", "USDE", "USDS", "FDUSD", "TUSD", "USDP", "BUSD", "FRAX", "LUSD", "GUSD", "PYUSD", "MIM", "ALUSD", "DOLA"]);
const MAJOR_SYMBOLS = new Set(["WETH", "WBTC", "CBETH", "RETH", "STETH", "EZETH", "UNI", "AAVE", "LDO", "LINK", "MKR", "COMP", "SNX", "CRV", "RPL", "FXS", "ARB", "OP", "MATIC", "POL", "IMX", "MNT", "STRK", "ZK", "RNDR", "FET", "WLD", "TAO", "ENA", "PENDLE", "ONDO"]);
const MEME_KEYWORDS = ["PEPE", "DOGE", "SHIB", "FLOKI", "BONK", "WIF", "MOG", "TURBO", "SPX", "LADYS", "MEME", "TRUMP", "MAGA", "BOME", "SLERF", "NEIRO", "PENGU", "POPCAT", "BRETT", "HarryPotter", "SNEK"];

function classifyToken(symbol: string): "Stablecoins" | "Majors" | "Meme" | "Others" {
  if (!symbol) return "Others";
  const sym = symbol.toUpperCase();
  if (STABLE_SYMBOLS.has(sym)) return "Stablecoins";
  if (MAJOR_SYMBOLS.has(sym)) return "Majors";
  for (const key of MEME_KEYWORDS) { if (sym.includes(key)) return "Meme"; }
  return "Others";
}

async function getEthBalance(address: string): Promise<number> {
  try {
    const res = await fetchJsonWithTimeout(ALCHEMY_RPC, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "eth_getBalance", params: [address, "latest"] }),
    });
    return formatUnits(hexToBigInt(res?.result), 18);
  } catch { return 0; }
}

interface RawTokenBalance { contractAddress: string; tokenBalance: string; }
async function getRawTokenBalances(address: string): Promise<RawTokenBalance[]> {
  try {
    const res = await fetchJsonWithTimeout(ALCHEMY_RPC, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "alchemy_getTokenBalances", params: [address, "erc20"] }),
    });
    return res?.result?.tokenBalances?.filter((t: any) => t?.tokenBalance && t?.tokenBalance !== "0x0") ?? [];
  } catch { return []; }
}

interface TokenMeta { symbol: string; decimals: number; }
async function fetchTokenMeta(contractAddress: string): Promise<TokenMeta> {
  const key = `token-meta:${contractAddress.toLowerCase()}`;
  return cached(key, 60 * 60 * 24 * 7 * 1000, async () => {
    try {
      const res = await fetchJsonWithTimeout(ALCHEMY_RPC, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "alchemy_getTokenMetadata", params: [contractAddress] }),
      });
      return { symbol: (res?.result?.symbol as string) || "UNKNOWN", decimals: typeof res?.result?.decimals === "number" ? res.result.decimals : 18 };
    } catch { return { symbol: "UNKNOWN", decimals: 18 }; }
  });
}

export async function buildAssetsModule(address: string): Promise<AssetsModule> {
  const [ethAmount, rawTokens, ethPrice] = await Promise.all([getEthBalance(address), getRawTokenBalances(address), getEthPrice()]);
  const tokenAddresses = rawTokens.map((t) => t.contractAddress);
  const uniqueAddresses = Array.from(new Set(tokenAddresses.map((a) => a.toLowerCase())));
  const [tokenPrices, metas] = await Promise.all([getTokenPrices(uniqueAddresses), Promise.all(uniqueAddresses.map((addr) => fetchTokenMeta(addr)))]);

  const metaMap: Record<string, TokenMeta> = {};
  uniqueAddresses.forEach((addr, idx) => { metaMap[addr] = metas[idx]; });

  const tokens: TokenBalance[] = rawTokens.map((t) => {
    const addr = t.contractAddress.toLowerCase();
    const meta = metaMap[addr] || { symbol: "UNKNOWN", decimals: 18 };
    const amount = formatUnits(hexToBigInt(t.tokenBalance), meta.decimals);
    const price = tokenPrices[addr] ?? 0;
    const value = safeFloat(amount * price, 0);
    return { contractAddress: addr, symbol: meta.symbol, amount, value, decimals: meta.decimals, hasPrice: price > 0 };
  });

  tokens.sort((a, b) => b.value - a.value);
  const ethValue = safeFloat(ethAmount * ethPrice, 0);
  const tokensValue = tokens.reduce((sum, t) => sum + t.value, 0);
  const totalValue = safeFloat(ethValue + tokensValue, 0);

  const acc: { [cat: string]: number } = { "ETH": 0, "Stablecoins": 0, "Majors": 0, "Meme": 0, "Others": 0 };
  if (ethValue > 0) acc["ETH"] = ethValue;
  for (const t of tokens) { acc[classifyToken(t.symbol)] = (acc[classifyToken(t.symbol)] || 0) + t.value; }

  const allocation = Object.entries(acc).filter(([_, val]) => val > 0).map(([category, value]) => ({ category, value, ratio: totalValue > 0 ? value / totalValue : 0 })).sort((a, b) => b.value - a.value);
  const otherTokens = tokens.filter((t) => !t.hasPrice || t.value < 5);

  return { eth: { amount: ethAmount, value: ethValue }, tokens, totalValue, allocation, otherTokens, priceWarning: null };
}

export async function getAssets(address: string): Promise<AssetsModule> {
  return buildAssetsModule(address);
}