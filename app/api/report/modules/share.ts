// share.ts — WalletAudit v1.0
// 用于分享卡片 / OG Image 的核心字段封装

import { AssetModule, ShareModule } from "./types";

function shortenAddress(address: string): string {
  if (!address.startsWith("0x") || address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function buildShareModule(
  address: string,
  assets: AssetModule,
  ethPrice: number,
  valueChange: number | null,
  valueChangePct: number | null,
  timestamp: number
): ShareModule {
  const shortAddr = shortenAddress(address);
  const ethAmount = assets.eth.amount;
  const totalValue = assets.totalValue;

  return {
    shortAddr,
    ethAmount,
    ethPrice,
    totalValue,
    valueChange,
    valueChangePct,
    timestamp,
  };
}