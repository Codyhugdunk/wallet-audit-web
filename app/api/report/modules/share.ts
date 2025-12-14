// app/api/report/modules/share.ts
import { AssetModule, ShareModule, RiskModule } from "./types";

function shortenAddress(address: string): string {
  if (!address.startsWith("0x") || address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function buildShareModule(
  address: string,
  assets: AssetModule,
  risk: RiskModule // ✅ 新增参数，方便获取 riskScore
): ShareModule {
  const shortAddr = shortenAddress(address);
  const ethAmount = assets.eth.amount;
  const totalValue = assets.totalValue;

  return {
    shortAddr,
    totalValue,
    riskScore: risk.score, // ✅ 使用 Risk 模块算出来的分
    riskLevel: risk.level, // ✅ 使用 Risk 模块算出来的等级
  };
}

export function buildShareSnapshot(input: {
  address: string;
  assets: AssetModule;
  risk: RiskModule;
}): ShareModule {
  // 直接调用上面的函数，保持逻辑统一
  return buildShareModule(input.address, input.assets, input.risk);
}