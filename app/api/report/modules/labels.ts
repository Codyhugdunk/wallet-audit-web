// app/api/report/modules/labels.ts

const KNOWN_LABELS: Record<string, string> = {
  // Stablecoins & Wrapped
  "0xdac17f958d2ee523a2206206994597c13d831ec7": "USDT",
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USDC",
  "0x6b175474e89094c44da98b954eedeac495271d0f": "DAI",
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "WETH",
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": "WBTC",

  // Exchanges
  "0x28c6c06298d514db089934071355e5743bf21d60": "Binance 14",
  "0x21a31ee1afc51d94c2efccaa2092ad1028285549": "Binance 15",
  "0x5f58058c06b973e58969f08a430500a40058b688": "Kraken 5",
  "0x71660c4005ba85c37ccec55d0c4493e66fe775d3": "Coinbase 10",
  "0x0d0707963952f2fba59dd06f2b425ace40b492fe": "Gate.io",

  // DeFi & Routers
  "0x7a250d5630b4cf539739df2c5dacb4c659f2488d": "Uniswap V2",
  "0xe592427a0aece92de3edee1f18e0157c05861564": "Uniswap V3",
  "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": "Uniswap V3",
  "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad": "Uniswap Universal",
  "0x1111111254fb6c44bac0bed2854e76f90643097d": "1inch",
  "0x881d40237659c251811cec9c35e92faf6fb46a60": "Metamask Swap",
  "0x000000000022d473030f116ddee9f6b43ac78ba3": "Permit2",
  "0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9": "Aave V2",
  "0x87870bca3f3fd6335c3ef908639137c60ef36494": "Aave V3",
  "0x99c9fc46f92e8a1c0dec1b1747ce7100689e471f": "Polygon Bridge",

  // Burn
  "0x0000000000000000000000000000000000000000": "Null Address",
  "0x000000000000000000000000000000000000dead": "Dead Address",
};

export async function getDisplayName(address: string): Promise<string> {
  return KNOWN_LABELS[address.toLowerCase()] || "";
}