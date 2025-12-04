import { Redis } from "@upstash/redis";

// 动态 ERC20 + Gas 统计版 API（带简单缓存 + 历史记录 + 对比分析 + 分享支持）

// ====== 简单内存缓存与审计历史 ======

const CACHE_TTL_MS = 60 * 1000; // 1 分钟缓存

const auditCache = new Map<string, { timestamp: number; data: any }>();
const auditHistory = new Map<string, { timestamp: number; totalValue: number }[]>();

// ====== Upstash Redis：统一与 /api/report/stats 数据结构 ======

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

async function logWalletUsage(address: string, timestamp: number) {
  try {
    const addr = address.toLowerCase();
    const today = getTodayStr();

    await Promise.all([
      // 全站总请求次数（PV）
      redis.incr("wallet_audit:pv"),

      // 历史去重钱包数
      redis.sadd("wallet_audit:unique_wallets", addr),

      // 每日访问次数（趋势）
      redis.zincrby("wallet_audit:daily", 1, today),

      // 今日 DAU：今天访问过的不同地址
      redis.sadd(`wallet_audit:daily_unique:${today}`, addr),

      // 最近访问钱包（按时间倒序）
      redis.zadd("wallet_audit:wallets", {
        score: timestamp,
        member: addr,
      }),
    ]);

    // 只保留最近 500 个钱包，防止无限增长（异步执行，不阻塞主流程）
    redis
      .zremrangebyrank("wallet_audit:wallets", 0, -501)
      .catch((e) => console.error("trim wallets zset failed", e));
  } catch (e) {
    console.error("记录 DAU 失败（不影响主流程）", e);
  }
}

// ====== 工具函数 ======

function hexToBigInt(hex?: string | null): bigint {
  if (!hex) return 0n;
  const h = hex.toLowerCase();
  if (h === "0x" || h === "0x0") return 0n;
  return BigInt(h);
}

// 一个带超时的 fetch 封装，防止被墙卡死
async function fetchJsonWithTimeout(
  url: string,
  timeoutMs: number = 4000
): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!resp.ok) {
      console.error("fetchJsonWithTimeout non-200:", resp.status);
      return null;
    }
    return await resp.json();
  } catch (e) {
    console.error("fetchJsonWithTimeout error:", (e as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ====== ETH 价格：带缓存 + 兜底 ======

const ETH_PRICE_TTL_MS = 5 * 60 * 1000; // 5 分钟
let lastEthPrice = 2600;
let lastEthPriceAt = 0;

async function fetchEthPrice(): Promise<number> {
  const now = Date.now();
  if (now - lastEthPriceAt < ETH_PRICE_TTL_MS) {
    return lastEthPrice;
  }

  try {
    const key =
      process.env.COINGECKO_DEMO_API_KEY || process.env.COINGECKO_API_KEY || "";

    const url = new URL("https://api.coingecko.com/api/v3/simple/price");
    url.searchParams.set("ids", "ethereum");
    url.searchParams.set("vs_currencies", "usd");
    if (key) url.searchParams.set("x_cg_demo_api_key", key);

    const data = await fetchJsonWithTimeout(url.toString(), 4000);
    const price = data?.ethereum?.usd;

    if (typeof price === "number" && Number.isFinite(price)) {
      lastEthPrice = price;
      lastEthPriceAt = now;
      return price;
    }

    console.error("fetchEthPrice: invalid price, use fallback 2600");
    return lastEthPrice;
  } catch {
    console.error("获取 ETH 价格失败，使用兜底价格");
    return lastEthPrice;
  }
}

// ====== Token 价格：带缓存 + 兜底 + 永不抛异常 ======
// 使用 Coingecko simple/token_price/ethereum 按合约地址查询

const TOKEN_PRICE_TTL_MS = 5 * 60 * 1000; // 5 分钟
const tokenPriceCache = new Map<string, { price: number; ts: number }>();

async function fetchTokenUsdPrices(
  contractAddresses: string[]
): Promise<Record<string, number>> {
  if (!contractAddresses || contractAddresses.length === 0) return {};

  const now = Date.now();
  const lower = contractAddresses.map((a) => a.toLowerCase());
  const unique = Array.from(new Set(lower));

  const result: Record<string, number> = {};
  const toFetch: string[] = [];

  for (const addr of unique) {
    const cached = tokenPriceCache.get(addr);
    if (cached && now - cached.ts < TOKEN_PRICE_TTL_MS) {
      result[addr] = cached.price;
    } else {
      toFetch.push(addr);
    }
  }

  // 全部命中缓存
  if (toFetch.length === 0) return result;

  try {
    const key =
      process.env.COINGECKO_DEMO_API_KEY || process.env.COINGECKO_API_KEY || "";

    const url = new URL(
      "https://api.coingecko.com/api/v3/simple/token_price/ethereum"
    );
    url.searchParams.set("vs_currencies", "usd");
    url.searchParams.set("contract_addresses", toFetch.join(","));
    if (key) url.searchParams.set("x_cg_demo_api_key", key);

    const data = await fetchJsonWithTimeout(url.toString(), 4000);
    if (!data) {
      console.error("fetchTokenUsdPrices: no data, return partial cache");
      return result;
    }

    for (const addr of toFetch) {
      const entry = data[addr];
      const price = entry?.usd;
      if (typeof price === "number" && Number.isFinite(price)) {
        result[addr] = price;
        tokenPriceCache.set(addr, { price, ts: now });
      }
    }

    return result;
  } catch (e) {
    console.error("fetchTokenUsdPrices: failed, use fallback prices");
    return result;
  }
}

async function fetchTokenBalances(address: string, rpcUrl: string) {
  try {
    const balancesPayload = {
      jsonrpc: "2.0",
      id: 42,
      method: "alchemy_getTokenBalances",
      params: [address, "erc20"],
    };

    const balancesResp = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(balancesPayload),
    });

    const balancesJson = await balancesResp.json();
    const tokenBalances = balancesJson?.result?.tokenBalances ?? [];

    const nonZero = tokenBalances.filter(
      (t: any) => hexToBigInt(t.tokenBalance) > 0n
    );
    if (nonZero.length === 0) return [];

    const metaPayloads = nonZero.map((t: any, i: number) => ({
      jsonrpc: "2.0",
      id: 1000 + i,
      method: "alchemy_getTokenMetadata",
      params: [t.contractAddress],
    }));

    const metaResp = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metaPayloads),
    });

    const metaJson = await metaResp.json();

    return nonZero.map((t: any, i: number) => {
      const meta = metaJson[i]?.result || {};
      const decimals = typeof meta.decimals === "number" ? meta.decimals : 18;
      const symbol =
        meta.symbol && meta.symbol.length > 0
          ? meta.symbol
          : (t.contractAddress as string).slice(0, 6) + "...";

      return {
        contractAddress: (t.contractAddress as string).toLowerCase(),
        rawBalance: t.tokenBalance as string,
        decimals,
        symbol,
      };
    });
  } catch (e) {
    console.error("获取 Token 余额失败", e);
    return [];
  }
}

async function fetchGasStats(address: string, rpcUrl: string) {
  try {
    const transfersPayload = {
      jsonrpc: "2.0",
      id: 99,
      method: "alchemy_getAssetTransfers",
      params: [
        {
          fromBlock: "0x0",
          toBlock: "latest",
          fromAddress: address,
          category: ["external", "erc20", "erc721", "erc1155", "specialnft"],
          withMetadata: true,
          excludeZeroValue: true,
          maxCount: "0x64",
        },
      ],
    };

    const transfersResp = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(transfersPayload),
    });

    const transfersJson = await transfersResp.json();
    const transfers = transfersJson?.result?.transfers ?? [];

    if (transfers.length === 0)
      return {
        txCount: 0,
        totalGasEth: 0,
        topTxs: [] as { hash: string; gasEth: number }[],
      };

    const receiptPayloads = transfers.map((t: any, i: number) => ({
      jsonrpc: "2.0",
      id: 200 + i,
      method: "eth_getTransactionReceipt",
      params: [t.hash],
    }));

    const receiptResp = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(receiptPayloads),
    });

    const receiptsJson = await receiptResp.json();

    const perTxGasEth: { hash: string; gasEth: number }[] = [];
    for (let i = 0; i < transfers.length; i++) {
      const r = receiptsJson[i]?.result;
      if (!r) continue;

      const gasUsed = hexToBigInt(r.gasUsed);
      const gasPrice = hexToBigInt(r.effectiveGasPrice ?? r.gasPrice);
      const gasEth = Number(gasUsed * gasPrice) / 1e18;

      perTxGasEth.push({ hash: transfers[i].hash, gasEth });
    }

    const totalGasEth = perTxGasEth.reduce((a, b) => a + b.gasEth, 0);
    const topTxs = [...perTxGasEth]
      .sort((a, b) => b.gasEth - a.gasEth)
      .slice(0, 3);

    return { txCount: transfers.length, totalGasEth, topTxs };
  } catch (e) {
    console.error("获取 Gas 统计失败", e);
    return {
      txCount: 0,
      totalGasEth: 0,
      topTxs: [] as { hash: string; gasEth: number }[],
    };
  }
}

// ====== 核心报告生成逻辑 ======

async function buildReport(
  normalizedAddress: string,
  rpcUrl: string,
  now: number
) {
  const ethPayload = {
    jsonrpc: "2.0",
    method: "eth_getBalance",
    params: [normalizedAddress, "latest"],
    id: 1,
  };

  const ethResp = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ethPayload),
  });

  const ethJson = await ethResp.json();
  const ethWei = hexToBigInt(ethJson.result);
  const ethAmount = Number(ethWei) / 1e18;

  const tokens = await fetchTokenBalances(normalizedAddress, rpcUrl);

  const ethPrice = await fetchEthPrice();
  const tokenPriceMap = await fetchTokenUsdPrices(
    tokens.map((t: any) => t.contractAddress)
  );

  const rawPositions = tokens.map((t: any) => {
    const raw = hexToBigInt(t.rawBalance);
    const amount = Number(raw) / 10 ** t.decimals;
    const price = tokenPriceMap[t.contractAddress] ?? 0;
    const value = amount * price;
    return { symbol: t.symbol, amount, value, hasPrice: price > 0 };
  });

  const positions = [
    { symbol: "ETH", amount: ethAmount, value: ethAmount * ethPrice },
    ...rawPositions
      .filter((p: any) => p.hasPrice && p.value > 0.5)
      .map(({ hasPrice, ...r }: any) => r),
  ];

  const otherTokens = rawPositions.filter(
    (p: any) => !p.hasPrice || p.value <= 0.5
  );

  const totalValue = positions.reduce((a, b) => a + b.value, 0);

  const stableSet = new Set(["USDT", "USDC", "DAI", "TUSD", "BUSD", "FDUSD"]);
  const majorSet = new Set(["ETH", "WETH", "WBTC", "STETH", "RETH"]);
  const memeSet = new Set(["PEPE", "SHIB", "DOGE", "FLOKI"]);

  let stableValue = 0,
    majorValue = 0,
    memeValue = 0,
    otherValue = 0;

  for (const p of positions) {
    if (p.value <= 0) continue;
    const sym = p.symbol.toUpperCase();

    if (stableSet.has(sym)) stableValue += p.value;
    else if (majorSet.has(sym)) majorValue += p.value;
    else if (memeSet.has(sym)) memeValue += p.value;
    else otherValue += p.value;
  }

  const allocation = [
    { category: "稳定币", value: stableValue },
    { category: "主流资产", value: majorValue },
    { category: "Meme/高风险", value: memeValue },
    { category: "其他长尾资产", value: otherValue },
  ]
    .filter((a) => a.value > 0)
    .map((a) => ({ ...a, ratio: totalValue > 0 ? a.value / totalValue : 0 }));

  const gasStats = await fetchGasStats(normalizedAddress, rpcUrl);
  const gasTotalUsd = gasStats.totalGasEth * ethPrice;

  const historyList = auditHistory.get(normalizedAddress) ?? [];
  const newPoint = { timestamp: now, totalValue };
  const updatedHistory = [...historyList, newPoint].slice(-20);
  auditHistory.set(normalizedAddress, updatedHistory);

  const previous =
    updatedHistory.length >= 2
      ? updatedHistory[updatedHistory.length - 2]
      : null;
  const previousValue = previous?.totalValue ?? null;
  const valueChange =
    previous && previous.totalValue !== 0
      ? totalValue - previous.totalValue
      : null;
  const valueChangePct =
    previous && previous.totalValue !== 0
      ? valueChange! / previous.totalValue
      : null;

  const shortAddr =
    normalizedAddress.slice(0, 6) + "..." + normalizedAddress.slice(-4);

  // ====== Top 持仓 ======
  const sortedPositions = [...positions].sort((a, b) => b.value - a.value);
  const topPos = sortedPositions[0] ?? null;
  const topHolding = topPos
    ? {
        symbol: topPos.symbol,
        value: topPos.value,
        ratio: totalValue > 0 ? topPos.value / totalValue : 0,
      }
    : null;

  // ====== 风险分析（简单规则版） ======
  const stableRatio = totalValue > 0 ? stableValue / totalValue : 0;
  const memeRatio = totalValue > 0 ? memeValue / totalValue : 0;
  const otherRatio = totalValue > 0 ? otherValue / totalValue : 0;

  let riskLevel = "未能识别风险水平";
  let riskScore = 3;
  let riskComment =
    "资产规模较小或缺乏价格数据，本工具仅提供基础参考，建议结合个人风险偏好综合判断。";

  if (totalValue >= 50) {
    const highRiskRatio = memeRatio + otherRatio;

    if (stableRatio >= 0.5 && highRiskRatio <= 0.3) {
      riskLevel = "偏保守 · 稳定币占比较高";
      riskScore = 2;
      riskComment =
        "整体以稳定币和主流资产为主，波动相对有限，更接近保守型仓位配置。可适当关注收益率与通胀风险。";
    } else if (highRiskRatio >= 0.6) {
      riskLevel = "高风险 · 高波动资产集中";
      riskScore = 5;
      riskComment =
        "仓位中高波动、长尾或 Meme 资产占比较高，净值波动可能非常剧烈。建议控制总体仓位，避免单一资产重仓。";
    } else {
      riskLevel = "中风险 · 主流资产为主";
      riskScore = 3;
      riskComment =
        "以主流资产为主，辅以一定比例的高波动资产，整体属于中等风险水平，可根据个人风险偏好做适度再平衡。";
    }

    if (gasStats.txCount > 200) {
      riskComment += " 钱包历史交易较为频繁，疑似活跃交易型账户，需关注短线波动风险。";
    } else if (gasStats.txCount > 0 && gasStats.txCount <= 5) {
      riskComment += " 交易次数较少，更接近中长期持有或冷钱包形态。";
    }
  }

  const risk = {
    level: riskLevel,
    score: riskScore,
    comment: riskComment,
    stableRatio,
    memeRatio,
    otherRatio,
    txCount: gasStats.txCount,
  };

  const share = {
    shortAddr,
    ethAmount,
    ethPrice,
    totalValue,
    valueChange,
    valueChangePct,
    timestamp: now,
  };

  return {
    address: normalizedAddress,
    totalValue,
    positions,
    allocation,
    otherTokens,
    gas: {
      txCount: gasStats.txCount,
      totalGasEth: gasStats.totalGasEth,
      totalGasUsd: gasTotalUsd,
      topTxs: gasStats.topTxs,
    },
    meta: {
      fromCache: false,
      generatedAt: now,
      previousValue,
      valueChange,
      valueChangePct,
      history: updatedHistory,
    },
    topHolding,
    risk,
    share,
  };
}

// ====== POST /api/report ======

export async function POST(req: Request) {
  const body = await req.json();
  const address = (body as any).address as string;

  if (!address || typeof address !== "string" || !address.startsWith("0x")) {
    return new Response(JSON.stringify({ error: "无效的钱包地址" }), {
      status: 400,
    });
  }

  const normalizedAddress = address.toLowerCase();
  const now = Date.now();

  const cached = auditCache.get(normalizedAddress);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    await logWalletUsage(normalizedAddress, now);

    return new Response(
      JSON.stringify({
        ...cached.data,
        meta: { ...(cached.data.meta ?? {}), fromCache: true },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const rpcUrl = process.env.ALCHEMY_RPC_URL;
  if (!rpcUrl) {
    return new Response(JSON.stringify({ error: "RPC 未配置" }), {
      status: 500,
    });
  }

  const result = await buildReport(normalizedAddress, rpcUrl, now);

  auditCache.set(normalizedAddress, { timestamp: now, data: result });
  await logWalletUsage(normalizedAddress, now);

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// ====== GET /api/report?address= ======

export async function GET(req: Request) {
  const url = new URL(req.url);
  const address = url.searchParams.get("address");

  if (!address || !address.startsWith("0x")) {
    return new Response(JSON.stringify({ error: "无效的钱包地址" }), {
      status: 400,
    });
  }

  const normalizedAddress = address.toLowerCase();
  const now = Date.now();

  const cached = auditCache.get(normalizedAddress);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    await logWalletUsage(normalizedAddress, now);

    return new Response(
      JSON.stringify({
        ...cached.data,
        meta: { ...(cached.data.meta ?? {}), fromCache: true },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const rpcUrl = process.env.ALCHEMY_RPC_URL;
  if (!rpcUrl) {
    return new Response(JSON.stringify({ error: "RPC 未配置" }), {
      status: 500,
    });
  }

  const result = await buildReport(normalizedAddress, rpcUrl, now);

  auditCache.set(normalizedAddress, { timestamp: now, data: result });
  await logWalletUsage(normalizedAddress, now);

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}