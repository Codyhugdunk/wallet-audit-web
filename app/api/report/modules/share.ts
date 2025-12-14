// app/api/report/modules/share.ts
import { AssetsModule, ShareModule, RiskModule } from "./types";

function shortenAddress(address: string): string {
  if (!address.startsWith("0x") || address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function buildShareModule(
  address: string,
  assets: AssetsModule,
  risk: RiskModule
): ShareModule {
  return {
    shortAddr: shortenAddress(address),
    totalValue: assets.totalValue,
    riskScore: risk.score,
    riskLevel: risk.level,
  };
}