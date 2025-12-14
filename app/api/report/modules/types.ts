// app/api/report/modules/types.ts
// 最终统一类型定义

export interface TokenBalance {
  contractAddress: string;
  symbol: string;
  decimals: number;
  amount: number;
  value: number;
  hasPrice: boolean;
}

export interface AssetAllocation {
  category: string;
  value: number;
  ratio: number;
}

export interface AssetModule {
  eth: {
    amount: number;
    value: number;
  };
  tokens: TokenBalance[];
  totalValue: number;
  allocation: AssetAllocation[];
  otherTokens: TokenBalance[];
  priceWarning: string | null;
}

export interface ActivityModule {
  txCount: number;
  activeDays: number;
  contractsInteracted: number;
  topContracts: string[];
  weeklyHistogram: { weekStart: number; count: number }[];
}

export interface GasModule {
  totalGasEth: number;
  totalGasUsd: number;
  topTxs: {
    hash: string;
    gasEth: number;
    toDisplay: string;
  }[];
}

export interface RiskModule {
  level: "Low" | "Medium" | "High";
  score: number;
  comment: string;
  stableRatio: number;
  memeRatio: number;
  otherRatio: number;
  txCount: number;
  personaType: string;
  personaTags: string[];
  metrics?: {
    hhi: number;
    degenIndex: number;
    wealthScore: number;
  };
}

export interface IdentityModule {
  address: string;
  isContract: boolean;
  createdAt: number | null;
}

export interface ShareModule {
  shortAddr: string;
  totalValue: number;
  riskScore: number;
  riskLevel: string;
}

export interface SummaryModule {
  text: string;
}