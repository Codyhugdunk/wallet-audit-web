// app/api/report/modules/labels.ts
// ✅ 常用合约白名单库 (手动维护的高频地址)

const KNOWN_LABELS: Record<string, string> = {
  // --- 稳定币 ---
  "0xdac17f958d2ee523a2206206994597c13d831ec7": "USDT (Tether)",
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USDC (Circle)",
  "0x6b175474e89094c44da98b954eedeac495271d0f": "DAI (Maker)",
  
  // --- 交易所热钱包 ---
  "0x28c6c06298d514db089934071355e5743bf21d60": "Binance 14",
  "0x21a31ee1afc51d94c2efccaa2092ad1028285549": "Binance 15",
  "0xf977814e90da44bfa03b6295a0616a897441acec": "Binance 8",
  "0x5f58058c06b973e58969f08a430500a40058b688": "Kraken 5",
  "0xa090e606e30bd747d4e6245a1517ebc43640b910": "Poloniex 4",
  
  // --- DeFi 协议 ---
  "0x7a250d5630b4cf539739df2c5dacb4c659f2488d": "Uniswap V2 Router",
  "0xe592427a0aece92de3edee1f18e0157c05861564": "Uniswap V3 Router",
  "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": "Uniswap V3 Router 2",
  "0x1111111254fb6c44bac0bed2854e76f90643097d": "1inch v5 Aggregator",
  "0x000000000022d473030f116ddee9f6b43ac78ba3": "Permit2 (Uniswap)",
  "0x881d40237659c251811cec9c35e92faf6fb46a60": "Metamask Swap",
  "0x00000000006c3852cbef3e08e8df289169ede581": "OpenSea Seaport",
  
  // --- 跨链桥 ---
  "0x99c9fc46f92e8a1c0dec1b1747ce7100689e471f": "Polygon Bridge",
  "0x4dbd4fc535ac27206064b68ffcf827b0a60bab3f": "Arbitrum Bridge",
  "0xa0c68c638235ee32657e8f720a23ce81bcf7cb3d": "Polygon (Matic) Bridge",
  
  // --- 黑洞/Null ---
  "0x0000000000000000000000000000000000000000": "Null Address (Burn)",
  "0x000000000000000000000000000000000000dead": "Dead Address (Burn)",
};

export async function getDisplayName(address: string): Promise<string> {
  const lower = address.toLowerCase();
  
  // 1. 查白名单
  if (KNOWN_LABELS[lower]) {
      return KNOWN_LABELS[lower];
  }
  
  // 2. 如果没查到，尝试简单的格式化
  // (未来这里可以接 Etherscan API 查标签，但免费版额度有限，先不加)
  
  return ""; // 返回空，让前端显示 "Unknown Contract"
}