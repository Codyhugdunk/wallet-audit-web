// app/api/report/route.ts
import { NextResponse } from "next/server";
import { buildIdentityModule } from "./modules/identity";
import { buildAssetsModule } from "./modules/assets";
import { buildActivityModule } from "./modules/activity";
import { buildGasModule } from "./modules/gas";
import { buildRiskModule } from "./modules/risk";
import { buildShareModule } from "./modules/share";
import { buildSummaryModule } from "./modules/summary";
import { buildApprovalsModule } from "./modules/approvals";
import type { ReportData } from "./modules/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");

  if (!address || !address.startsWith("0x") || address.length !== 42) {
    return NextResponse.json({ error: "Invalid Ethereum address format" }, { status: 400 });
  }

  try {
    const cleanAddress = address.toLowerCase();

    // 1. 基础身份 (极快)
    const identity = await buildIdentityModule(cleanAddress);

    // 2. 并行执行核心模块 (使用 allSettled 防止单点故障)
    const results = await Promise.allSettled([
      buildAssetsModule(cleanAddress),
      buildActivityModule(cleanAddress),
      buildGasModule(cleanAddress),
      buildApprovalsModule(cleanAddress),
    ]);

    // 3. 安全解包数据 (失败则给空默认值)
    const assets = results[0].status === "fulfilled" ? results[0].value : { eth: {amount:0, value:0}, tokens:[], totalValue:0, allocation:[], otherTokens:[], priceWarning:null };
    
    // ✅ 修复：补全了 topCounterparties: []
    const activity = results[1].status === "fulfilled" ? results[1].value : { 
        txCount: 0, 
        activeDays: 0, 
        contractsInteracted: 0, 
        topContracts: [], 
        weeklyHistogram: [], 
        recentTxs: [], 
        topCounterparties: [] 
    };
    
    const gas = results[2].status === "fulfilled" ? results[2].value : { txCount: 0, totalGasEth: 0, totalGasUsd: 0, topTxs: [] };
    const approvals = results[3].status === "fulfilled" ? results[3].value : { riskCount: 0, items: [] };

    // 4. 依赖计算
    const risk = buildRiskModule(assets, activity, cleanAddress);
    const summary = buildSummaryModule(identity, assets, activity, risk);
    const share = buildShareModule(cleanAddress, assets, risk);

    const report: ReportData = {
      version: "v3.0",
      address: cleanAddress,
      identity,
      summary,
      assets,
      activity,
      gas,
      risk,
      approvals,
      share,
      meta: {
        version: "3.0.0",
        generatedAt: Date.now(),
        fromCache: false,
        history: [],
      },
    };

    return NextResponse.json(report);
  } catch (error: any) {
    console.error("Report generation failed:", error);
    return NextResponse.json(
      { error: "Failed to generate report", details: error.message },
      { status: 500 }
    );
  }
}