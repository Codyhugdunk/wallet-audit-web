// app/api/report/modules/labels.ts
// 核心：地址标签解析服务 (本地字典 > Etherscan API)

import { fetchJsonWithTimeout } from "../utils/fetch";
import { cached } from "../utils/cache";

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;

// 1. 本地高频字典 (Local Dictionary)
const LOCAL_MAP: Record<string, string> = {
  // --- DEX ---
  "0x7a250d5630b4cf539739df2c5dacb4c659f2488d": "Uniswap V2 Router",
  "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": "Uniswap V3 Router",
  "0xe592427a0aece92de3edee1f18e0157c05861564": "Uniswap V3 Router 2",
  "0x1111111254fb6c44bac0bed2854e76f90643097d": "1inch Aggregator",
  "0xdef1c0ded9bec7f1a1670819833240f027b25eff": "0x Protocol",
  
  // --- Tokens ---
  "0xdac17f958d2ee523a2206206994597c13d831ec7": "USDT",
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USDC",
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "WETH",
  "0x6982508145454ce325ddbe47a25d4ec3d2311933": "PEPE",
  
  // --- Others ---
  "0x00000000006c3852cbef3e08e8df289169ede581": "OpenSea Seaport",
  "0xdb5889e35e379ef0498aae126fc2cce1f7728b19": "BananaGun Bot",
  "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad": "Universal Router"
};

// 2. Etherscan API 兜底
async function fetchEtherscanLabel(address: string): Promise<string | null> {
  if (!ETHERSCAN_API_KEY) return null;
  
  // 这里的 key 用 contract-name 加前缀，避免跟其他缓存冲突
  const key = `label:${address.toLowerCase()}`;
  return cached(key, 24 * 60 * 60 * 1000, async () => {
    try {
      const url = `https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${address}&apikey=${ETHERSCAN_API_KEY}`;
      const res = await fetchJsonWithTimeout(url);
      
      const item = res?.result?.[0];
      if (item && item.ContractName) {
        return item.ContractName;
      }
      return null;
    } catch {
      return null;
    }
  });
}

// 3. 统一导出函数
export async function getDisplayName(address: string): Promise<string> {
  const lower = address.toLowerCase();
  
  // A. 查本地字典
  if (LOCAL_MAP[lower]) {
    return LOCAL_MAP[lower];
  }

  // B. 查 Etherscan (如果配了 Key)
  const remoteName = await fetchEtherscanLabel(address);
  if (remoteName) {
    return remoteName;
  }

  // C. 都没有，返回截断地址
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}