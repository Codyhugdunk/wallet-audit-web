// app/api/report/route.ts
import { NextRequest, NextResponse } from "next/server";

// 为了兼容已有 modules，我们用 any + 运行时兜底的方式调用，
// 避免因为函数名细微差异导致整个接口崩掉。
import * as identityModule from "./modules/identity";
import * as assetsModule from "./modules/assets";
import * as activityModule from "./modules/activity";
import * as gasModule from "./modules/gas";
import * as riskModule from "./modules/risk";
import * as summaryModule from "./modules/summary";
import * as shareModule from "./modules/share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AllocationItem = {
  category: string;
  value: number;
  ratio: number;
};

type TokenBalance = {
  contractAddress: string;
  symbol: string;
  amount: number;
  value: number;
  decimals: number;
  hasPrice: boolean;
};

type Identity = {
  address: string;
  isContract: boolean;
  createdAt: number | null;
};

type Summary = {
  text: string;
};

type Assets = {
  eth: {
    amount: number;
    value: number;
  };
  tokens: TokenBalance[];
  totalValue: number;
  allocation: AllocationItem[];
  otherTokens: TokenBalance[];
  priceWarning: string | null;
};

type Activity = {
  txCount: number;
  activeDays: number;
  contractsInteracted: number;
  topContracts: string[];
  weeklyHistogram: any[];
};

type GasStats = {
  txCount: number;
  totalGasEth: number;
  totalGasUsd: number;
  topTxs: { hash: string; gasEth: number }[];
};

type Risk = {
  level: string;
  score: number;
  comment: string;
  stableRatio: number;
  memeRatio: number;
  otherRatio: number;
  txCount: number;
  personaType: string;
  personaTags: string[];
};

type Share = {
  shortAddr: string;
  ethAmount: number;
  ethPrice: number;
  totalValue: number;
  valueChange: number | null;
  valueChangePct: number | null;
  timestamp: number;
};

type ModuleDebug = {
  identityOk: boolean;
  identityError?: string;

  assetsOk: boolean;
  assetsError?: string;

  activityOk: boolean;
  activityError?: string;

  gasOk: boolean;
  gasError?: string;

  rpcFallbackUsed?: boolean;
  rpcFallbackError?: string;
};

type Meta = {
  version: string;
  generatedAt: number;
  fromCache: boolean;
  history: { timestamp: number; totalValue: number }[];
  previousValue: number | null;
  valueChange: number | null;
  valueChangePct: number | null;
  debug?: ModuleDebug;
};

type Report = {
  version: string;
  address: string;
  identity: Identity;
  summary: Summary;
  assets: Assets;
  activity: Activity;
  gas: GasStats;
  risk: Risk;
  share: Share;
  meta: Meta;
};

// ===== 一些兜底构造函数，防止 modules 出错时接口直接 500 =====

function buildEmptyIdentity(address: string): Identity {
  return {
    address,
    isContract: false,
    createdAt: null,
  };
}

function buildEmptyAssets(): Assets {
  return {
    eth: { amount: 0, value: 0 },
    tokens: [],
    totalValue: 0,
    allocation: [],
    otherTokens: [],
    priceWarning: null,
  };
}

function buildEmptyActivity(): Activity {
  return {
    txCount: 0,
    activeDays: 0,
    contractsInteracted: 0,
    topContracts: [],
    weeklyHistogram: [],
  };
}

function buildEmptyGas(): GasStats {
  return {
    txCount: 0,
    totalGasEth: 0,
    totalGasUsd: 0,
    topTxs: [],
  };
}

function buildEmptyRisk(): Risk {
  return {
    level: "Medium",
    score: 50,
    comment: "暂未能完整评估该地址的风险，仅给出中性参考评分。",
    stableRatio: 0,
    memeRatio: 0,
    otherRatio: 1,
    txCount: 0,
    personaType: "普通持仓地址",
    personaTags: [],
  };
}

function buildEmptySummary(): Summary {
  return {
    text: "暂未能为该地址生成完整描述，可能是历史数据不足或节点暂时不可用。",
  };
}

function buildEmptyShare(address: string, totalValue: number): Share {
  const now = Date.now();
  const shortAddr =
    address && address.length > 10
      ? `${address.slice(0, 6)}...${address.slice(-4)}`
      : address;

  return {
    shortAddr,
    ethAmount: 0,
    ethPrice: 0,
    totalValue,
    valueChange: null,
    valueChangePct: null,
    timestamp: now,
  };
}

// ===== 基础工具：RPC & 价格兜底 =====

async function fetchEthBalanceViaRpc(address: string): Promise<number | null> {
  const rpcUrl = process.env.ALCHEMY_RPC_URL;
  if (!rpcUrl) return null;

  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBalance",
        params: [address, "latest"],
      }),
    });

    const data: any = await res.json();
    const hex = data?.result;
    if (!hex || typeof hex !== "string") return null;

    // 十六进制 wei -> ETH
    const wei = BigInt(hex);
    const eth = Number(wei) / 1e18;
    if (!Number.isFinite(eth)) return null;

    return eth;
  } catch (err) {
    console.error("[report] fetchEthBalanceViaRpc error:", err);
    return null;
  }
}

async function fetchEthPriceFromApi(): Promise<number | null> {
  try {
    const priceProxyBase = process.env.PRICE_PROXY_BASE;
    const cgKey = process.env.COINGECKO_DEMO_API_KEY;

    // 优先走你现有的 price-proxy
    if (priceProxyBase) {
      const res = await fetch(
        `${priceProxyBase.replace(/\/$/, "")}/api/price-proxy?symbol=eth`,
        { cache: "no-store" },
      );
      if (!res.ok) return null;
      const data: any = await res.json();
      const p =
        typeof data?.price === "number"
          ? data.price
          : typeof data?.usd === "number"
          ? data.usd
          : null;
      if (p && p > 0) return p;
      return null;
    }

    // 退而求其次：直接请求 CoinGecko
    const url =
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd" +
      (cgKey ? `&x_cg_demo_api_key=${cgKey}` : "");

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data: any = await res.json();
    const p = data?.ethereum?.usd;
    if (typeof p === "number" && p > 0) return p;
    return null;
  } catch (err) {
    console.error("[report] fetchEthPriceFromApi error:", err);
    return null;
  }
}

async function getEthPriceWithFallback(): Promise<number> {
  const fallback = 2600; // 本地 / 极端情况兜底
  const price = await fetchEthPriceFromApi();
  if (price && price > 0) return price;
  return fallback;
}

// ===== 安全封装对 modules 的调用，适配不同导出名称 =====

async function safeGetIdentity(
  address: string,
  debug: ModuleDebug,
): Promise<Identity> {
  try {
    const mod: any = identityModule;
    const fn =
      mod.getIdentity ||
      mod.fetchIdentity ||
      mod.buildIdentity ||
      mod.default;
    if (!fn) {
      debug.identityOk = false;
      debug.identityError = "NO_IDENTITY_FN";
      return buildEmptyIdentity(address);
    }
    const res = await fn(address);
    debug.identityOk = true;
    return {
      ...buildEmptyIdentity(address),
      ...(res || {}),
    };
  } catch (err: any) {
    console.error("[report] identity module error:", err);
    debug.identityOk = false;
    debug.identityError = String(err?.message || err);
    return buildEmptyIdentity(address);
  }
}

async function safeGetAssets(
  address: string,
  debug: ModuleDebug,
): Promise<Assets> {
  try {
    const mod: any = assetsModule;
    const fn =
      mod.getAssets ||
      mod.fetchAssets ||
      mod.buildAssets ||
      mod.default;
    if (!fn) {
      debug.assetsOk = false;
      debug.assetsError = "NO_ASSETS_FN";
      return buildEmptyAssets();
    }
    const res = await fn(address);
    debug.assetsOk = true;
    return {
      ...buildEmptyAssets(),
      ...(res || {}),
    };
  } catch (err: any) {
    console.error("[report] assets module error:", err);
    debug.assetsOk = false;
    debug.assetsError = String(err?.message || err);
    return buildEmptyAssets();
  }
}

async function safeGetActivity(
  address: string,
  debug: ModuleDebug,
): Promise<Activity> {
  try {
    const mod: any = activityModule;
    const fn =
      mod.getActivity ||
      mod.fetchActivity ||
      mod.buildActivity ||
      mod.default;
    if (!fn) {
      debug.activityOk = false;
      debug.activityError = "NO_ACTIVITY_FN";
      return buildEmptyActivity();
    }
    const res = await fn(address);
    const base = buildEmptyActivity();
    const merged: Activity = {
      ...base,
      ...(res || {}),
    };

    // 这里统一一下 weeklyHistogram 结构，方便前端画图
    if (Array.isArray(merged.weeklyHistogram)) {
      merged.weeklyHistogram = merged.weeklyHistogram
        .map((item: any) => {
          const count =
            typeof item?.count === "number"
              ? item.count
              : typeof item?.value === "number"
              ? item.value
              : 0;

          const label =
            item?.label ??
            item?.weekLabel ??
            item?.week ??
            null;

          if (!label) return null;

          return {
            label,
            count: Number.isFinite(count) ? count : 0,
          };
        })
        .filter((x: any) => !!x);
    } else {
      merged.weeklyHistogram = [];
    }

    debug.activityOk = true;
    return merged;
  } catch (err: any) {
    console.error("[report] activity module error:", err);
    debug.activityOk = false;
    debug.activityError = String(err?.message || err);
    return buildEmptyActivity();
  }
}

async function safeGetGas(
  address: string,
  debug: ModuleDebug,
): Promise<GasStats> {
  try {
    const mod: any = gasModule;
    const fn =
      mod.getGasStats ||
      mod.fetchGasStats ||
      mod.buildGas ||
      mod.default;
    if (!fn) {
      debug.gasOk = false;
      debug.gasError = "NO_GAS_FN";
      return buildEmptyGas();
    }
    const res = await fn(address);
    const base = buildEmptyGas();
    const merged: GasStats = {
      ...base,
      ...(res || {}),
    };

    // topTxs 至少是数组
    if (!Array.isArray(merged.topTxs)) {
      merged.topTxs = [];
    }

    debug.gasOk = true;
    return merged;
  } catch (err: any) {
    console.error("[report] gas module error:", err);
    debug.gasOk = false;
    debug.gasError = String(err?.message || err);
    return buildEmptyGas();
  }
}

function safeGetRisk(input: {
  identity: Identity;
  assets: Assets;
  activity: Activity;
  gas: GasStats;
}): Risk {
  try {
    const mod: any = riskModule;
    const fn =
      mod.getRiskAssessment ||
      mod.buildRisk ||
      mod.assessRisk ||
      mod.default;
    if (!fn) return buildEmptyRisk();
    const res = fn(input);
    return {
      ...buildEmptyRisk(),
      ...(res || {}),
    };
  } catch (err) {
    console.error("[report] risk module error:", err);
    return buildEmptyRisk();
  }
}

function safeGetSummary(input: {
  identity: Identity;
  assets: Assets;
  activity: Activity;
  gas: GasStats;
  risk: Risk;
}): Summary {
  try {
    const mod: any = summaryModule;
    const fn =
      mod.buildSummary ||
      mod.getSummary ||
      mod.default;
    if (!fn) return buildEmptySummary();
    const res = fn(input);
    return {
      ...buildEmptySummary(),
      ...(res || {}),
    };
  } catch (err) {
    console.error("[report] summary module error:", err);
    return buildEmptySummary();
  }
}

function safeGetShare(input: {
  address: string;
  assets: Assets;
  risk: Risk;
}): Share {
  try {
    const mod: any = shareModule;
    const fn =
      mod.buildShareSnapshot ||
      mod.buildShare ||
      mod.getShare ||
      mod.default;
    if (!fn) return buildEmptyShare(input.address, input.assets.totalValue);
    const res = fn(input);
    return {
      ...buildEmptyShare(input.address, input.assets.totalValue),
      ...(res || {}),
    };
  } catch (err) {
    console.error("[report] share module error:", err);
    return buildEmptyShare(input.address, input.assets.totalValue);
  }
}

// ===== 主处理函数 =====

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const addressRaw = searchParams.get("address")?.trim();
    const address =
      addressRaw && addressRaw.startsWith("0x")
        ? addressRaw
        : "";

    if (!address || address.length !== 42) {
      return NextResponse.json(
        { error: "请输入合法的以太坊地址（0x 开头，42 位长度）" },
        { status: 400 },
      );
    }

    const generatedAt = Date.now();

    const debug: ModuleDebug = {
      identityOk: false,
      assetsOk: false,
      activityOk: false,
      gasOk: false,
    };

    // 后端各模块并发执行，提高速度
    const [identity, rawAssets, activity, gas] = await Promise.all([
      safeGetIdentity(address, debug),
      safeGetAssets(address, debug),
      safeGetActivity(address, debug),
      safeGetGas(address, debug),
    ]);

    let assets = rawAssets;

    // ===== 关键补丁：如果 assets 模块返回 0，总资产走 RPC 兜底 =====
    try {
      const needRpcFallback =
        (!assets || (!assets.eth?.amount && !assets.totalValue)) &&
        !!process.env.ALCHEMY_RPC_URL;

      if (needRpcFallback) {
        const ethAmount = await fetchEthBalanceViaRpc(address);
        if (ethAmount !== null && ethAmount > 0) {
          const ethPrice = await getEthPriceWithFallback();
          const totalValue = ethAmount * ethPrice;

          assets = {
            ...buildEmptyAssets(),
            ...(assets || {}),
            eth: {
              amount: ethAmount,
              value: totalValue,
            },
            totalValue,
          };

          debug.rpcFallbackUsed = true;
        }
      }
    } catch (err: any) {
      console.error("[report] rpc fallback error:", err);
      debug.rpcFallbackError = String(err?.message || err);
    }

    const risk = safeGetRisk({ identity, assets, activity, gas });
    const summary = safeGetSummary({ identity, assets, activity, gas, risk });
    const share = safeGetShare({ address, assets, risk });

    const meta: Meta = {
      version: "1.1",
      generatedAt,
      fromCache: false, // 如果你内部有 Redis 缓存，可以在 modules 里带个标志出来再写回来
      history: [],
      previousValue: null,
      valueChange: null,
      valueChangePct: null,
      debug,
    };

    const report: Report = {
      version: "1.1",
      address,
      identity,
      summary,
      assets,
      activity,
      gas,
      risk,
      share,
      meta,
    };

    // 如果你之前在这里做 Upstash 统计，这里可以补上异步 fire-and-forget
    // 不影响主流程
    try {
      const statsUrl = process.env.WALLETAUDIT_STATS_HIT_URL;
      if (statsUrl) {
        fetch(statsUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ source: "web", address }),
          cache: "no-store",
        }).catch(() => {});
      }
    } catch {
      // 忽略统计错误
    }

    return NextResponse.json(report, { status: 200 });
  } catch (err: any) {
    console.error("[report] unexpected error:", err);
    return NextResponse.json(
      {
        error:
          err?.message ||
          "生成报告时出现异常，请稍后重试或联系维护者。",
      },
      { status: 500 },
    );
  }
}