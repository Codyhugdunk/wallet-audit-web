// app/api/report/modules/types.ts

export interface TokenBalance {
  contractAddress: string;
  symbol: string;
  amount: number;
  value: number;
  decimals: number;
  hasPrice: boolean;
}

export interface AllocationItem {
  category: string;
  value: number;
  ratio: number;
}

export interface IdentityModule {
  address: string;
  isContract: boolean;
  createdAt: number | null;
}

export type AssetModule = {
  eth: { amount: number; value: number };
  tokens: TokenBalance[];
  totalValue: number;
  allocation: AllocationItem[];
  otherTokens: TokenBalance[];
  priceWarning: string | null;
}

// ✅ 新增：交易对手结构
export interface Counterparty {
  address: string;
  count: number;
  label?: string; // 比如 "Uniswap", "Binance"
  lastInteraction: number;
}

export interface ActivityModule {
  txCount: number | string;
  activeDays: number;
  contractsInteracted: number;
  topContracts: string[];
  weeklyHistogram: any[];
  recentTxs: any[];
  // ✅ 新增字段
  topCounterparties: Counterparty[];
}

export interface GasModule {
  txCount: number;
  totalGasEth: number;
  totalGasUsd: number;
  topTxs: { hash: string; gasEth: number; toDisplay?: string }[];
}

export interface RiskModule {
  level: string;
  score: number;
  comment: string;
  stableRatio: number;
  memeRatio: number;
  otherRatio: number;
  txCount: number | string;
  personaType: string;
  personaTags: string[];
  metrics?: {
    hhi: number;
    degenIndex: number;
    wealthScore: number;
  };
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

export interface ApprovalItem {
  token: string;
  spender: string;
  spenderName: string;
  amount: string;
  riskLevel: "High" | "Low";
  lastUpdated: number;
  txHash: string;
}

export interface ApprovalsModule {
  riskCount: number;
  items: ApprovalItem[];
}

export interface ReportData {
  version: string;
  address: string;
  identity: IdentityModule;
  summary: SummaryModule;
  assets: AssetModule;
  activity: ActivityModule;
  gas: GasModule;
  risk: RiskModule;
  approvals: ApprovalsModule;
  share: ShareModule;
  meta: {
    version: string;
    generatedAt: number;
    fromCache: boolean;
    history?: any[];
  };
}