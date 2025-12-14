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

export interface ActivityModule {
  txCount: number | string;
  activeDays: number;
  contractsInteracted: number;
  topContracts: string[];
  weeklyHistogram: any[];
  recentTxs: any[];
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

// ✅ 新增：授权模块定义
export interface ApprovalItem {
  token: string;
  spender: string;
  spenderName: string; // 如 "Uniswap V2" 或 "Unknown Contract"
  amount: string;      // "Unlimited" 或 具体数字
  riskLevel: "High" | "Low"; // 高危还是安全
  lastUpdated: number; // 时间戳
  txHash: string;
}

export interface ApprovalsModule {
  riskCount: number; // 高危授权数量
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
  approvals: ApprovalsModule; // ✅ 注册模块
  share: ShareModule;
  meta: {
    version: string;
    generatedAt: number;
    fromCache: boolean;
    history?: any[];
  };
}