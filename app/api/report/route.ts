// route.ts — WalletAudit v1.0
// 核心报告生成入口：整合 identity / assets / activity / gas / risk / summary / share / meta

import { NextResponse } from "next/server";

import { buildIdentityModule } from "./modules/identity";
import { buildAssetsModule } from "./modules/assets";
import { buildActivityModule } from "./modules/activity";
import { buildGasModule } from "./modules/gas";
import { buildRiskModule } from "./modules/risk";
import { buildSummaryModule } from "./modules/summary";
import { buildShareModule } from "./modules/share";
import { getEthPrice } from "./modules/prices";

import { FullReport, ReportMeta } from "./modules/types";
import {
  logPV,
  logDAU,
  pushWalletHistory,
  getWalletHistory,
} from "./utils/redis";

// 当前报告版本
const REPORT_VERSION = "1.0";

// 地址简单校验
function normalizeAddress(address: string | null | undefined): string | null {
  if (!address || typeof address !== "string") return null;
  const trimmed = address.trim();
  if (!trimmed.startsWith("0x") || trimmed.length !== 42) return null;
  return trimmed.toLowerCase();
}

// 根据历史记录计算 valueChange
function buildMeta(
  address: string,
  currentTotalValue: number,
  historyRaw: { timestamp: number; value: number }[]
): ReportMeta {
  // 最新记录在最前（LPUSH）
  const history = historyRaw.map((h) => ({
    timestamp: h.timestamp,
    totalValue: h.value,
  }));

  const previous = history.length > 1 ? history[1] : null;

  const previousValue = previous ? previous.totalValue : null;
  const valueChange =
    previousValue !== null ? currentTotalValue - previousValue : null;
  const valueChangePct =
    previousValue && previousValue !== 0
      ? valueChange! / previousValue
      : null;

  return {
    version: REPORT_VERSION,
    generatedAt: Date.now(),
    fromCache: false, // 当前未做整份报告缓存，后续可扩展
    history,
    previousValue,
    valueChange,
    valueChangePct,
  };
}

// 统一处理逻辑
async function handleReport(addressRaw: string | null | undefined) {
  const address = normalizeAddress(addressRaw);
  if (!address) {
    return NextResponse.json(
      { error: "Invalid address" },
      { status: 400 }
    );
  }

  // 日志（线上 Redis 启用，本地自动 NO-OP）
  // 不阻塞主流程
  void logPV();
  void logDAU(address);

  try {
    // 核心模块并发执行：identity / assets / activity / gas
    const [identity, assets, activity, gas] = await Promise.all([
      buildIdentityModule(address),
      buildAssetsModule(address),
      buildActivityModule(address),
      buildGasModule(address),
    ]);

    // 风险模块
    const risk = buildRiskModule(assets, activity);

    // Summary 文案
    const summary = buildSummaryModule(identity, assets, activity, risk);

    // ETH 价格（给 share 模块用；内部自带缓存）
    const ethPrice = await getEthPrice();

    // 记录当前总资产到 Redis 历史
    await pushWalletHistory(address, assets.totalValue);

    // 获取完整历史
    const historyRaw = await getWalletHistory(address);

    // Meta（包含 version / generatedAt / history / valueChange 等）
    const meta = buildMeta(address, assets.totalValue, historyRaw);

    // Share 模块（未来用于分享卡片 / OG Image）
    const share = buildShareModule(
      address,
      assets,
      ethPrice,
      meta.valueChange,
      meta.valueChangePct,
      meta.generatedAt
    );

    const report: FullReport = {
      version: REPORT_VERSION,
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

    return NextResponse.json(report, {
      status: 200,
    });
  } catch (err: any) {
    console.error("Error generating report:", err);
    return NextResponse.json(
      {
        error: "Failed to generate report",
        detail:
          typeof err?.message === "string" ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// GET /api/report?address=0x...
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address =
    searchParams.get("address") || searchParams.get("addr") || null;

  return handleReport(address);
}

// POST /api/report  { "address": "0x..." }
export async function POST(req: Request) {
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const address = body?.address ?? null;
  return handleReport(address);
}