// app/api/report/route.ts
import { NextResponse } from "next/server";
import { buildIdentityModule } from "./modules/identity";
import { buildAssetsModule } from "./modules/assets";
import { buildActivityModule } from "./modules/activity";
import { buildGasModule } from "./modules/gas";
import { buildRiskModule } from "./modules/risk";
import { buildShareModule } from "./modules/share";
import { buildSummaryModule } from "./modules/summary";
import { buildApprovalsModule } from "./modules/approvals"; // ✅ 新增：引入授权模块
import type { ReportData } from "./modules/types";

// 强制动态模式，防止 Vercel 缓存过久导致数据不刷新
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");

  // 1. 基础校验
  if (!address || !address.startsWith("0x") || address.length !== 42) {
    return NextResponse.json(
      { error: "Invalid Ethereum address format" },
      { status: 400 }
    );
  }

  try {
    const cleanAddress = address.toLowerCase();

    // 2. 并行执行所有独立的数据获取模块 (速度最快)
    // 我们把 approvals 加入到这个并发队列里
    const [identity, assets, activity, gas, approvals] = await Promise.all([
      buildIdentityModule(cleanAddress),
      buildAssetsModule(cleanAddress),
      buildActivityModule(cleanAddress),
      buildGasModule(cleanAddress),
      buildApprovalsModule(cleanAddress), // ✅ 新增：并行获取授权数据
    ]);

    // 3. 执行依赖数据的模块
    // Risk 模块依赖 Assets 和 Activity 的结果
    const risk = buildRiskModule(assets, activity);

    // Summary 模块依赖前面所有的结果
    const summary = buildSummaryModule(identity, assets, activity, risk);

    // Share 模块生成快照数据
    const share = buildShareModule(cleanAddress, assets, risk);

    // 4. 组装最终报告
    const report: ReportData = {
      version: "v2.0",
      address: cleanAddress,
      identity,
      summary,
      assets,
      activity,
      gas,
      risk,
      approvals, // ✅ 新增：放入最终返回结果
      share,
      meta: {
        version: "2.0.0",
        generatedAt: Date.now(),
        fromCache: false,
        history: [], // 暂时留空，由前端本地存储管理历史
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