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

type Meta = {
  version: string;
  generatedAt: number;
  fromCache: boolean;
  history: { timestamp: number; totalValue: number }[];
  previousValue: number | null;
  valueChange: number | null;
  valueChangePct: number | null;
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

// ===== 安全封装对 modules 的调用，适配不同导出名称 =====

async function safeGetIdentity(address: string): Promise<Identity> {
  try {
    const mod: any = identityModule;
    const fn =
      mod.getIdentity ||
      mod.fetchIdentity ||
      mod.buildIdentity ||
      mod.default;
    if (!fn) return buildEmptyIdentity(address);
    const res = await fn(address);
    return {
      ...buildEmptyIdentity(address),
      ...(res || {}),
    };
  } catch (err) {
    console.error("[report] identity module error:", err);
    return buildEmptyIdentity(address);
  }
}

async function safeGetAssets(address: string): Promise<Assets> {
  try {
    const mod: any = assetsModule;
    const fn =
      mod.getAssets ||
      mod.fetchAssets ||
      mod.buildAssets ||
      mod.default;
    if (!fn) return buildEmptyAssets();
    const res = await fn(address);
    return {
      ...buildEmptyAssets(),
      ...(res || {}),
    };
  } catch (err) {
    console.error("[report] assets module error:", err);
    return buildEmptyAssets();
  }
}

async function safeGetActivity(address: string): Promise<Activity> {
  try {
    const mod: any = activityModule;
    const fn =
      mod.getActivity ||
      mod.fetchActivity ||
      mod.buildActivity ||
      mod.default;
    if (!fn) return buildEmptyActivity();
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

    return merged;
  } catch (err) {
    console.error("[report] activity module error:", err);
    return buildEmptyActivity();
  }
}

async function safeGetGas(address: string): Promise<GasStats> {
  try {
    const mod: any = gasModule;
    const fn =
      mod.getGasStats ||
      mod.fetchGasStats ||
      mod.buildGas ||
      mod.default;
    if (!fn) return buildEmptyGas();
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

    return merged;
  } catch (err) {
    console.error("[report] gas module error:", err);
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
    const address = searchParams.get("address")?.trim();

    if (!address || !address.startsWith("0x") || address.length !== 42) {
      return NextResponse.json(
        { error: "请输入合法的以太坊地址（0x 开头，42 位长度）" },
        { status: 400 }
      );
    }

    const generatedAt = Date.now();

    // 后端各模块并发执行，提高速度
    const [identity, assets, activity, gas] = await Promise.all([
      safeGetIdentity(address),
      safeGetAssets(address),
      safeGetActivity(address),
      safeGetGas(address),
    ]);

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
      { status: 500 }
    );
  }
}