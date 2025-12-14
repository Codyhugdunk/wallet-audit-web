// app/api/report/modules/types.ts
// ✅ 全模块统一类型定义（v1.1 compatible）

export type RiskLevel = "Low" | "Medium" | "High";

export interface IdentityModule {
  address: string;
  isContract: boolean;
  createdAt: number | null; // timestamp(ms) or null
}

export interface TokenBalance {
  contractAddress: string; // lowercased
  symbol: string;
  amount: number;
  value: number; // USD
  decimals: number;
  hasPrice: boolean;
}

export interface AllocationItem {
  category: "ETH" | "Stablecoins" | "Majors" | "Meme" | "Others" | string;
  value: number; // USD
  ratio: number; // 0~1
}

export interface AssetModule {
  eth: {
    amount: number;
    value: number; // USD
  };
  tokens: TokenBalance[];
  totalValue: number; // USD
  allocation: AllocationItem[];
  otherTokens: TokenBalance[];
  priceWarning: string | null;
}

export interface WeeklyHistogramItem {
  weekStart: number; // timestamp(ms)
  count: number;
}

export interface ActivityModule {
  txCount: number;
  activeDays: number;
  contractsInteracted: number;
  topContracts: string[]; // already can be "Label (0x...)" or raw address
  weeklyHistogram: WeeklyHistogramItem[];
}

export interface GasTopTx {
  hash: string;
  gasEth: number;
  to: string; // raw address
  toDisplay?: string; // "Label (0x...)" or raw
}

export interface GasModule {
  txCount: number;
  totalGasEth: number;
  totalGasUsd: number;
  topTxs: GasTopTx[];
}

export interface RiskModule {
  level: RiskLevel;
  score: number;
  comment: string;
  stableRatio: number;
  memeRatio: number;
  otherRatio: number;
  txCount: number;
  personaType: string;
  personaTags: string[];
}

export interface SummaryModule {
  text: string;
}

export interface ShareModule {
  shortAddr: string;
  ethAmount: number;
  ethPrice: number;
  totalValue: number;
  valueChange: number | null;
  valueChangePct: number | null;
  timestamp: number;
}