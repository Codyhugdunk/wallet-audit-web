// app/api/report/modules/labels.ts
// 合约名字解析：本地字典优先 -> Redis(可选) -> Etherscan API(v2) -> 兜底短地址

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

// ✅ 你提供的本地字典：大小写不敏感（内部统一 lower case）
export const LOCAL_CONTRACT_MAP: Record<string, string> = {
  // --- 稳定币 & 主流币 ---
  "0xdac17f958d2ee523a2206206994597c13d831ec7": "USDT (Tether)",
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USDC",
  "0x6b175474e89094c44da98b954eedeac495271d0f": "DAI",
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "WETH (Wrapped Ether)",
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": "WBTC",
  "0x6982508145454ce325ddbe47a25d4ec3d2311933": "PEPE (Meme)",
  "0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce": "SHIB (Meme)",

  // --- 交易所 (DEX) ---
  "0x7a250d5630b4cf539739df2c5dacb4c659f2488d": "Uniswap V2 Router",
  "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": "Uniswap V3 Router", // V3 Router 1
  "0xe592427a0aece92de3edee1f18e0157c05861564": "Uniswap V3 Router", // V3 Router 2
  "0x1111111254fb6c44bac0bed2854e76f90643097d": "1inch Aggregator",
  "0xdef1c0ded9bec7f1a1670819833240f027b25eff": "0x Protocol (Matcha)",

  // --- NFT 市场 ---
  "0x00000000006c3852cbef3e08e8df289169ede581": "OpenSea (Seaport 1.5)",
  "0x0000000000000068f116a894984e2db1123e3f44": "Blur Marketplace",

  // --- 机器人 & 工具 (识别是否为专业玩家的关键) ---
  "0xdb5889e35e379ef0498aae126fc2cce1f7728b19": "BananaGun Bot (Router)",
  "0x80c67432656d59144cff9624d0f89d8cad5af2e8": "Maestro Bot (Router)",
  "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad": "Universal Router (Uniswap)",

  // --- 跨链桥 ---
  "0x99c9fc46f92e8a1c0dec1b1747d010903e884be1": "Optimism Gateway",
  "0x72e4a4859a48f4b962768167d68d631db9b82f86": "Arbitrum Bridge",
};

function isEthAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

export function formatAddress(addr: string): string {
  if (!addr) return "";
  const a = addr.trim();
  if (!a.startsWith("0x") || a.length < 10) return a;
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

function normalize(addr: string): string {
  return (addr || "").trim().toLowerCase();
}

// -------------------------
// Redis (可选)：有就用，没有就跳过
// - 只在存在 REDIS_URL 且运行环境可加载 ioredis 时启用
// - ✅ 关键：避免 Next 在“构建期”因为找不到 ioredis 直接报错
// -------------------------
type RedisClientLike = {
  get: (key: string) => Promise<string | null>;
  set: (...args: any[]) => Promise<any>;
};

let redisClient: RedisClientLike | null = null;

async function initRedisIfPossible() {
  if (redisClient) return;
  const url = process.env.REDIS_URL;
  if (!url) return;

  try {
    // ✅ 用 Function 包裹，避免被 Next/TS bundler 静态解析成硬依赖
    // eslint-disable-next-line no-new-func
    const dynamicImport: (m: string) => Promise<any> = new Function(
      "m",
      "return import(m)"
    ) as any;

    const mod: any = await dynamicImport("ioredis");
    const Redis = mod?.default || mod;
    const client: any = new Redis(url);

    redisClient = {
      get: async (key: string) => {
        try {
          const v = await client.get(key);
          return v ?? null;
        } catch {
          return null;
        }
      },
      set: async (...args: any[]) => {
        try {
          return await client.set(...args);
        } catch {
          return null;
        }
      },
    };
  } catch {
    redisClient = null;
  }
}

async function redisGet(key: string): Promise<string | null> {
  await initRedisIfPossible();
  if (!redisClient) return null;
  return redisClient.get(key);
}

async function redisSet(key: string, value: string, ttlSec: number): Promise<void> {
  await initRedisIfPossible();
  if (!redisClient) return;
  try {
    // ioredis: SET key value EX ttl
    await redisClient.set(key, value, "EX", ttlSec);
  } catch {
    // ignore
  }
}

// -------------------------
// Etherscan 调用（v2）
// -------------------------
async function fetchEtherscanContractName(address: string): Promise<string | null> {
  if (!ETHERSCAN_API_KEY) return null;

  const addr = normalize(address);
  if (!isEthAddress(addr)) return null;

  const url =
    `https://api.etherscan.io/v2/api` +
    `?chainid=1&module=contract&action=getsourcecode&address=${addr}` +
    `&apikey=${encodeURIComponent(ETHERSCAN_API_KEY)}`;

  try {
    const res = await fetch(url, { method: "GET", cache: "no-store" });
    const data: any = await res.json().catch(() => null);

    const contractName =
      data?.result?.[0]?.ContractName ||
      data?.result?.[0]?.contractName ||
      null;

    if (contractName && typeof contractName === "string" && contractName.trim()) {
      return contractName.trim();
    }
    return null;
  } catch {
    return null;
  }
}

// -------------------------
// ✅ 主函数：本地 -> Redis -> Etherscan -> 短地址兜底
// -------------------------
export async function getContractLabel(address: string): Promise<string> {
  const addr = normalize(address);
  if (!isEthAddress(addr)) return formatAddress(address);

  // 1) 本地字典优先
  const local = LOCAL_CONTRACT_MAP[addr];
  if (local) return local;

  // 2) Redis cache（可选）
  const cacheKey = `wa:label:${addr}`;
  const cached = await redisGet(cacheKey);
  if (cached && cached.trim()) return cached.trim();

  // 3) Etherscan API
  const fromApi = await fetchEtherscanContractName(addr);
  if (fromApi) {
    // 写入 Redis（可选），TTL 7 天
    await redisSet(cacheKey, fromApi, 7 * 24 * 3600);
    return fromApi;
  }

  // 4) 最终兜底：短地址
  return formatAddress(addr);
}

// ✅ 输出格式：ContractName (0x....) / 或短地址
export async function getDisplayName(address: string): Promise<string> {
  const addr = normalize(address);
  if (!isEthAddress(addr)) return formatAddress(address);

  const short = formatAddress(addr);
  const label = await getContractLabel(addr);

  // label 可能就是短地址（兜底），那就直接返回
  if (!label || label === short) return short;
  return `${label} (${short})`;
}