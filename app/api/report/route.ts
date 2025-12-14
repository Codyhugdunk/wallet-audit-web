// app/api/report/route.ts
// ✅ WalletAudit Pro - Main API Route
// 已适配最新的模块接口 (Risk v2, Assets v2, Share v2)

import { NextRequest, NextResponse } from "next/server";

import { buildIdentityModule } from "./modules/identity";
import { buildAssetsModule } from "./modules/assets";
import { buildActivityModule } from "./modules/activity";
import { buildGasModule } from "./modules/gas";
import { buildRiskModule } from "./modules/risk";
import { buildSummaryModule } from "./modules/summary";
import { buildShareModule } from "./modules/share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isEthAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const addressRaw = (searchParams.get("address") || "").trim();
    const address = addressRaw.toLowerCase();

    if (!isEthAddress(address)) {
      return NextResponse.json(
        { error: "请输入合法的以太坊地址（0x 开头，40 位 hex）" },
        { status: 400 }
      );
    }

    const generatedAt = Date.now();

    // 1. 并发获取基础数据模块
    // 注意：Risk 和 Summary 依赖 Assets 和 Activity，所以必须先等它们算完
    const [identity, assets, activity, gas] = await Promise.all([
      buildIdentityModule(address),
      buildAssetsModule(address),
      buildActivityModule(address),
      buildGasModule(address),
    ]);

    // 2. 同步计算高级分析模块
    // Risk 模块现在包含了高级金融算法 (HHI, Degen Index)
    const risk = buildRiskModule(assets, activity);
    
    // Summary 模块生成自然语言总结
    const summary = buildSummaryModule(identity, assets, activity, risk);

    // 3. 生成分享卡片数据
    // ✅ 修复点：这里使用了新的接口，直接传入 risk 对象
    const share = buildShareModule(address, assets, risk);

    // 4. 组装最终报告
    const report = {
      version: "1.2", // 版本号升级
      address,
      identity,
      summary,
      assets,
      activity,
      gas,
      risk,
      share,
      meta: {
        version: "1.2",
        generatedAt,
        fromCache: false,
        // 下面这些历史字段留空，等未来开发历史记录功能时再填
        history: [],
        previousValue: null,
        valueChange: null,
        valueChangePct: null,
      },
    };

    // 5. 简单的统计埋点 (可选，防止报错)
    try {
      const statsUrl = process.env.WALLETAUDIT_STATS_HIT_URL;
      if (statsUrl) {
        // 不等待埋点结果，避免阻塞响应
        void fetch(statsUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ source: "web", address }),
          cache: "no-store",
        }).catch(() => {});
      }
    } catch {
      // ignore
    }

    return NextResponse.json(report, { status: 200 });
  } catch (err: any) {
    console.error("[api/report] unexpected error:", err);
    return NextResponse.json(
      { error: err?.message || "生成报告时出现异常，请稍后重试或联系维护者。" },
      { status: 500 }
    );
  }
}