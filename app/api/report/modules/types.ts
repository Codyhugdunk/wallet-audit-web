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

export interface AssetsModule {
  eth: { amount: number; value: number };
  tokens: TokenBalance[];
  totalValue: number;
  allocation: AllocationItem[];
  otherTokens: TokenBalance[];
  priceWarning: string | null;
}
// ✅ 关键修复：添加别名，防止代码里引用 AssetModule 报错
export type AssetModule = AssetsModule;

export interface ActivityModule {
  txCount: number | string; // 支持 "20+"
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
  topTxs: { hash: string; gasEth: number; toDisplay?: string }[]; // ✅ 增加 toDisplay
}

export interface RiskModule {
  level: string;
  score: number;
  comment: string;
  stableRatio: number;
  memeRatio: number;
  otherRatio: number;
  txCount: number | string; // ✅ 兼容 ActivityModule 的类型
  personaType: string;
  personaTags: string[];
  metrics?: { // ✅ 增加 metrics 字段
    hhi: number;
    degenIndex: number;
    wealthScore: number;
  };
}

export interface ShareModule {
  shortAddr: string;
  totalValue: number;
  riskScore: number; // ✅ 新增字段
  riskLevel: string; // ✅ 新增字段
  // 移除旧字段以匹配新的实现
  // ethAmount, ethPrice, timestamp... 如果你的代码不再用，就删掉
}

export interface SummaryModule {
  text: string;
}

export interface ReportData {
  version: string;
  address: string;
  identity: IdentityModule;
  summary: SummaryModule;
  assets: AssetsModule;
  activity: ActivityModule;
  gas: GasModule;
  risk: RiskModule;
  share: ShareModule;
  meta: {
    version: string;
    generatedAt: number;
    fromCache: boolean;
    history?: any[];
  };
}