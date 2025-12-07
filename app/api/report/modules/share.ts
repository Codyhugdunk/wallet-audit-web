// share.ts — WalletAudit v1.0
// 用于分享卡片 / OG Image 的核心字段封装

import { AssetModule, ShareModule, RiskModule } from "./types";

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

// === 新增：给 route.ts 调用的标准导出名 ===
// 这里我们只用当前资产快照，暂时不做历史涨跌计算
export function buildShareSnapshot(input: {
  address: string;
  assets: AssetModule;
  risk: RiskModule;
}): ShareModule {
  const { address, assets } = input;
  const timestamp = Date.now();

  // 从资产里反推一个大概的 ETH 单价（有就用，没有就 0）
  const ethAmount = assets.eth.amount;
  const ethValue = assets.eth.value;
  const ethPrice =
    ethAmount > 0 && ethValue > 0 ? ethValue / ethAmount : 0;

  return buildShareModule(address, assets, ethPrice, null, null, timestamp);
}